import { mergeWithDefaultConfig } from "./config.js";
import { newRunId } from "./ids.js";
import type {
  RagMemoryInput,
  RagMemoryOutput,
  RetrievalHit,
  DocumentChunk,
  MemoryRecord,
} from "./types.js";
import type { RouterService } from "../services/router.service.js";
import type { FakeRetrievalService } from "../services/fake-retrieval.service.js";
import type { ContextBuilderService } from "../services/context-builder.service.js";
import type { FakeLLMService } from "../services/fake-llm.service.js";
import type { MemoryWritePolicyService } from "../services/memory-write-policy.service.js";
import type { EvaluationService } from "../services/evaluation.service.js";
import type { TraceService } from "../services/trace.service.js";

export class RagMemoryEngine {
  constructor(
    private readonly router: RouterService,
    private readonly retrieval: FakeRetrievalService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly llm: FakeLLMService,
    private readonly memoryWritePolicy: MemoryWritePolicyService,
    private readonly evaluation: EvaluationService,
    private readonly trace: TraceService
  ) {}

  async run(input: RagMemoryInput): Promise<RagMemoryOutput> {
    const startedAt = Date.now();
    const runId = newRunId();
    const config = mergeWithDefaultConfig(input.config);

    this.trace.add(runId, "input_received", "Input received", {
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      messageLength: input.message.length,
      requestedMode: input.mode ?? "auto",
    });

    // ---------- Route ----------
    const route = this.router.decide(input.message, input.mode);
    this.trace.add(runId, "intent_detected", "Intent classified", {
      memoryNeeded: route.useMemory,
      documentsNeeded: route.useDocuments,
      longContextNeeded: route.useLongContext,
    });
    this.trace.add(runId, "route_selected", "Route selected", { ...route });

    // ---------- Retrieve documents ----------
    let documentHits: RetrievalHit<DocumentChunk>[] = [];
    if (route.useDocuments) {
      documentHits = this.retrieval.retrieveDocuments(
        input.message,
        config.retrieval.topK
      );
    }
    this.trace.add(runId, "documents_retrieved", "Documents retrieved", {
      count: documentHits.length,
      topScore: documentHits[0]?.finalScore ?? null,
      items: documentHits.map((h) => ({
        id: h.item.id,
        title: h.item.title,
        score: h.finalScore,
      })),
    });

    // ---------- Retrieve memories ----------
    let memoryHits: RetrievalHit<MemoryRecord>[] = [];
    if (route.useMemory) {
      memoryHits = this.retrieval.retrieveMemories(input.userId, input.message, config);
    }
    this.trace.add(runId, "memories_retrieved", "Memories retrieved", {
      count: memoryHits.length,
      topScore: memoryHits[0]?.finalScore ?? null,
      items: memoryHits.map((h) => ({
        id: h.item.id,
        type: h.item.type,
        score: h.finalScore,
        importance: h.item.importance,
      })),
    });

    // ---------- Build context ----------
    const context = this.contextBuilder.build({
      message: input.message,
      route,
      documentHits,
      memoryHits,
      config,
    });
    this.trace.add(runId, "context_built", "Context built", {
      includedItems: context.includedItems,
      excludedItems: context.excludedItems,
      tokenBudget: context.tokenBudget,
    });

    // ---------- Generate ----------
    const answer = this.llm.generate({
      message: input.message,
      route,
      context,
      documentHits,
      memoryHits,
    });
    this.trace.add(runId, "answer_generated", "Answer generated", {
      answerLength: answer.length,
      isSimulator: true,
    });

    // ---------- Memory write proposals ----------
    const memoryWriteCandidates = this.memoryWritePolicy.decide({
      userId: input.userId,
      userMessage: input.message,
      assistantAnswer: answer,
      route,
      config,
    });
    this.trace.add(runId, "memory_write_decision", "Memory write decision completed", {
      candidates: memoryWriteCandidates,
      policy: config.memory.writePolicy,
    });

    // ---------- Evaluate ----------
    const metrics = this.evaluation.evaluate({
      question: input.message,
      answer,
      route,
      context,
      documentHits,
      memoryHits,
      startedAt,
    });
    this.trace.add(runId, "evaluation_completed", "Evaluation completed", {
      metrics,
    });

    // Emit failure_detected events per warning so the UI can surface them.
    for (const warning of metrics.warnings) {
      this.trace.add(runId, "failure_detected", "Failure mode detected", { warning });
    }

    return {
      runId,
      answer,
      route,
      sources: documentHits,
      usedMemories: memoryHits,
      memoryWriteCandidates,
      metrics,
      trace: this.trace.get(runId),
    };
  }
}
