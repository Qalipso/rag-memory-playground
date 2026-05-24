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
 * Langfuse observability adapter.
 *
 * Mirrors LocalObservabilityProvider semantics and additionally pushes
 * traces/spans/events to Langfuse cloud (or self-hosted) when configured.
 *
 * Required env:
 *   LANGFUSE_PUBLIC_KEY
 *   LANGFUSE_SECRET_KEY
 *   LANGFUSE_BASE_URL  (optional; defaults to cloud.langfuse.com)
 *
 * The local event store is preserved so the API response and UI continue to
 * work even if Langfuse is unreachable.
 */
export interface LangfuseObservabilityOptions {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
}

export class LangfuseObservabilityProvider implements ObservabilityProvider {
  readonly name = "langfuse";
  readonly framework = "Langfuse";
  readonly mode = "real" as const;
  readonly version = "3.x";
  readonly requiredEnvVars: string[] = [
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
  ];

  private readonly events = new Map<string, TraceEvent[]>();
  private readonly steps = new Map<string, GraphStep[]>();
  private readonly traces = new Map<string, LangfuseTrace>();
  private clientPromise: Promise<LangfuseLike> | null = null;
  private readonly options: LangfuseObservabilityOptions;

  constructor(opts: LangfuseObservabilityOptions = {}) {
    this.options = {
      publicKey: opts.publicKey ?? process.env["LANGFUSE_PUBLIC_KEY"],
      secretKey: opts.secretKey ?? process.env["LANGFUSE_SECRET_KEY"],
      baseUrl: opts.baseUrl ?? process.env["LANGFUSE_BASE_URL"],
    };
    if (!this.options.publicKey || !this.options.secretKey) {
      throw new Error(
        "LangfuseObservabilityProvider requires LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY."
      );
    }
  }

  isConfigured(): boolean {
    return Boolean(
      process.env["LANGFUSE_PUBLIC_KEY"] && process.env["LANGFUSE_SECRET_KEY"]
    );
  }

  async startTrace(input: StartTraceInput): Promise<void> {
    const client = await this.getClient();
    const trace = client.trace({
      name: "rag-memory-run",
      id: input.runId,
      userId: input.userId,
      input: { message: input.message },
    });
    this.traces.set(input.runId, trace);

    await this.logEvent({
      runId: input.runId,
      level: "info",
      message: "Trace started (Langfuse)",
      data: { userId: input.userId },
    });
  }

  async logStep(input: LogStepInput): Promise<void> {
    const bucket = this.steps.get(input.runId) ?? [];
    bucket.push(input.step);
    this.steps.set(input.runId, bucket);

    const trace = this.traces.get(input.runId);
    if (trace) {
      trace.span({
        name: input.step.name,
        input: input.step.inputSummary,
        output: input.step.outputSummary,
        metadata: {
          framework: input.step.framework,
          status: input.step.status,
          durationMs: input.step.durationMs,
          ...(input.step.metadata ?? {}),
        },
      });
    }

    await this.logEvent({
      runId: input.runId,
      stepId: input.step.id,
      level: input.step.status === "failed" ? "error" : "info",
      message: `Step ${input.step.name} ${input.step.status}`,
      data: { framework: input.step.framework, durationMs: input.step.durationMs },
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

    const trace = this.traces.get(input.runId);
    if (trace) {
      trace.event({
        name: input.message,
        level: input.level,
        metadata: input.data,
      });
    }

    return ev;
  }

  async endTrace(input: EndTraceInput): Promise<void> {
    const trace = this.traces.get(input.runId);
    if (trace) {
      trace.update({ output: input.finalAnswer });
    }

    await this.logEvent({
      runId: input.runId,
      level: "info",
      message: "Trace finished (Langfuse)",
      data: { totalDurationMs: input.totalDurationMs },
    });

    const client = await this.getClient();
    await client.flushAsync?.();
  }

  async getEvents(runId: string): Promise<TraceEvent[]> {
    return Promise.resolve([...(this.events.get(runId) ?? [])]);
  }

  private async getClient(): Promise<LangfuseLike> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = (await import("langfuse")) as { Langfuse: new (o: LangfuseInit) => LangfuseLike };
        const init: LangfuseInit = {
          publicKey: this.options.publicKey!,
          secretKey: this.options.secretKey!,
        };
        if (this.options.baseUrl) init.baseUrl = this.options.baseUrl;
        return new mod.Langfuse(init);
      })();
    }
    return this.clientPromise;
  }
}

interface LangfuseInit {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

interface LangfuseTrace {
  span(args: {
    name: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
  }): unknown;
  event(args: {
    name: string;
    level?: string;
    metadata?: Record<string, unknown>;
  }): unknown;
  update(args: { output?: unknown }): unknown;
}

interface LangfuseLike {
  trace(args: {
    name: string;
    id?: string;
    userId?: string;
    input?: unknown;
  }): LangfuseTrace;
  flushAsync?(): Promise<void>;
}
