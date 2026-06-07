/**
 * Run history store (N5): save → get (permalink) → list summaries.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getRunStore, resetRunStore, toSummary } from "../runs/store.js";
import type { RunRecord } from "../runs/store.js";
import type { ExplainableRun } from "../types.js";

function fakeRun(id: string, message: string, faith: number): ExplainableRun {
  return {
    runId: id,
    input: { userId: "u", message, mode: "auto" },
    route: { mode: "hybrid", useDocuments: true, useMemory: true, useLongContext: false, reason: "", confidence: 0.8 },
    providerStatus: [],
    graphSteps: [],
    retrievedDocuments: [],
    retrievedMemories: [],
    finalContext: { systemPrompt: "", memoryBlock: "", documentBlock: "", finalPrompt: "", tokensEstimate: 10 },
    answer: "answer",
    evaluations: {
      faithfulness: { name: "faithfulness", score: faith, explanation: "" },
      contextRelevance: { name: "context_relevance", score: 0.5, explanation: "" },
      answerRelevance: { name: "answer_relevance", score: 0.6, explanation: "" },
      custom: [],
      warnings: [],
    },
    trace: [],
    failureModes: [],
    debug: { envHints: [], containerDecisions: [], workflow: { nodeOrder: [], skippedNodes: [], failedNodes: [] } },
    meta: {
      startedAt: "2026-06-07T00:00:00.000Z",
      finishedAt: "2026-06-07T00:00:01.000Z",
      totalDurationMs: 1000,
      frameworks: {
        orchestration: { name: "langgraph", mode: "real" },
        rag: { name: "x", mode: "stub" },
        memory: { name: "x", mode: "stub" },
        llm: { name: "x", mode: "stub" },
        evaluation: { name: "x", mode: "stub" },
        observability: { name: "x", mode: "stub" },
      },
    },
  };
}

function rec(id: string, msg: string, faith: number, createdAt: string): RunRecord {
  return { id, userId: "u", createdAt, run: fakeRun(id, msg, faith) };
}

test("save then get returns the full run (permalink)", async () => {
  resetRunStore();
  const store = getRunStore();
  await store.save(rec("run_1", "hello", 0.7, "2026-06-07T00:00:01.000Z"));

  const got = await store.get("run_1");
  assert.ok(got);
  assert.equal(got?.run.input.message, "hello");
  assert.equal(await store.get("missing"), null);
});

test("list returns summaries newest-first, scoped to user", async () => {
  resetRunStore();
  const store = getRunStore();
  await store.save(rec("a", "first", 0.5, "2026-06-07T00:00:01.000Z"));
  await store.save(rec("b", "second", 0.9, "2026-06-07T00:00:02.000Z"));

  const list = await store.list("u", 10);
  assert.deepEqual(list.map((r) => r.id), ["b", "a"], "newest first");
  assert.equal(list[0]?.message, "second");
  assert.equal(list[0]?.faithfulness, 0.9);

  assert.equal((await store.list("other")).length, 0);
});

test("toSummary projects key fields", () => {
  const s = toSummary(rec("x", "msg", 0.42, "2026-06-07T00:00:01.000Z"));
  assert.equal(s.routeMode, "hybrid");
  assert.equal(s.faithfulness, 0.42);
  assert.equal(s.totalDurationMs, 1000);
});
