import { randomUUID } from "node:crypto";
import type { EvaluationProvider } from "./ports/evaluation-provider.port.js";
import type { LLMProvider } from "./ports/llm-provider.port.js";
import type { MemoryProvider } from "./ports/memory-provider.port.js";
import type { ObservabilityProvider } from "./ports/observability-provider.port.js";
import type { RagProvider } from "./ports/rag-provider.port.js";
import type {
  DebugEnvelope,
  ExplainableRun,
  FrameworkInput,
  FrameworkSummary,
  ProviderStatus,
} from "./types.js";
import { buildWorkflow } from "./workflow/graph.js";

export interface FrameworkEngineDeps {
  rag: RagProvider;
  memory: MemoryProvider;
  llm: LLMProvider;
  evaluator: EvaluationProvider;
  obs: ObservabilityProvider;
  providerStatus: ProviderStatus[];
  debug: DebugEnvelope;
  topK?: number;
  maxContextTokens?: number;
}

/**
 * The framework engine assembles an ExplainableRun.
 *
 *   Orchestration:  LangGraph
 *   Retrieval:      LlamaIndex.TS (or LocalRagProvider stub)
 *   Memory:         Mem0 (or LocalMemoryProvider stub)
 *   Generation:     OpenAI (or LocalLLMProvider stub)
 *   Evaluation:     Ragas-shaped deterministic stub (real Ragas TODO Phase 5)
 *   Observability:  Langfuse (or LocalObservabilityProvider stub)
 *
 * Providers self-report mode (real | stub | fallback) via providerStatus.
 * The 7th workflow node, buildExplainableRunNode, derives failure modes
 * from the final state and provider status.
 */
export class FrameworkEngine {
  private readonly rag: RagProvider;
  private readonly memory: MemoryProvider;
  private readonly llm: LLMProvider;
  private readonly evaluator: EvaluationProvider;
  private readonly obs: ObservabilityProvider;
  private readonly providerStatus: ProviderStatus[];
  private readonly baseDebug: DebugEnvelope;
  private readonly topK: number;
  private readonly maxContextTokens: number;
  private readonly workflow: ReturnType<typeof buildWorkflow>;

  constructor(deps: FrameworkEngineDeps) {
    this.rag = deps.rag;
    this.memory = deps.memory;
    this.llm = deps.llm;
    this.evaluator = deps.evaluator;
    this.obs = deps.obs;
    this.providerStatus = deps.providerStatus;
    this.baseDebug = deps.debug;
    this.topK = deps.topK ?? 5;
    this.maxContextTokens = deps.maxContextTokens ?? 4000;

    this.workflow = buildWorkflow({
      rag: this.rag,
      memory: this.memory,
      llm: this.llm,
      evaluator: this.evaluator,
      obs: this.obs,
      providerStatus: this.providerStatus,
      topK: this.topK,
      maxContextTokens: this.maxContextTokens,
    });
  }

  async run(input: FrameworkInput): Promise<ExplainableRun> {
    const runId = `run_${randomUUID()}`;
    const startedAt = Date.now();
    const startedIso = new Date(startedAt).toISOString();

    await this.obs.startTrace({
      runId,
      userId: input.userId,
      message: input.message,
    });

    const result = await this.workflow.invoke({
      input,
      runId,
      startedAt,
    });

    const finishedAt = Date.now();
    const totalDurationMs = finishedAt - startedAt;

    await this.obs.endTrace({
      runId,
      finalAnswer: result.answer,
      totalDurationMs,
    });

    const events = await this.obs.getEvents(runId);

    const debug: DebugEnvelope = {
      ...this.baseDebug,
      workflow: {
        nodeOrder: result.graphSteps.map((s) => s.name),
        skippedNodes: result.graphSteps.filter((s) => s.status === "skipped").map((s) => s.name),
        failedNodes: result.graphSteps.filter((s) => s.status === "failed").map((s) => s.name),
      },
    };

    const explainable: ExplainableRun = {
      runId,
      input,
      route: result.route ?? {
        mode: "auto",
        useDocuments: false,
        useMemory: false,
        useLongContext: false,
        reason: "(no route)",
        confidence: 0,
      },
      providerStatus: this.providerStatus,
      graphSteps: result.graphSteps,
      retrievedDocuments: result.documents,
      retrievedMemories: result.memories,
      finalContext: result.context ?? {
        systemPrompt: "",
        memoryBlock: "",
        documentBlock: "",
        finalPrompt: "",
        tokensEstimate: 0,
      },
      answer: result.answer,
      evaluations: result.evaluations ?? {
        faithfulness: { name: "faithfulness", score: 0, explanation: "" },
        contextRelevance: { name: "context_relevance", score: 0, explanation: "" },
        answerRelevance: { name: "answer_relevance", score: 0, explanation: "" },
        custom: [],
        warnings: [],
      },
      trace: events,
      failureModes: result.failureModes,
      debug,
      meta: {
        startedAt: startedIso,
        finishedAt: new Date(finishedAt).toISOString(),
        totalDurationMs,
        frameworks: this.frameworkSummary(),
      },
    };

    return explainable;
  }

  private frameworkSummary(): FrameworkSummary {
    return {
      orchestration: { name: "langgraph", mode: "real", version: "1.x" },
      rag: {
        name: this.rag.name,
        mode: this.rag.mode,
        ...(this.rag.version ? { version: this.rag.version } : {}),
      },
      memory: {
        name: this.memory.name,
        mode: this.memory.mode,
        ...(this.memory.version ? { version: this.memory.version } : {}),
      },
      llm: {
        name: this.llm.name,
        mode: this.llm.mode,
        ...(this.llm.version ? { version: this.llm.version } : {}),
      },
      evaluation: {
        name: this.evaluator.name,
        mode: this.evaluator.mode,
        ...(this.evaluator.version ? { version: this.evaluator.version } : {}),
      },
      observability: {
        name: this.obs.name,
        mode: this.obs.mode,
        ...(this.obs.version ? { version: this.obs.version } : {}),
      },
    };
  }
}
