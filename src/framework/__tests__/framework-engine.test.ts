import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFrameworkContainer } from "../container.js";

test("framework engine returns ExplainableRun with required shape", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял с Shadow и этой теорией?",
    mode: "auto",
  });

  assert.ok(result.runId.startsWith("run_"));
  assert.ok(typeof result.answer === "string" && result.answer.length > 0);
  assert.ok(result.route);
  assert.ok(Array.isArray(result.graphSteps));
  assert.ok(Array.isArray(result.retrievedDocuments));
  assert.ok(Array.isArray(result.retrievedMemories));
  assert.ok(result.finalContext);
  assert.ok(result.evaluations.faithfulness);
  assert.ok(Array.isArray(result.trace));
  assert.ok(Array.isArray(result.failureModes));
  assert.ok(result.meta.totalDurationMs >= 0);
});

test("graphSteps include the six core LangGraph nodes", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });

  const result = await engine.run({
    userId: "demo-user",
    message: "По теории какие документы есть?",
    mode: "hybrid",
  });

  const stepNames = result.graphSteps.map((s) => s.name);
  for (const required of [
    "classifyIntentNode",
    "retrieveDocumentsNode",
    "retrieveMemoriesNode",
    "buildContextNode",
    "generateAnswerNode",
    "evaluateAnswerNode",
  ]) {
    assert.ok(stepNames.includes(required), `missing step: ${required}`);
  }
});

test("auto router picks hybrid when both memory and document signals appear", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });

  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял? По теории это паттерн.",
    mode: "auto",
  });

  assert.equal(result.route.mode, "hybrid");
  assert.equal(result.route.useDocuments, true);
  assert.equal(result.route.useMemory, true);
});

test("forced memory mode skips document retrieval (step is 'skipped')", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });

  const result = await engine.run({
    userId: "demo-user",
    message: "Анализ моего паттерна.",
    mode: "memory",
  });

  assert.equal(result.route.useDocuments, false);
  assert.equal(result.retrievedDocuments.length, 0);

  const docStep = result.graphSteps.find((s) => s.name === "retrieveDocumentsNode");
  assert.ok(docStep);
  assert.equal(docStep.status, "skipped");
});

test("evaluations are bounded in [0, 1] and warnings is an array", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });

  const result = await engine.run({
    userId: "demo-user",
    message: "Random unrelated string xyz12345",
    mode: "auto",
  });

  const { faithfulness, contextRelevance, answerRelevance, warnings } = result.evaluations;
  assert.ok(faithfulness.score >= 0 && faithfulness.score <= 1);
  assert.ok(contextRelevance.score >= 0 && contextRelevance.score <= 1);
  assert.ok(answerRelevance.score >= 0 && answerRelevance.score <= 1);
  assert.ok(Array.isArray(warnings));
});

test("framework summary reports provider modes", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });
  const result = await engine.run({
    userId: "demo-user",
    message: "ok",
    mode: "auto",
  });

  const fw = result.meta.frameworks;
  assert.equal(fw.orchestration.name, "langgraph");
  assert.equal(fw.rag.mode, "stub");
  assert.equal(fw.memory.mode, "stub");
  assert.equal(fw.llm.mode, "stub");
  assert.equal(fw.evaluation.mode, "stub");
  assert.equal(fw.observability.mode, "stub");
});
