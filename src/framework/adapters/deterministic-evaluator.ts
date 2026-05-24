import type {
  EvaluationInput,
  EvaluationProvider,
} from "../ports/evaluation-provider.port.js";
import type { EvaluationsResult } from "../types.js";

/**
 * Deterministic Ragas-shaped evaluator.
 *
 * Implements the same three core metrics Ragas defines:
 *   - faithfulness:       answer supported by retrieved context
 *   - context relevance:  context relevant to the question
 *   - answer relevance:   answer relevant to the question
 *
 * Scoring is heuristic and transparent — derived from retrieval signal,
 * route mode, and context fill. Swap with a real Ragas adapter when running
 * Python Ragas via a sidecar (see TODO at bottom).
 *
 * TODO(Phase 5): Replace with real RagasEvaluationProvider that calls
 * Python Ragas over a subprocess or HTTP bridge.
 */
export class DeterministicEvaluator implements EvaluationProvider {
  readonly name = "deterministic-ragas-shaped";
  readonly framework = "heuristic (Ragas-shaped, not real Ragas)";
  readonly mode = "stub" as const;
  readonly version = "0.3.0";
  readonly requiredEnvVars: string[] = [];
  isConfigured(): boolean {
    return true;
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationsResult> {
    const { route, context, documents, memories } = input;

    const warnings: string[] = [];

    const docScores = documents.map((d) => d.score);
    const memScores = memories.map((m) => m.score);
    const topRetrieval = Math.max(0, ...docScores, ...memScores);

    const usedDocs = documents.length;
    const usedMems = memories.length;
    const usedAny = usedDocs + usedMems > 0;

    if (!usedAny) warnings.push("No documents or memories retrieved; answer is unanchored.");
    if (topRetrieval < 0.3 && usedAny) {
      warnings.push("Top retrieval score below 0.3; weak grounding.");
    }
    if (route.useDocuments && usedDocs === 0) {
      warnings.push("Route requested documents but none retrieved.");
    }
    if (route.useMemory && usedMems === 0) {
      warnings.push("Route requested memory but none retrieved.");
    }
    if (context.tokensEstimate === 0) {
      warnings.push("Final context is empty.");
    }

    // Faithfulness: high when top retrieval is high and answer was generated
    // against grounded context.
    const faithfulness = clamp01(0.5 + 0.4 * topRetrieval);

    // Context relevance: average score of retrieved items.
    const allScores = [...docScores, ...memScores];
    const avg = allScores.length === 0 ? 0 : allScores.reduce((s, n) => s + n, 0) / allScores.length;
    let contextRelevance = clamp01(avg);
    if (route.mode === "hybrid" && usedDocs > 0 && usedMems > 0) {
      contextRelevance = clamp01(contextRelevance + 0.05);
    }

    // Answer relevance: high when usedAny and route confident.
    const answerRelevance = clamp01(0.4 + (usedAny ? 0.3 : 0) + 0.3 * route.confidence);

    return {
      faithfulness: {
        name: "faithfulness",
        score: round2(faithfulness),
        explanation:
          "Fraction of generated claims supported by retrieved context. Heuristic: 0.5 + 0.4 × top retrieval score.",
      },
      contextRelevance: {
        name: "context_relevance",
        score: round2(contextRelevance),
        explanation:
          "How relevant the retrieved context is to the question. Heuristic: mean retrieval score across items, +0.05 hybrid bonus.",
      },
      answerRelevance: {
        name: "answer_relevance",
        score: round2(answerRelevance),
        explanation:
          "Whether the answer addresses the question. Heuristic: base + retrieval-used bonus + route confidence.",
      },
      custom: [
        {
          name: "retrieval_breadth",
          score: round2(clamp01((usedDocs + usedMems) / 10)),
          explanation: "Count of retrieved items, normalized to 10.",
        },
      ],
      warnings,
    };
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
