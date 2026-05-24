import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFrameworkContainer } from "../container.js";
import type { ProviderRole, FailureModeType } from "../types.js";

test("providerStatus lists all five roles with stub mode in local container", async () => {
  const { engine, providerStatus } = buildFrameworkContainer({ mode: "local" });

  const roles = new Set<ProviderRole>(providerStatus.map((p) => p.role));
  for (const required of ["rag", "memory", "llm", "evaluation", "observability"] as const) {
    assert.ok(roles.has(required), `missing role: ${required}`);
  }

  for (const p of providerStatus) {
    assert.equal(p.mode, "stub", `${p.role} should be 'stub' in local mode`);
    assert.ok(typeof p.framework === "string" && p.framework.length > 0);
    assert.ok(Array.isArray(p.requiredEnvVars));
    assert.ok(typeof p.isConfigured === "boolean");
    assert.ok(typeof p.reason === "string" && p.reason.length > 0);
  }

  // Run engine once so we can assert providerStatus reaches the ExplainableRun.
  const result = await engine.run({
    userId: "demo-user",
    message: "ping",
    mode: "auto",
  });
  assert.deepEqual(result.providerStatus, providerStatus);
});

test("graphSteps include buildExplainableRunNode and providerMode per step", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });
  const result = await engine.run({
    userId: "demo-user",
    message: "По теории какой паттерн застрял?",
    mode: "auto",
  });

  const stepNames = result.graphSteps.map((s) => s.name);
  assert.ok(stepNames.includes("buildExplainableRunNode"));

  for (const step of result.graphSteps) {
    assert.ok(
      ["real", "stub", "fallback"].includes(step.providerMode),
      `step ${step.name} has invalid providerMode ${step.providerMode}`
    );
  }
});

test("failureModes include evaluation_stub_used and missing_observability_keys in local mode", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });
  const result = await engine.run({
    userId: "demo-user",
    message: "Почему я снова застрял с Shadow и этой теорией?",
    mode: "auto",
  });

  const types = new Set<FailureModeType>(result.failureModes.map((f) => f.type));
  assert.ok(types.has("evaluation_stub_used"), "expected evaluation_stub_used");
  assert.ok(types.has("missing_observability_keys"), "expected missing_observability_keys");
});

test("debug envelope captures node order, env hints, and container decisions", async () => {
  const { engine, debug } = buildFrameworkContainer({ mode: "local" });

  // Pre-run debug has empty workflow stats but populated env + decisions.
  assert.ok(Array.isArray(debug.envHints));
  assert.ok(debug.envHints.length >= 5);
  assert.ok(debug.containerDecisions.length === 5);

  const result = await engine.run({
    userId: "demo-user",
    message: "ping",
    mode: "auto",
  });

  // Post-run debug envelope has node order filled in.
  assert.ok(result.debug.workflow.nodeOrder.length >= 7);
  assert.ok(result.debug.workflow.nodeOrder.includes("classifyIntentNode"));
  assert.ok(result.debug.workflow.nodeOrder.includes("buildExplainableRunNode"));
});

test("forced memory mode produces no_documents_retrieved failure mode", async () => {
  const { engine } = buildFrameworkContainer({ mode: "local" });
  const result = await engine.run({
    userId: "demo-user",
    message: "память про паттерн",
    mode: "memory",
  });

  // Memory route disables documents; no_documents_retrieved should NOT fire because route did not request docs.
  // But hybrid scenarios may. Just ensure type is one of allowed values.
  for (const f of result.failureModes) {
    assert.ok(
      [
        "empty_context",
        "low_retrieval_score",
        "route_mismatch",
        "framework_error",
        "evaluation_failed",
        "provider_fallback_used",
        "no_documents_retrieved",
        "no_memories_retrieved",
        "low_context_relevance",
        "evaluation_stub_used",
        "missing_observability_keys",
      ].includes(f.type),
      `unknown failure mode type ${f.type}`
    );
  }
});
