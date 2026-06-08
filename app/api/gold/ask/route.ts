/**
 * POST /api/gold/ask  { message, mode? }
 *
 * "Ask Gold Memory" — runs a question through the framework engine (hybrid by
 * default) against the gold corpus and seeded gold memory, then attaches the
 * explanation subgraph (retrieved nodes + 1-hop neighbors) so the UI can show
 * retrieved memories, graph path, source docs, confidence, failure modes,
 * cost, and latency in one trace. Historical analysis, not investment advice.
 */

import {
  FrameworkEngine,
  getSharedFrameworkContainer,
} from "../../../../src/framework";
import type { EngineMode, ExplainableRun, FrameworkInput } from "../../../../src/framework";
import {
  GOLD_USER_ID,
  seedGoldMemory,
  getGoldGraph,
  explanationSubgraph,
} from "../../../../src/framework/gold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: EngineMode[] = ["auto", "rag", "memory", "long_context", "hybrid"];

const PRICE_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  default: { input: 0.00015, output: 0.0006 },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function estimateCost(run: ExplainableRun): number {
  if (run.meta.frameworks.llm.mode !== "real") return 0;
  const model = run.meta.frameworks.llm.version ?? "default";
  const price = PRICE_PER_1K[model] ?? PRICE_PER_1K["default"]!;
  const inputTokens = run.finalContext.tokensEstimate;
  const outputTokens = Math.ceil(run.answer.length / 4);
  return (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;
}

export async function POST(req: Request): Promise<Response> {
  let body: { message?: unknown; mode?: unknown };
  try {
    body = (await req.json()) as { message?: unknown; mode?: unknown };
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return json({ error: "Field 'message' is required." }, 400);
  }
  let mode: EngineMode = "hybrid";
  if (body.mode !== undefined) {
    if (typeof body.mode !== "string" || !(VALID_MODES as string[]).includes(body.mode)) {
      return json({ error: `'mode' must be one of: ${VALID_MODES.join(", ")}.` }, 400);
    }
    mode = body.mode as EngineMode;
  }

  try {
    await seedGoldMemory(); // idempotent

    const container = getSharedFrameworkContainer();
    const engine = new FrameworkEngine({
      rag: container.providers.rag,
      memory: container.providers.memory,
      llm: container.providers.llm,
      evaluator: container.providers.evaluator,
      obs: container.providers.obs,
      providerStatus: container.providerStatus,
      debug: container.debug,
      topK: 6,
      maxContextTokens: 6000,
    });

    const input: FrameworkInput = { userId: GOLD_USER_ID, message: body.message, mode };
    const run = await engine.run(input);

    // Build explanation subgraph from retrieved doc ids that are gold nodes.
    const seedIds = run.retrievedDocuments.map((d) => d.id);
    const subgraph = explanationSubgraph(getGoldGraph(), seedIds);

    return json({
      run,
      subgraph,
      metrics: {
        routeMode: run.route.mode,
        documents: run.retrievedDocuments.length,
        memories: run.retrievedMemories.length,
        confidence: run.evaluations.faithfulness.score,
        contextRelevance: run.evaluations.contextRelevance.score,
        answerRelevance: run.evaluations.answerRelevance.score,
        failureModes: run.failureModes.length,
        estimatedCostUsd: estimateCost(run),
        latencyMs: run.meta.totalDurationMs,
        llmMode: run.meta.frameworks.llm.mode,
      },
    });
  } catch (error) {
    console.error("[gold/ask] failed:", error);
    return json({ error: "Gold ask failed. See server logs." }, 500);
  }
}
