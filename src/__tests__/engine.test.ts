/**
 * Contract test for the Phase 1 engine.
 * Run with: pnpm test  (or)  npx tsx --test src/__tests__/engine.test.ts
 *
 * Asserts the public engine contract: shape, trace coverage, route gating,
 * memory write candidates, and basic evaluation invariants.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildContainer } from "../index.js";
import type { TraceEventType } from "../core/types.js";

function hasTraceEvent(types: TraceEventType[], target: TraceEventType): boolean {
  return types.includes(target);
}

test("engine returns full contract for an auto-routed query", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял с Shadow и этой теорией?",
    mode: "auto",
  });

  assert.ok(result.runId, "runId must be present");
  assert.ok(result.runId.startsWith("run_"), "runId must use 'run_' prefix");
  assert.ok(typeof result.answer === "string" && result.answer.length > 0, "answer must be non-empty");
  assert.ok(result.route, "route decision must be present");
  assert.ok(Array.isArray(result.trace), "trace must be an array");
  assert.ok(result.trace.length > 0, "trace must contain events");

  assert.ok(Array.isArray(result.usedMemories), "usedMemories must be array");
  assert.ok(result.usedMemories.length > 0, "at least one memory should match this query");

  assert.ok(Array.isArray(result.memoryWriteCandidates), "memoryWriteCandidates must be array");

  const traceTypes = result.trace.map((e) => e.type);
  assert.ok(hasTraceEvent(traceTypes, "route_selected"), "trace must include route_selected");
  assert.ok(hasTraceEvent(traceTypes, "context_built"), "trace must include context_built");
  assert.ok(hasTraceEvent(traceTypes, "evaluation_completed"), "trace must include evaluation_completed");
});

test("auto router picks hybrid when both memory and document signals present", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял? По теории это паттерн.",
    mode: "auto",
  });

  assert.equal(result.route.mode, "hybrid", "should route to hybrid");
  assert.equal(result.route.useDocuments, true, "hybrid must enable documents");
  assert.equal(result.route.useMemory, true, "hybrid must enable memory");
});

test("forced 'memory' mode disables document retrieval", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Tell me anything from theory.",
    mode: "memory",
  });

  assert.equal(result.route.mode, "memory");
  assert.equal(result.route.useDocuments, false);
  assert.equal(result.sources.length, 0, "forced memory mode must skip documents");
});

test("forced 'rag' mode disables memory retrieval", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Mention something about a pattern please.",
    mode: "rag",
  });

  assert.equal(result.route.mode, "rag");
  assert.equal(result.route.useMemory, false);
  assert.equal(result.usedMemories.length, 0, "forced rag mode must skip memory");
});

test("memory write policy proposes a candidate when user states a preference", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Я хочу чтобы Shadow стал моим вторым мозгом.",
    mode: "auto",
  });

  assert.ok(result.memoryWriteCandidates.length > 0, "preference statement should produce a candidate");
  const semantic = result.memoryWriteCandidates.find((c) => c.type === "semantic");
  assert.ok(semantic, "expected a semantic candidate");
});

test("metrics are bounded in [0, 1] and warnings is an array", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "demo-user",
    message: "Random unrelated string xyz12345",
    mode: "auto",
  });

  const { faithfulness, contextRelevance, answerRelevance, warnings } = result.metrics;
  assert.ok(faithfulness >= 0 && faithfulness <= 1);
  assert.ok(contextRelevance >= 0 && contextRelevance <= 1);
  assert.ok(answerRelevance >= 0 && answerRelevance <= 1);
  assert.ok(Array.isArray(warnings));
});

test("failure_detected events emitted when warnings are present", async () => {
  const { engine } = buildContainer();

  const result = await engine.run({
    userId: "unknown-user-without-memories",
    message: "Nothing matches.",
    mode: "memory", // memory route + unknown user => empty hits => warning expected
  });

  const failureEvents = result.trace.filter((e) => e.type === "failure_detected");
  assert.ok(failureEvents.length >= 1, "should emit at least one failure_detected event");
});
