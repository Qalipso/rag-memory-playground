/**
 * RagMemoryEngine — public types.
 * Theoretical foundation: ../../GUIDE.md and ../../THEORY.md.
 */

// ---------- Engine input / mode ----------

export type EngineMode = "auto" | "rag" | "memory" | "long_context" | "hybrid";

export interface RagMemoryInput {
  userId: string;
  conversationId?: string;
  message: string;
  mode?: EngineMode;
  config?: DeepPartial<EngineConfig>;
}

// ---------- Engine config ----------

export type RetrievalMode = "dense" | "bm25" | "hybrid";
export type MemoryWritePolicy = "never" | "ask" | "auto_high_confidence";

export interface EngineConfig {
  retrieval: {
    mode: RetrievalMode;
    topK: number;
    rerank: boolean;
    minScore: number;
  };
  memory: {
    enabledTypes: MemoryType[];
    writePolicy: MemoryWritePolicy;
    consolidationEnabled: boolean;
    forgettingEnabled: boolean;
    contradictionDetection: boolean;
  };
  scoring: {
    relevanceWeight: number;
    recencyWeight: number;
    importanceWeight: number;
  };
  generation: {
    maxContextTokens: number;
    citeSources: boolean;
    strictGrounding: boolean;
  };
}

// ---------- Memory ----------

export type MemoryType = "working" | "episodic" | "semantic" | "procedural";
export type MemoryStatus = "active" | "stale" | "invalidated" | "archived";
export type MemorySource = "chat" | "document" | "reflection" | "manual";

export interface MemoryRecord {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;

  importance: number; // 0..1
  embedding?: number[];

  tags: string[];
  source: MemorySource;

  createdAt: string;
  lastAccessedAt?: string;
  expiresAt?: string;

  status: MemoryStatus;

  metadata?: {
    confidence?: number;
    relatedEntity?: string;
    invalidatesMemoryId?: string;
    reason?: string;
  };
}

// ---------- Documents ----------

export interface DocumentChunk {
  id: string;
  documentId: string;
  title: string;
  content: string;
  chunkIndex: number;
  metadata?: Record<string, unknown>;
}

// ---------- Retrieval ----------

export interface RetrievalHit<T> {
  item: T;
  relevance: number;
  recency?: number;
  importance?: number;
  finalScore: number;
  reasons: string[];
}

// ---------- Routing ----------

export interface RouteDecision {
  mode: EngineMode;
  useDocuments: boolean;
  useMemory: boolean;
  useLongContext: boolean;
  reason: string;
  confidence: number;
}

// ---------- Memory write proposals ----------

export interface MemoryWriteCandidate {
  id: string;
  shouldSave: boolean;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  reason: string;
  requiresUserApproval: boolean;
}

// ---------- Evaluation ----------

export interface EvaluationResult {
  faithfulness: number;
  contextRelevance: number;
  answerRelevance: number;
  latencyMs?: number;
  estimatedCost?: number;
  warnings: string[];
}

// ---------- Trace ----------

export type TraceEventType =
  | "input_received"
  | "intent_detected"
  | "route_selected"
  | "documents_retrieved"
  | "memories_retrieved"
  | "items_reranked"
  | "context_built"
  | "answer_generated"
  | "memory_write_decision"
  | "memory_saved"
  | "memory_updated"
  | "memory_invalidated"
  | "evaluation_completed"
  | "failure_detected";

export interface TraceEvent {
  id: string;
  runId: string;
  type: TraceEventType;
  label: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

// ---------- Context ----------

export type IncludedItemKind = "memory" | "document";

export type ExclusionReason =
  | "below_min_score"
  | "token_budget_exceeded"
  | "duplicate"
  | "stale"
  | "route_disabled";

export interface IncludedItem {
  id: string;
  type: IncludedItemKind;
  score: number;
  reason: string;
  tokensEstimate: number;
}

export interface ExcludedItem {
  id: string;
  type: IncludedItemKind;
  score: number;
  reason: ExclusionReason;
}

export interface BuiltContext {
  systemPrompt: string;
  memoryContext: string;
  documentContext: string;
  finalPrompt: string;
  includedItems: IncludedItem[];
  excludedItems: ExcludedItem[];
  tokenBudget: {
    max: number;
    used: number;
    reserved: number;
  };
}

// ---------- Engine output ----------

export interface RagMemoryOutput {
  runId: string;
  answer: string;
  route: RouteDecision;
  sources: RetrievalHit<DocumentChunk>[];
  usedMemories: RetrievalHit<MemoryRecord>[];
  memoryWriteCandidates: MemoryWriteCandidate[];
  metrics: EvaluationResult;
  trace: TraceEvent[];
}

// ---------- Utility ----------

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
