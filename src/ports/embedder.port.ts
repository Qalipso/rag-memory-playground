/**
 * Embedder port. Phase 2 abstraction.
 * Implementations: FakeEmbedder (deterministic), OpenAIEmbedder (real).
 */
export interface EmbedderPort {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
