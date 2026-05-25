/**
 * RAG Memory Playground MVP types.
 *
 * Phase 0: keyword retrieval (heuristic, no LLM).
 * Phase 1 (S4): real OpenAI embeddings via /api/embed + cosine similarity.
 */

export type FileKind = "md" | "txt" | "json" | "code" | "unknown";
export type ChunkType = "docs" | "code" | "config" | "unknown";
export type BlockType = "Feature" | "Decision" | "Risk" | "Todo" | "Concept";
export type SourceStatus = "indexed" | "skipped";
export type RetrievalMode = "keyword" | "embedding";

export interface SourceFile {
  id: string;
  name: string;
  path: string;
  type: FileKind;
  content: string;
  status: SourceStatus;
  chunkCount: number;
  summary: string;
  skipReason?: string;
}

export interface MemoryChunk {
  id: string;
  sourceId: string;
  sourceName: string;
  text: string;
  index: number;
  type: ChunkType;
  charCount: number;
  keywords: string[];
  /** Populated after embedChunks() call. 1536-dim OpenAI embedding. */
  embedding?: number[];
}

export interface MemoryBlock {
  id: string;
  type: BlockType;
  title: string;
  summary: string;
  sources: string[];
  chunkIds: string[];
  confidence: number;
  evidence: string[];
}

export interface RetrievedChunk {
  chunkId: string;
  sourceName: string;
  preview: string;
  score: number;
  matchedTerms: string[];
}

export interface RetrievalTrace {
  question: string;
  queryTerms: string[];
  searchedSourcesCount: number;
  searchedChunksCount: number;
  retrievedChunks: RetrievedChunk[];
  matchedBlocks: Array<{ id: string; type: BlockType; title: string; score: number }>;
  finalSources: string[];
  confidence: "low" | "medium" | "high";
  warnings: string[];
}

/** Ragas-shaped deterministic evaluation scores (0–1 each). */
export interface EvalResult {
  faithfulness:     number; // answer grounded in retrieved context (heuristic)
  answerRelevancy:  number; // answer addresses the question
  contextPrecision: number; // retrieved chunks are on-topic
  contextRecall:    number; // context covers the question's info need
  overall:          number; // weighted composite
  /** Real LLM faithfulness score when /api/faithfulness was called. */
  llmFaithfulness?: number;
  llmFaithfulnessRationale?: string;
  /** @internal */
  _n: number;
}

export interface AskResult {
  answer: string;
  sources: string[];
  chunks: RetrievedChunk[];
  blocks: MemoryBlock[];
  confidence: "low" | "medium" | "high";
  trace: RetrievalTrace;
  eval?: EvalResult;
}
