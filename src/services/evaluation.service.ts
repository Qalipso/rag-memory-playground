import { clamp01 } from "../core/scoring.js";
import type {
  BuiltContext,
  DocumentChunk,
  EvaluationResult,
  MemoryRecord,
  RetrievalHit,
  RouteDecision,
} from "../core/types.js";

/**
 * Deterministic, transparent scoring derived from retrieval signal + context shape.
 * Replace with RAGAS-style LLM judge in Phase 5.
 */
export class EvaluationService {
  evaluate(params: {
    question: string;
    answer: string;
    route: RouteDecision;
    context: BuiltContext;
    documentHits: RetrievalHit<DocumentChunk>[];
    memoryHits: RetrievalHit<MemoryRecord>[];
    startedAt: number;
  }): EvaluationResult {
    const { context, documentHits, memoryHits, route, startedAt } = params;
    const warnings: string[] = [];

    const usedCount = context.includedItems.length;
    const docCount = context.includedItems.filter((i) => i.type === "document").length;
    const memCount = context.includedItems.filter((i) => i.type === "memory").length;

    // contextRelevance: average score of included items, scaled.
    const avgIncludedScore =
      usedCount === 0
        ? 0
        : context.includedItems.reduce((s, i) => s + i.score, 0) / usedCount;
    let contextRelevance = clamp01(avgIncludedScore);

    if (usedCount === 0) {
      contextRelevance = 0;
      warnings.push("Empty context: no items passed threshold or token budget.");
    }

    // answerRelevance: heuristic — high when usedCount > 0 and route confident.
    const answerRelevance = clamp01(
      0.4 + (usedCount > 0 ? 0.3 : 0) + 0.3 * route.confidence
    );

    // faithfulness: heuristic — high when included items have high score and grounding is strict.
    const topRetrievalSignal =
      Math.max(
        memoryHits[0]?.finalScore ?? 0,
        documentHits[0]?.finalScore ?? 0
      ) || 0;
    let faithfulness = clamp01(0.5 + 0.4 * topRetrievalSignal);

    // Hybrid bonus when both sources contributed.
    if (route.mode === "hybrid" && docCount > 0 && memCount > 0) {
      faithfulness = clamp01(faithfulness + 0.05);
      contextRelevance = clamp01(contextRelevance + 0.05);
    }

    // Low-signal warnings.
    if (topRetrievalSignal < 0.3 && usedCount > 0) {
      warnings.push("Top retrieval score is low (<0.3). Context may be weakly grounded.");
    }

    if (route.useDocuments && documentHits.length === 0) {
      warnings.push("Route requested documents but none were retrieved.");
    }
    if (route.useMemory && memoryHits.length === 0) {
      warnings.push("Route requested memory but none were retrieved.");
    }

    const latencyMs = Date.now() - startedAt;

    return {
      faithfulness: round2(faithfulness),
      contextRelevance: round2(contextRelevance),
      answerRelevance: round2(answerRelevance),
      latencyMs,
      estimatedCost: 0, // simulator: no real API spend
      warnings,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
