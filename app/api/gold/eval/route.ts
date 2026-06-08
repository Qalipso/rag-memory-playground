/**
 * POST /api/gold/eval  { modes?: EngineMode[], limit?: number }
 *
 * Runs the Gold History Golden Eval (25 questions) through two retrieval
 * strategies and compares them: by default naive RAG vs hybrid RAG+memory.
 * Scores each run on source recall, ideal-point coverage, and memory recall.
 *
 * Note: in real-LLM mode this issues many model calls. Use `limit` to sample.
 */

import {
  FrameworkEngine,
  getSharedFrameworkContainer,
} from "../../../../src/framework";
import type { EngineMode, ExplainableRun, FrameworkInput } from "../../../../src/framework";
import {
  GOLD_USER_ID,
  getGoldEval,
  seedGoldMemory,
  scoreGoldQuestion,
  type GoldQuestionScore,
} from "../../../../src/framework/gold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_MODES: EngineMode[] = ["auto", "rag", "memory", "long_context", "hybrid"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface ModeRow {
  mode: EngineMode;
  scores: Array<GoldQuestionScore & { question: string }>;
  averages: {
    sourceRecall: number;
    pointCoverage: number;
    memoryTopicRecall: number;
    overall: number;
    passRate: number;
    avgLatencyMs: number;
  };
}

function avg(ns: number[]): number {
  return ns.length === 0 ? 0 : ns.reduce((s, n) => s + n, 0) / ns.length;
}

export async function POST(req: Request): Promise<Response> {
  let modes: EngineMode[] = ["rag", "hybrid"];
  let limit = 0;
  try {
    const body = (await req.json()) as { modes?: unknown; limit?: unknown };
    if (Array.isArray(body.modes)) {
      const valid = body.modes.filter(
        (m): m is EngineMode => typeof m === "string" && (VALID_MODES as string[]).includes(m)
      );
      if (valid.length > 0) modes = valid;
    }
    if (typeof body.limit === "number" && body.limit > 0) limit = Math.floor(body.limit);
  } catch {
    // defaults
  }

  try {
    await seedGoldMemory(); // idempotent

    const evalFile = getGoldEval();
    const questions = limit > 0 ? evalFile.questions.slice(0, limit) : evalFile.questions;

    const container = getSharedFrameworkContainer();
    const makeEngine = () =>
      new FrameworkEngine({
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

    const rows: ModeRow[] = [];
    for (const mode of modes) {
      const scores: Array<GoldQuestionScore & { question: string }> = [];
      const latencies: number[] = [];
      for (const q of questions) {
        const engine = makeEngine();
        const input: FrameworkInput = { userId: GOLD_USER_ID, message: q.question, mode };
        const run: ExplainableRun = await engine.run(input);
        latencies.push(run.meta.totalDurationMs);
        scores.push({ ...scoreGoldQuestion(q, run), question: q.question });
      }
      rows.push({
        mode,
        scores,
        averages: {
          sourceRecall: avg(scores.map((s) => s.sourceRecall)),
          pointCoverage: avg(scores.map((s) => s.pointCoverage)),
          memoryTopicRecall: avg(scores.map((s) => s.memoryTopicRecall)),
          overall: avg(scores.map((s) => s.overall)),
          passRate: avg(scores.map((s) => (s.pass ? 1 : 0))),
          avgLatencyMs: avg(latencies),
        },
      });
    }

    const winner =
      rows.length > 0
        ? [...rows].sort((a, b) => b.averages.overall - a.averages.overall)[0]!.mode
        : null;

    return json({
      evalName: evalFile.name,
      questionCount: questions.length,
      providerStatus: container.providerStatus,
      rows,
      winner,
    });
  } catch (error) {
    console.error("[gold/eval] failed:", error);
    return json({ error: "Gold eval failed. See server logs." }, 500);
  }
}
