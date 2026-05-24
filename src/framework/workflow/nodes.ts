import { randomUUID } from "node:crypto";
import type { LLMProvider } from "../ports/llm-provider.port.js";
import type { MemoryProvider } from "../ports/memory-provider.port.js";
import type { RagProvider } from "../ports/rag-provider.port.js";
import type { EvaluationProvider } from "../ports/evaluation-provider.port.js";
import type { ObservabilityProvider } from "../ports/observability-provider.port.js";
import type {
  FailureMode,
  FailureModeType,
  FinalContext,
  ProviderStatus,
  Route,
  RetrievedDocument,
  RetrievedMemory,
} from "../types.js";
import { runStep, skippedStep } from "./node-helpers.js";
import type { WorkflowStateType, WorkflowStateUpdate } from "./state.js";

export interface NodeDeps {
  rag: RagProvider;
  memory: MemoryProvider;
  llm: LLMProvider;
  evaluator: EvaluationProvider;
  obs: ObservabilityProvider;
  providerStatus: ProviderStatus[];
  topK: number;
  maxContextTokens: number;
}

// ---------- 1. classifyIntentNode ----------

const MEMORY_SIGNALS = [
  "remember", "last time", "again", "why do i", "my pattern",
  "что я", "почему я снова", "мы обсуждали", "застрял", "паттерн",
];
const DOCUMENT_SIGNALS = [
  "according to", "in the document", "from the file", "wiki", "theory",
  "документ", "файл", "теори", "спека",
];

export function classifyIntentNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    const message = state.input.message;
    const forced = state.input.mode;

    const result = await runStep<Route>(
      {
        name: "classifyIntentNode",
        framework: "langgraph",
        providerMode: "real",
        inputSummary: `mode=${forced ?? "auto"} message="${truncate(message, 60)}"`,
      },
      async () => {
        const route = decideRoute(message, forced);
        return {
          outputSummary: `route=${route.mode} confidence=${route.confidence.toFixed(2)}`,
          value: route,
          metadata: {
            useDocuments: route.useDocuments,
            useMemory: route.useMemory,
            useLongContext: route.useLongContext,
          },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    const update: WorkflowStateUpdate = { graphSteps: [result.step] };
    if (result.value) update.route = result.value;
    return update;
  };
}

function decideRoute(message: string, mode: string | undefined): Route {
  if (mode === "rag") {
    return { mode: "rag", useDocuments: true, useMemory: false, useLongContext: false, reason: "Forced rag mode.", confidence: 1 };
  }
  if (mode === "memory") {
    return { mode: "memory", useDocuments: false, useMemory: true, useLongContext: false, reason: "Forced memory mode.", confidence: 1 };
  }
  if (mode === "long_context") {
    return { mode: "long_context", useDocuments: false, useMemory: false, useLongContext: true, reason: "Forced long_context mode.", confidence: 1 };
  }
  if (mode === "hybrid") {
    return { mode: "hybrid", useDocuments: true, useMemory: true, useLongContext: false, reason: "Forced hybrid mode.", confidence: 1 };
  }
  const lower = message.toLowerCase();
  const needsMemory = MEMORY_SIGNALS.some((s) => lower.includes(s));
  const needsDocs = DOCUMENT_SIGNALS.some((s) => lower.includes(s));
  if (needsMemory && needsDocs) {
    return { mode: "hybrid", useDocuments: true, useMemory: true, useLongContext: false, reason: "Both memory and document signals matched.", confidence: 0.85 };
  }
  if (needsMemory) {
    return { mode: "memory", useDocuments: false, useMemory: true, useLongContext: false, reason: "Memory signals matched.", confidence: 0.75 };
  }
  if (needsDocs) {
    return { mode: "rag", useDocuments: true, useMemory: false, useLongContext: false, reason: "Document signals matched.", confidence: 0.75 };
  }
  return { mode: "hybrid", useDocuments: true, useMemory: true, useLongContext: false, reason: "Default exploratory route.", confidence: 0.55 };
}

// ---------- 2. retrieveDocumentsNode ----------

export function retrieveDocumentsNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    const route = state.route;
    if (!route?.useDocuments) {
      const step = skippedStep(
        {
          name: "retrieveDocumentsNode",
          framework: deps.rag.framework,
          providerMode: deps.rag.mode,
          inputSummary: `route.useDocuments=false`,
        },
        "route disabled documents"
      );
      await deps.obs.logStep({ runId: state.runId, step });
      return { graphSteps: [step], documents: [] };
    }

    const result = await runStep<RetrievedDocument[]>(
      {
        name: "retrieveDocumentsNode",
        framework: deps.rag.framework,
        providerMode: deps.rag.mode,
        inputSummary: `query="${truncate(state.input.message, 60)}" topK=${deps.topK}`,
      },
      async () => {
        const docs = await deps.rag.search({
          query: state.input.message,
          topK: deps.topK,
        });
        return {
          outputSummary: `${docs.length} document chunks (top score=${docs[0]?.score.toFixed(2) ?? "n/a"})`,
          value: docs,
          metadata: { provider: deps.rag.name, mode: deps.rag.mode },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    return { graphSteps: [result.step], documents: result.value ?? [] };
  };
}

// ---------- 3. retrieveMemoriesNode ----------

export function retrieveMemoriesNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    const route = state.route;
    if (!route?.useMemory) {
      const step = skippedStep(
        {
          name: "retrieveMemoriesNode",
          framework: deps.memory.framework,
          providerMode: deps.memory.mode,
          inputSummary: "route.useMemory=false",
        },
        "route disabled memory"
      );
      await deps.obs.logStep({ runId: state.runId, step });
      return { graphSteps: [step], memories: [] };
    }

    const result = await runStep<RetrievedMemory[]>(
      {
        name: "retrieveMemoriesNode",
        framework: deps.memory.framework,
        providerMode: deps.memory.mode,
        inputSummary: `userId=${state.input.userId} topK=${deps.topK}`,
      },
      async () => {
        const mems = await deps.memory.search({
          userId: state.input.userId,
          query: state.input.message,
          topK: deps.topK,
        });
        return {
          outputSummary: `${mems.length} memories (top score=${mems[0]?.score.toFixed(2) ?? "n/a"})`,
          value: mems,
          metadata: { provider: deps.memory.name, mode: deps.memory.mode },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    return { graphSteps: [result.step], memories: result.value ?? [] };
  };
}

// ---------- 4. buildContextNode ----------

export function buildContextNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    const result = await runStep<FinalContext>(
      {
        name: "buildContextNode",
        framework: "langgraph",
        providerMode: "real",
        inputSummary: `docs=${state.documents.length} mems=${state.memories.length}`,
      },
      async () => {
        const context = buildFinalContext({
          message: state.input.message,
          documents: state.documents,
          memories: state.memories,
        });
        return {
          outputSummary: `prompt=${context.tokensEstimate}t (sys+ctx)`,
          value: context,
          metadata: {
            includedDocs: state.documents.length,
            includedMems: state.memories.length,
            maxContextTokens: deps.maxContextTokens,
          },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    return { graphSteps: [result.step], context: result.value ?? null };
  };
}

function buildFinalContext(args: {
  message: string;
  documents: RetrievedDocument[];
  memories: RetrievedMemory[];
}): FinalContext {
  const systemPrompt = [
    "You are a grounded RAG Memory assistant.",
    "Use only the provided memory and document context.",
    "If context is insufficient, say so. Do not invent user facts.",
    "Cite sources using [Source N] and [Memory N] tags.",
  ].join(" ");

  const memoryBlock = args.memories
    .map((m, i) => `[Memory ${i + 1} | type=${m.type} | score=${m.score.toFixed(2)}]\n${m.content}`)
    .join("\n\n");

  const documentBlock = args.documents
    .map((d, i) => `[Source ${i + 1} | ${d.title} | score=${d.score.toFixed(2)}]\n${d.content}`)
    .join("\n\n");

  const finalPrompt = [
    systemPrompt,
    "",
    "User message:",
    args.message,
    "",
    "Relevant memories:",
    memoryBlock || "(none)",
    "",
    "Relevant documents:",
    documentBlock || "(none)",
    "",
    "Answer:",
  ].join("\n");

  return {
    systemPrompt,
    memoryBlock,
    documentBlock,
    finalPrompt,
    tokensEstimate: Math.ceil(finalPrompt.length / 4),
  };
}

// ---------- 5. generateAnswerNode ----------

export function generateAnswerNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    if (!state.route || !state.context) {
      const step = skippedStep(
        {
          name: "generateAnswerNode",
          framework: deps.llm.framework,
          providerMode: deps.llm.mode,
          inputSummary: "missing route or context",
        },
        "no route/context"
      );
      await deps.obs.logStep({ runId: state.runId, step });
      return { graphSteps: [step], answer: "" };
    }

    const route = state.route;
    const context = state.context;

    const result = await runStep<string>(
      {
        name: "generateAnswerNode",
        framework: deps.llm.framework,
        providerMode: deps.llm.mode,
        inputSummary: `prompt=${context.tokensEstimate}t`,
      },
      async () => {
        const answer = await deps.llm.generate({
          message: state.input.message,
          route,
          context,
        });
        return {
          outputSummary: `answer length=${answer.length}`,
          value: answer,
          metadata: { provider: deps.llm.name, mode: deps.llm.mode, version: deps.llm.version },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    return { graphSteps: [result.step], answer: result.value ?? "" };
  };
}

// ---------- 6. evaluateAnswerNode ----------

export function evaluateAnswerNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    if (!state.route || !state.context) {
      const step = skippedStep(
        {
          name: "evaluateAnswerNode",
          framework: deps.evaluator.framework,
          providerMode: deps.evaluator.mode,
          inputSummary: "missing route or context",
        },
        "no route/context"
      );
      await deps.obs.logStep({ runId: state.runId, step });
      return { graphSteps: [step] };
    }

    const route = state.route;
    const context = state.context;

    const result = await runStep(
      {
        name: "evaluateAnswerNode",
        framework: deps.evaluator.framework,
        providerMode: deps.evaluator.mode,
        inputSummary: `answer=${state.answer.length}c docs=${state.documents.length} mems=${state.memories.length}`,
      },
      async () => {
        const evals = await deps.evaluator.evaluate({
          question: state.input.message,
          answer: state.answer,
          route,
          context,
          documents: state.documents,
          memories: state.memories,
        });
        return {
          outputSummary: `faithfulness=${evals.faithfulness.score} answerRel=${evals.answerRelevance.score} contextRel=${evals.contextRelevance.score}`,
          value: evals,
          metadata: { provider: deps.evaluator.name, mode: deps.evaluator.mode },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    const update: WorkflowStateUpdate = { graphSteps: [result.step] };
    if (result.value) update.evaluations = result.value;
    return update;
  };
}

// ---------- 7. buildExplainableRunNode ----------

/**
 * Final node. Synthesises failure modes from collected state + provider status.
 * Does not modify retrieved items; only enriches the trace.
 */
export function buildExplainableRunNode(deps: NodeDeps) {
  return async (state: WorkflowStateType): Promise<WorkflowStateUpdate> => {
    const result = await runStep(
      {
        name: "buildExplainableRunNode",
        framework: "langgraph",
        providerMode: "real",
        inputSummary: `docs=${state.documents.length} mems=${state.memories.length} ctxToken=${state.context?.tokensEstimate ?? 0}`,
      },
      async () => {
        const failures = detectFailureModes(state, deps.providerStatus);
        return {
          outputSummary: `${failures.length} failure mode(s) detected`,
          value: failures,
          metadata: {
            providerSummary: deps.providerStatus.map((p) => `${p.role}=${p.mode}`).join(", "),
          },
        };
      }
    );
    await deps.obs.logStep({ runId: state.runId, step: result.step });

    return {
      graphSteps: [result.step],
      failureModes: result.value ?? [],
    };
  };
}

function detectFailureModes(
  state: WorkflowStateType,
  providerStatus: ProviderStatus[]
): FailureMode[] {
  const failures: FailureMode[] = [];

  const push = (type: FailureModeType, description: string, severity: FailureMode["severity"] = "warn") => {
    failures.push({
      id: `fm_${randomUUID()}`,
      type,
      description,
      severity,
    });
  };

  // --- Provider honesty ---
  for (const p of providerStatus) {
    if (p.mode === "fallback") {
      push(
        "provider_fallback_used",
        `${p.role}: real provider unavailable, using ${p.name}. ${p.reason}`,
        "warn"
      );
    }
    if (p.role === "evaluation" && p.mode === "stub") {
      push(
        "evaluation_stub_used",
        `Evaluation uses Ragas-shaped heuristics, not real Ragas. Scores are deterministic, not LLM-judged.`,
        "info"
      );
    }
    if (p.role === "observability" && p.mode !== "real") {
      push(
        "missing_observability_keys",
        `Observability is ${p.mode}; traces are local-only. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable Langfuse.`,
        "info"
      );
    }
  }

  // --- Retrieval signals ---
  if (state.route?.useDocuments && state.documents.length === 0) {
    push(
      "no_documents_retrieved",
      "Route requested document retrieval but no chunks were returned.",
      "warn"
    );
  }
  if (state.route?.useMemory && state.memories.length === 0) {
    push(
      "no_memories_retrieved",
      "Route requested memory retrieval but no memories were returned.",
      "warn"
    );
  }

  // --- Context signals ---
  if (state.context && state.context.tokensEstimate === 0) {
    push("empty_context", "Final context is empty.", "critical");
  }

  // --- Evaluation signals ---
  if (state.evaluations) {
    if (state.evaluations.contextRelevance.score < 0.3) {
      push(
        "low_context_relevance",
        `Context relevance is low (${state.evaluations.contextRelevance.score}). Retrieved items may be off-topic.`,
        "warn"
      );
    }
    const topScore = Math.max(
      0,
      ...state.documents.map((d) => d.score),
      ...state.memories.map((m) => m.score)
    );
    if (topScore < 0.3 && state.documents.length + state.memories.length > 0) {
      push(
        "low_retrieval_score",
        `Top retrieval score is ${topScore.toFixed(2)} (<0.3). Grounding is weak.`,
        "warn"
      );
    }
  }

  // --- Route signals ---
  if (state.route?.useDocuments && state.documents.length === 0 && state.route.useMemory) {
    push(
      "route_mismatch",
      "Hybrid route picked but documents missing; consider memory-only.",
      "info"
    );
  }

  return failures;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
