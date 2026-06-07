/**
 * LLM-as-judge evaluator (N6) — fallback safety (no real API call here).
 *
 * Without OPENAI_API_KEY the judge must never throw: it falls back to the
 * deterministic evaluator and tags the result with a judge_fallback warning,
 * keeping scores in [0,1].
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { OpenAIJudgeEvaluator } from "../adapters/openai-judge-evaluator.js";
import type { EvaluationInput } from "../ports/evaluation-provider.port.js";

const input: EvaluationInput = {
  question: "What did I want to build?",
  answer: "An expense tracker in Shadow.",
  route: { mode: "hybrid", useDocuments: true, useMemory: true, useLongContext: false, reason: "", confidence: 0.8 },
  context: {
    systemPrompt: "",
    memoryBlock: "[Memory 1] Build expense tracker in Shadow",
    documentBlock: "",
    finalPrompt: "",
    tokensEstimate: 20,
  },
  documents: [],
  memories: [
    { id: "m1", type: "procedural", content: "Build expense tracker in Shadow", score: 0.7, reason: "x" },
  ],
};

test("judge falls back to deterministic without API key (never throws)", async () => {
  const saved = process.env["OPENAI_API_KEY"];
  delete process.env["OPENAI_API_KEY"];
  try {
    const judge = new OpenAIJudgeEvaluator();
    assert.equal(judge.isConfigured(), false);

    const res = await judge.evaluate(input);

    for (const s of [res.faithfulness.score, res.contextRelevance.score, res.answerRelevance.score]) {
      assert.ok(s >= 0 && s <= 1, "scores in [0,1]");
    }
    assert.ok(
      res.warnings.some((w) => w.startsWith("judge_fallback")),
      "fallback tagged honestly"
    );
  } finally {
    if (saved !== undefined) process.env["OPENAI_API_KEY"] = saved;
  }
});

test("judge advertises real mode + required key", () => {
  const judge = new OpenAIJudgeEvaluator();
  assert.equal(judge.mode, "real");
  assert.deepEqual(judge.requiredEnvVars, ["OPENAI_API_KEY"]);
});
