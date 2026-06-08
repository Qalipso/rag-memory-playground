import type {
  EvaluationInput,
  EvaluationProvider,
} from "../ports/evaluation-provider.port.js";
import type { EvaluationScore, EvaluationsResult } from "../types.js";

interface RagasMetric {
  score: number;
  explanation: string;
}

interface RagasResponse {
  metrics: Record<string, RagasMetric>;
  skipped: Record<string, string>;
  model: string;
}

/**
 * Real Ragas evaluator backed by the Python sidecar (see ragas-sidecar/).
 *
 * Promotes evaluation from the deterministic Ragas-shaped stub to real Ragas
 * when RAGAS_URL is set. Keeps Python out of the Next.js runtime by calling the
 * sidecar over HTTP.
 *
 * Mapping (sidecar metric -> engine field):
 *   faithfulness      -> faithfulness
 *   answer_relevancy  -> answerRelevance
 *   context_precision -> contextRelevance   (falls back to faithfulness signal)
 *   context_recall    -> custom
 */
export class RagasHttpEvaluator implements EvaluationProvider {
  readonly name = "ragas-http";
  readonly framework = "ragas (python sidecar)";
  readonly mode = "real" as const;
  readonly version = "0.1.0";
  readonly requiredEnvVars = ["RAGAS_URL"];

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 20_000) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  async evaluate(input: EvaluationInput): Promise<EvaluationsResult> {
    const contexts = [
      ...input.documents.map((d) => d.content),
      ...input.memories.map((m) => m.content),
    ].filter((c) => c && c.trim().length > 0);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let body: RagasResponse;
    try {
      const res = await fetch(`${this.baseUrl}/evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: input.question,
          answer: input.answer,
          contexts,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`ragas sidecar returned ${res.status}`);
      }
      body = (await res.json()) as RagasResponse;
    } finally {
      clearTimeout(timer);
    }

    const warnings: string[] = [];
    for (const [metric, reason] of Object.entries(body.skipped ?? {})) {
      warnings.push(`Ragas skipped ${metric}: ${reason}`);
    }

    const faithfulness = toScore(
      "faithfulness",
      body.metrics["faithfulness"],
      "Ragas faithfulness unavailable for this run."
    );
    const answerRelevance = toScore(
      "answer_relevance",
      body.metrics["answer_relevancy"],
      "Ragas answer_relevancy unavailable for this run."
    );
    const contextRelevance = toScore(
      "context_relevance",
      body.metrics["context_precision"],
      "Ragas context_precision needs ground truth; not computed."
    );

    const custom: EvaluationScore[] = [];
    const recall = body.metrics["context_recall"];
    if (recall) {
      custom.push({
        name: "context_recall",
        score: round2(recall.score),
        explanation: recall.explanation,
      });
    }

    return { faithfulness, contextRelevance, answerRelevance, custom, warnings };
  }
}

function toScore(
  name: string,
  metric: RagasMetric | undefined,
  missingExplanation: string
): EvaluationScore {
  if (!metric || Number.isNaN(metric.score)) {
    return { name, score: 0, explanation: missingExplanation };
  }
  return { name, score: round2(metric.score), explanation: metric.explanation };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
