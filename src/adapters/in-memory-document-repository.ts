import type { DocumentChunk } from "../core/types.js";
import type { EmbedderPort } from "../ports/embedder.port.js";
import type {
  DocumentChunkWithScore,
  DocumentRepositoryPort,
  DocumentSearchInput,
} from "../ports/document-repository.port.js";
import { cosineSimilarity } from "./fake-embedder.js";

interface StoredChunk {
  chunk: DocumentChunk;
  embedding: number[];
}

/**
 * In-memory document chunk store. Suitable for tests and the deterministic
 * demo path. Replace with PostgresDocumentRepository in production.
 */
export class InMemoryDocumentRepository implements DocumentRepositoryPort {
  private readonly chunks: StoredChunk[] = [];

  async hydrate(chunks: DocumentChunk[], embedder: EmbedderPort): Promise<void> {
    const embeddings = await embedder.embedBatch(
      chunks.map((c) => `${c.title} ${c.content}`)
    );
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      if (!chunk || !embedding) continue;
      this.chunks.push({ chunk, embedding });
    }
  }

  async searchByVector(input: DocumentSearchInput): Promise<DocumentChunkWithScore[]> {
    const scored = this.chunks
      .map<DocumentChunkWithScore>((entry) => ({
        ...entry.chunk,
        similarity: cosineSimilarity(input.embedding, entry.embedding),
      }))
      .filter((c) => c.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.topK);

    return Promise.resolve(scored);
  }

  async insertChunks(
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      if (!chunk || !embedding) continue;
      this.chunks.push({ chunk, embedding });
    }
  }

  async list(): Promise<DocumentChunk[]> {
    return Promise.resolve(this.chunks.map((c) => c.chunk));
  }
}
