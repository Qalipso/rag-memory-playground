import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { RagasHttpEvaluator } from "../adapters/ragas-http-evaluator.js";
import type { EvaluationInput } from "../ports/evaluation-provider.port.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseInput(): EvaluationInput {
  return {
    question: "What did I decide about the tracker?",
    answer: "You decided to ship the expense tracker next sprint.",
    route: {
      mode: "hybrid",
      useDocuments: true,
      useMemory: true,
      useLongContext: false,
      reason: "test",
      confidence: 0.8,
    },
    context: {
      systemPrompt: "",
      memoryBlock: "",
      documentBlock: "",
      finalPrompt: "ctx",
      tokensEstimate: 100,
    },
    documents: [
      { id: "d1", title: "Doc", content: "ship the tracker", source: "s", score: 0.7, reason: "" },
    ],
    memories: [
      { id: "m1", type: "episodic", content: "decided next sprint", score: 0.6, reason: "" },
    ],
  };
}

test("maps ragas metrics to engine fields", async () => {
  let captured: any = null;
  globalThis.fetch = (async (_url: string, init: any) => {
    captured = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        metrics: {
          faithfulness: { score: 0.83, explanation: "f" },
          answer_relevancy: { score: 0.91, explanation: "a" },
        },
        skipped: { context_precision: "no ground_truth provided" },
        model: "gpt-4o-mini",
      }),
    };
  }) as unknown as typeof fetch;

  const ev = new RagasHttpEvaluator("http://sidecar:8000/");
  const out = await ev.evaluate(baseInput());

  // Contexts assembled from documents + memories content.
  assert.deepEqual(captured.contexts, ["ship the tracker", "decided next sprint"]);
  assert.equal(out.faithfulness.score, 0.83);
  assert.equal(out.answerRelevance.score, 0.91);
  // Skipped metric surfaces as a warning, context relevance falls back to 0.
  assert.equal(out.contextRelevance.score, 0);
  assert.ok(out.warnings.some((w) => w.includes("context_precision")));
});

test("includes context_recall as a custom metric when present", async () => {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      metrics: {
        faithfulness: { score: 0.5, explanation: "f" },
        answer_relevancy: { score: 0.5, explanation: "a" },
        context_precision: { score: 0.7, explanation: "p" },
        context_recall: { score: 0.6, explanation: "r" },
      },
      skipped: {},
      model: "gpt-4o-mini",
    }),
  })) as unknown as typeof fetch;

  const ev = new RagasHttpEvaluator("http://sidecar:8000");
  const out = await ev.evaluate(baseInput());

  assert.equal(out.contextRelevance.score, 0.7);
  const recall = out.custom.find((c) => c.name === "context_recall");
  assert.ok(recall);
  assert.equal(recall!.score, 0.6);
});

test("throws on non-200 so the engine records a failure mode", async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch;
  const ev = new RagasHttpEvaluator("http://sidecar:8000");
  await assert.rejects(() => ev.evaluate(baseInput()), /503/);
});
