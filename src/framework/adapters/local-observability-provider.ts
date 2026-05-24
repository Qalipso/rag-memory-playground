import { randomUUID } from "node:crypto";
import type {
  EndTraceInput,
  LogEventInput,
  LogStepInput,
  ObservabilityProvider,
  StartTraceInput,
} from "../ports/observability-provider.port.js";
import type { GraphStep, TraceEvent } from "../types.js";

/**
 * Local observability provider. Buffers trace events and graph steps in memory
 * and exposes them via getEvents(). Compatible swap target: Langfuse.
 */
export class LocalObservabilityProvider implements ObservabilityProvider {
  readonly name = "local-trace";
  readonly framework = "in-memory";
  readonly mode = "stub" as const;
  readonly version = "0.3.0";
  readonly requiredEnvVars: string[] = [];
  isConfigured(): boolean {
    return true;
  }

  private readonly events = new Map<string, TraceEvent[]>();
  private readonly steps = new Map<string, GraphStep[]>();
  private readonly meta = new Map<string, { startedAt: number; userId: string }>();

  async startTrace(input: StartTraceInput): Promise<void> {
    this.meta.set(input.runId, { startedAt: Date.now(), userId: input.userId });
    await this.logEvent({
      runId: input.runId,
      level: "info",
      message: "Trace started",
      data: { userId: input.userId, message: input.message },
    });
  }

  async logStep(input: LogStepInput): Promise<void> {
    const bucket = this.steps.get(input.runId) ?? [];
    bucket.push(input.step);
    this.steps.set(input.runId, bucket);

    await this.logEvent({
      runId: input.runId,
      stepId: input.step.id,
      level: input.step.status === "failed" ? "error" : "info",
      message: `Step ${input.step.name} ${input.step.status}`,
      data: {
        framework: input.step.framework,
        durationMs: input.step.durationMs,
        outputSummary: input.step.outputSummary,
      },
    });
  }

  async logEvent(input: LogEventInput): Promise<TraceEvent> {
    const ev: TraceEvent = {
      id: `evt_${randomUUID()}`,
      runId: input.runId,
      level: input.level,
      message: input.message,
      timestamp: new Date().toISOString(),
      ...(input.stepId ? { stepId: input.stepId } : {}),
      ...(input.data ? { data: input.data } : {}),
    };
    const bucket = this.events.get(input.runId) ?? [];
    bucket.push(ev);
    this.events.set(input.runId, bucket);
    return ev;
  }

  async endTrace(input: EndTraceInput): Promise<void> {
    await this.logEvent({
      runId: input.runId,
      level: "info",
      message: "Trace finished",
      data: {
        totalDurationMs: input.totalDurationMs,
        answerLength: input.finalAnswer.length,
      },
    });
  }

  async getEvents(runId: string): Promise<TraceEvent[]> {
    return Promise.resolve([...(this.events.get(runId) ?? [])]);
  }

  getSteps(runId: string): GraphStep[] {
    return [...(this.steps.get(runId) ?? [])];
  }
}
