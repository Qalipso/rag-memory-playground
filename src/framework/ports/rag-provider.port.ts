import type { ProviderMode, RetrievedDocument } from "../types.js";

export interface RagSearchInput {
  query: string;
  topK: number;
}

export interface RagProvider {
  readonly name: string;
  readonly framework: string;
  readonly mode: ProviderMode;
  readonly version?: string;
  readonly requiredEnvVars: string[];
  isConfigured(): boolean;
  search(input: RagSearchInput): Promise<RetrievedDocument[]>;
}
