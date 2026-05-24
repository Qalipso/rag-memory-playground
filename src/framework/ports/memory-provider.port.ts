import type { ProviderMode, RetrievedMemory } from "../types.js";

export interface MemorySearchInput {
  userId: string;
  query: string;
  topK: number;
}

export interface MemoryAddInput {
  userId: string;
  content: string;
  type: RetrievedMemory["type"];
  metadata?: Record<string, unknown>;
}

export interface MemoryListInput {
  userId: string;
  limit?: number;
}

export interface MemoryProvider {
  readonly name: string;
  readonly framework: string;
  readonly mode: ProviderMode;
  readonly version?: string;
  readonly requiredEnvVars: string[];
  isConfigured(): boolean;
  search(input: MemorySearchInput): Promise<RetrievedMemory[]>;
  add(input: MemoryAddInput): Promise<{ id: string }>;
  listAll(input: MemoryListInput): Promise<RetrievedMemory[]>;
}
