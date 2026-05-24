import type { MemoryRecord, MemoryType } from "../core/types.js";

export interface MemoryRecordWithScore extends MemoryRecord {
  similarity: number;
}

export interface MemorySearchInput {
  userId: string;
  embedding: number[];
  types: MemoryType[];
  topK: number;
  query?: string;
}

export interface MemoryInsertInput {
  userId: string;
  type: MemoryType;
  content: string;
  importance: number;
  embedding: number[];
  tags?: string[];
  source: MemoryRecord["source"];
  metadata?: MemoryRecord["metadata"];
}

export interface MemoryRepositoryPort {
  searchByVector(input: MemorySearchInput): Promise<MemoryRecordWithScore[]>;
  insert(input: MemoryInsertInput): Promise<MemoryRecord>;
  invalidate(id: string, reason: string): Promise<void>;
  touchAccessed(ids: string[]): Promise<void>;
  listByUser(userId: string): Promise<MemoryRecord[]>;
  getById(id: string): Promise<MemoryRecord | null>;
}
