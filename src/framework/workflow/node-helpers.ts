import { randomUUID } from "node:crypto";
import type { GraphStep, GraphStepStatus, ProviderMode } from "../types.js";

export function newStepId(): string {
  return `step_${randomUUID()}`;
}

export interface RunStepContext {
  name: string;
  framework: string;
  providerMode: ProviderMode;
  inputSummary: string;
  metadata?: Record<string, unknown>;
}

export interface StepResult<T> {
  step: GraphStep;
  value?: T;
  error?: Error;
}

/**
 * Runs a node body, captures duration, status, and produces a GraphStep.
 * Always returns a step, even on failure.
 */
export async function runStep<T>(
  ctx: RunStepContext,
  body: () => Promise<{
    outputSummary: string;
    value: T;
    metadata?: Record<string, unknown>;
  }>
): Promise<StepResult<T>> {
  const startedAt = Date.now();
  const id = newStepId();
  try {
    const { outputSummary, value, metadata } = await body();
    const step: GraphStep = {
      id,
      name: ctx.name,
      framework: ctx.framework,
      providerMode: ctx.providerMode,
      status: "ok",
      inputSummary: ctx.inputSummary,
      outputSummary,
      durationMs: Date.now() - startedAt,
      metadata: { ...(ctx.metadata ?? {}), ...(metadata ?? {}) },
    };
    return { step, value };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const step: GraphStep = {
      id,
      name: ctx.name,
      framework: ctx.framework,
      providerMode: ctx.providerMode,
      status: "failed",
      inputSummary: ctx.inputSummary,
      outputSummary: `Error: ${error.message}`,
      durationMs: Date.now() - startedAt,
      error: error.message,
      ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
    };
    return { step, error };
  }
}

export function skippedStep(ctx: RunStepContext, reason: string): GraphStep {
  return {
    id: newStepId(),
    name: ctx.name,
    framework: ctx.framework,
    providerMode: ctx.providerMode,
    status: "skipped" satisfies GraphStepStatus,
    inputSummary: ctx.inputSummary,
    outputSummary: `Skipped: ${reason}`,
    durationMs: 0,
    ...(ctx.metadata ? { metadata: ctx.metadata } : {}),
  };
}
