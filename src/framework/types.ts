/**
 * Framework-first engine types.
 *
 * ExplainableRun is the unified, honest output of a LangGraph workflow that
 * orchestrates retrieval (LlamaIndex.TS), memory (Mem0 / Letta adapter),
 * generation (OpenAI / local), evaluation (Ragas-shaped adapter), and
 * observability (Langfuse / local trace).
 *
 * "Honest" means: if a provider is running as a stub or a fallback, we say so
 * in providerStatus and surface it as a failure mode.
 */

export type EngineMode = "auto" | "rag" | "memory" | "long_context" | "hybrid";
export type ProviderMode = "real" | "stub" | "fallback";

export interface FrameworkInput {
  userId: string;
  conversationId?: string;
  message: string;
  mode?: EngineMode;
}

// ---------- Route ----------

export interface Route {
  mode: EngineMode;
  useDocuments: boolean;
  useMemory: boolean;
  useLongContext: boolean;
  reason: string;
  confidence: number;
}

// ---------- Retrieved items ----------

export interface RetrievedDocument {
  id: string;
  title: string;
  content: string;
  source: string;
  score: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievedMemory {
  id: string;
  type: "working" | "episodic" | "semantic" | "procedural";
  content: string;
  score: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

// ---------- Final context ----------

export interface FinalContext {
  systemPrompt: string;
  memoryBlock: string;
  documentBlock: string;
  finalPrompt: string;
  tokensEstimate: number;
}

// ---------- Evaluation ----------

export interface EvaluationScore {
  name: string;
  score: number; // 0..1
  explanation: string;
}

export interface EvaluationsResult {
  faithfulness: EvaluationScore;
  contextRelevance: EvaluationScore;
  answerRelevance: EvaluationScore;
  custom: EvaluationScore[];
  warnings: string[];
}

// ---------- Graph step (LangGraph node execution record) ----------

export type GraphStepStatus = "pending" | "running" | "ok" | "skipped" | "failed";

export interface GraphStep {
  id: string;
  name: string;
  framework: string;
  providerMode: ProviderMode;
  status: GraphStepStatus;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

// ---------- Observability trace event ----------

export type TraceEventLevel = "info" | "debug" | "warn" | "error";

export interface TraceEvent {
  id: string;
  runId: string;
  stepId?: string;
  level: TraceEventLevel;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

// ---------- Failure modes ----------

export type FailureModeType =
  | "empty_context"
  | "low_retrieval_score"
  | "route_mismatch"
  | "framework_error"
  | "evaluation_failed"
  | "provider_fallback_used"
  | "no_documents_retrieved"
  | "no_memories_retrieved"
  | "low_context_relevance"
  | "evaluation_stub_used"
  | "missing_observability_keys";

export interface FailureMode {
  id: string;
  type: FailureModeType;
  description: string;
  severity: "info" | "warn" | "critical";
  stepId?: string;
}

// ---------- Provider status (honest disclosure) ----------

export type ProviderRole = "rag" | "memory" | "llm" | "evaluation" | "observability";

export interface ProviderStatus {
  role: ProviderRole;
  name: string;
  framework: string;
  mode: ProviderMode;
  reason: string;
  requiredEnvVars: string[];
  isConfigured: boolean;
  version?: string;
}

// ---------- Debug envelope ----------

export interface DebugEnvelope {
  /** Snapshot of process.env keys actually consulted, with values hidden. */
  envHints: Array<{ key: string; present: boolean }>;
  /** Container build decisions, in order. */
  containerDecisions: Array<{ role: ProviderRole; decision: string }>;
  /** Workflow execution metadata. */
  workflow: {
    nodeOrder: string[];
    skippedNodes: string[];
    failedNodes: string[];
  };
}

// ---------- ExplainableRun (final output) ----------

export interface ExplainableRun {
  runId: string;
  input: FrameworkInput;
  route: Route;
  providerStatus: ProviderStatus[];
  graphSteps: GraphStep[];
  retrievedDocuments: RetrievedDocument[];
  retrievedMemories: RetrievedMemory[];
  finalContext: FinalContext;
  answer: string;
  evaluations: EvaluationsResult;
  trace: TraceEvent[];
  failureModes: FailureMode[];
  debug: DebugEnvelope;
  meta: {
    startedAt: string;
    finishedAt: string;
    totalDurationMs: number;
    frameworks: FrameworkSummary;
  };
}

export interface FrameworkSummary {
  orchestration: { name: string; mode: ProviderMode; version?: string };
  rag: { name: string; mode: ProviderMode; version?: string };
  memory: { name: string; mode: ProviderMode; version?: string };
  llm: { name: string; mode: ProviderMode; version?: string };
  evaluation: { name: string; mode: ProviderMode; version?: string };
  observability: { name: string; mode: ProviderMode; version?: string };
}
