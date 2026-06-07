/**
 * POST /api/rag-memory/compare
 *
 * Side-by-side comparison runner — the core product surface.
 *
 * Runs the SAME query through 2–4 pipeline configs in parallel and returns one
 * ExplainableRun per config plus a comparison-layer summary (estimated cost,
 * latency, eval scores) so configs can be diffed on quality × cost × latency.
 *
 * Each config varies engine knobs (route mode, topK, maxContextTokens). The
 * providers themselves are shared from the singleton container, so real/stub
 * mode is identical across configs — what changes is how the pipeline is tuned.
 */

import {
  FrameworkEngine,
  getSharedFrameworkContainer,
} from "../../../../src/framework";
import type {
  EngineMode,
  ExplainableRun,
  FrameworkInput,
} from "../../../../src/framework";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: EngineMode[] = ["auto", "rag", "memory", "long_context", "hybrid"];
const MAX_CONFIGS = 4;
const MIN_CONFIGS = 2;

// Rough USD price per 1K tokens. Only applied when the LLM provider is real;
// stub generations are free. Estimates, not billed amounts.
const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  default: { input: 0.00015, output: 0.0006 },
};

interface ConfigInput {
  label?: unknown;
  mode?: unknown;
  topK?: unknown;
  maxContextTokens?: unknown;
}

interface RequestBody {
  userId?: unknown;
  message?: unknown;
  configs?: unknown;
}

interface NormalizedConfig {
  label: string;
  mode: EngineMode;
  topK: number;
  maxContextTokens: number;
}

interface ComparisonRow {
  label: string;
  config: NormalizedConfig;
  run: ExplainableRun;
  metrics: {
    routeMode: string;
    documents: number;
    memories: number;
    promptTokens: number;
    answerChars: number;
    latencyMs: number;
    faithfulness: number;
    contextRelevance: number;
    answerRelevance: number;
    estimatedCostUsd: number;
    llmMode: string;
    failureModeCount: number;
  };
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeConfig(raw: ConfigInput, index: number): NormalizedConfig | { error: string } {
  let mode: EngineMode = "auto";
  if (raw.mode !== undefined) {
    if (!isString(raw.mode) || !(VALID_MODES as string[]).includes(raw.mode)) {
      return { error: `config[${index}].mode must be one of: ${VALID_MODES.join(", ")}.` };
    }
    mode = raw.mode as EngineMode;
  }
  const label = isString(raw.label) && raw.label.trim() ? raw.label.trim() : `Config ${index + 1}`;
  return {
    label,
    mode,
    topK: clampInt(raw.topK, 5, 1, 20),
    maxContextTokens: clampInt(raw.maxContextTokens, 4000, 256, 16000),
  };
}

function estimateCost(run: ExplainableRun): number {
  if (run.meta.frameworks.llm.mode !== "real") return 0;
  const model = run.meta.frameworks.llm.version ?? "default";
  const price = PRICE_PER_1K[model] ?? PRICE_PER_1K["default"]!;
  const inputTokens = run.finalContext.tokensEstimate;
  const outputTokens = Math.ceil(run.answer.length / 4);
  return (
    (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output
  );
}

function toRow(label: string, config: NormalizedConfig, run: ExplainableRun): ComparisonRow {
  return {
    label,
    config,
    run,
    metrics: {
      routeMode: run.route.mode,
      documents: run.retrievedDocuments.length,
      memories: run.retrievedMemories.length,
      promptTokens: run.finalContext.tokensEstimate,
      answerChars: run.answer.length,
      latencyMs: run.meta.totalDurationMs,
      faithfulness: run.evaluations.faithfulness.score,
      contextRelevance: run.evaluations.contextRelevance.score,
      answerRelevance: run.evaluations.answerRelevance.score,
      estimatedCostUsd: estimateCost(run),
      llmMode: run.meta.frameworks.llm.mode,
      failureModeCount: run.failureModes.length,
    },
  };
}

export async function POST(req: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!isString(body.userId) || body.userId.trim().length === 0) {
    return jsonResponse({ error: "Field 'userId' is required." }, 400);
  }
  if (!isString(body.message) || body.message.trim().length === 0) {
    return jsonResponse({ error: "Field 'message' is required." }, 400);
  }
  if (!Array.isArray(body.configs)) {
    return jsonResponse({ error: "Field 'configs' must be an array." }, 400);
  }
  if (body.configs.length < MIN_CONFIGS || body.configs.length > MAX_CONFIGS) {
    return jsonResponse(
      { error: `Provide between ${MIN_CONFIGS} and ${MAX_CONFIGS} configs.` },
      400
    );
  }

  const configs: NormalizedConfig[] = [];
  for (let i = 0; i < body.configs.length; i++) {
    const result = normalizeConfig(body.configs[i] as ConfigInput, i);
    if ("error" in result) return jsonResponse({ error: result.error }, 400);
    configs.push(result);
  }

  const container = getSharedFrameworkContainer();

  try {
    const rows = await Promise.all(
      configs.map(async (cfg) => {
        const engine = new FrameworkEngine({
          rag: container.providers.rag,
          memory: container.providers.memory,
          llm: container.providers.llm,
          evaluator: container.providers.evaluator,
          obs: container.providers.obs,
          providerStatus: container.providerStatus,
          debug: container.debug,
          topK: cfg.topK,
          maxContextTokens: cfg.maxContextTokens,
        });
        const input: FrameworkInput = {
          userId: body.userId as string,
          message: body.message as string,
          mode: cfg.mode,
        };
        const run = await engine.run(input);
        return toRow(cfg.label, cfg, run);
      })
    );

    const winners = pickWinners(rows);

    return jsonResponse({
      query: { userId: body.userId, message: body.message },
      providerStatus: container.providerStatus,
      rows,
      winners,
    });
  } catch (error) {
    console.error("[compare] run failed:", error);
    return jsonResponse({ error: "Comparison run failed. See server logs." }, 500);
  }
}

function pickWinners(rows: ComparisonRow[]): {
  faithfulness: string | null;
  cost: string | null;
  latency: string | null;
} {
  if (rows.length === 0) return { faithfulness: null, cost: null, latency: null };

  const byFaithfulness = [...rows].sort(
    (a, b) => b.metrics.faithfulness - a.metrics.faithfulness
  )[0]!;
  const byCost = [...rows].sort(
    (a, b) => a.metrics.estimatedCostUsd - b.metrics.estimatedCostUsd
  )[0]!;
  const byLatency = [...rows].sort(
    (a, b) => a.metrics.latencyMs - b.metrics.latencyMs
  )[0]!;

  return {
    faithfulness: byFaithfulness.label,
    cost: byCost.label,
    latency: byLatency.label,
  };
}
