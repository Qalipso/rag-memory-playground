import type { DocumentChunk } from "../core/types.js";

export interface DocumentChunkWithScore extends DocumentChunk {
  similarity: number;
}

export interface DocumentSearchInput {
  embedding: number[];
  topK: number;
  query?: string; // for hybrid / BM25 fallback
}

export interface DocumentRepositoryPort {
  searchByVector(input: DocumentSearchInput): Promise<DocumentChunkWithScore[]>;
  insertChunks(chunks: DocumentChunk[], embeddings: number[][]): Promise<void>;
  list(): Promise<DocumentChunk[]>;
}
