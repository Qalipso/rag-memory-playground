/**
 * Knowledge Sources — dynamic corpus items added at runtime.
 *
 * Independent from the static seedDocuments; rendered alongside them by the
 * RAG provider. Tracks indexing status so UI can show health per source.
 */

export type KnowledgeSourceType = "link" | "file" | "sample" | "github" | "manual";
export type KnowledgeSourceStatus =
  | "queued"
  | "indexing"
  | "indexed"
  | "failed";

export interface KnowledgeChunk {
  id: string;
  sourceId: string;
  title: string;
  source: string;
  content: string;
  chunkIndex: number;
}

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  title: string;
  url?: string;
  tags: string[];
  status: KnowledgeSourceStatus;
  charsExtracted: number;
  chunksCreated: number;
  providerMode: "real" | "stub" | "fallback";
  createdAt: string;
  lastIndexedAt: string;
  error?: string;
}
