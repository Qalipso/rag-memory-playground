import type {
  GraphStep,
  ProviderMode,
  TraceEvent,
  TraceEventLevel,
} from "../types.js";

export interface StartTraceInput {
  runId: string;
  userId: string;
  message: string;
}

export interface LogStepInput {
  runId: string;
  step: GraphStep;
}

export interface LogEventInput {
  runId: string;
  stepId?: string;
  level: TraceEventLevel;
  message: string;
  data?: Record<string, unknown>;
}

export interface EndTraceInput {
  runId: string;
  finalAnswer: string;
  totalDurationMs: number;
}

export interface ObservabilityProvider {
  readonly name: string;
  readonly framework: string;
  readonly mode: ProviderMode;
  readonly version?: string;
  readonly requiredEnvVars: string[];
  isConfigured(): boolean;

  startTrace(input: StartTraceInput): Promise<void>;
  logStep(input: LogStepInput): Promise<void>;
  logEvent(input: LogEventInput): Promise<TraceEvent>;
  endTrace(input: EndTraceInput): Promise<void>;

  getEvents(runId: string): Promise<TraceEvent[]>;
}
