import { randomUUID } from "node:crypto";
import type { MemoryRecord } from "../core/types.js";
import type { EmbedderPort } from "../ports/embedder.port.js";
import type {
  MemoryInsertInput,
  MemoryRecordWithScore,
  MemoryRepositoryPort,
  MemorySearchInput,
} from "../ports/memory-repository.port.js";
import { cosineSimilarity } from "./fake-embedder.js";

interface StoredMemory {
  record: MemoryRecord;
  embedding: number[];
}

/**
 * In-memory memory store with vector search via cosine similarity.
 * Supports insert, invalidate, touchAccessed, and listByUser.
 * Replace with PostgresMemoryRepository for durable storage.
 */
export class InMemoryMemoryRepository implements MemoryRepositoryPort {
  private readonly memories: StoredMemory[] = [];

  async hydrate(records: MemoryRecord[], embedder: EmbedderPort): Promise<void> {
    const embeddings = await embedder.embedBatch(
      records.map((m) => `${m.content} ${m.tags.join(" ")}`)
    );
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const embedding = embeddings[i];
      if (!record || !embedding) continue;
      this.memories.push({ record, embedding });
    }
  }

  async searchByVector(input: MemorySearchInput): Promise<MemoryRecordWithScore[]> {
    const enabledTypes = new Set(input.types);

    const candidates = this.memories
      .filter((m) => m.record.userId === input.userId)
      .filter((m) => m.record.status === "active")
      .filter((m) => enabledTypes.has(m.record.type));

    const scored = candidates
      .map<MemoryRecordWithScore>((entry) => ({
        ...entry.record,
        similarity: cosineSimilarity(input.embedding, entry.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, input.topK);

    return Promise.resolve(scored);
  }

  async insert(input: MemoryInsertInput): Promise<MemoryRecord> {
    const now = new Date().toISOString();
    const record: MemoryRecord = {
      id: `mem_${randomUUID()}`,
      userId: input.userId,
      type: input.type,
      content: input.content,
      importance: input.importance,
      tags: input.tags ?? [],
      source: input.source,
      createdAt: now,
      lastAccessedAt: now,
      status: "active",
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    this.memories.push({ record, embedding: input.embedding });
    return Promise.resolve(record);
  }

  async invalidate(id: string, reason: string): Promise<void> {
    const entry = this.memories.find((m) => m.record.id === id);
    if (!entry) return;
    entry.record = {
      ...entry.record,
      status: "invalidated",
      metadata: { ...(entry.record.metadata ?? {}), reason },
    };
  }

  async touchAccessed(ids: string[]): Promise<void> {
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    for (const entry of this.memories) {
      if (idSet.has(entry.record.id)) {
        entry.record = { ...entry.record, lastAccessedAt: now };
      }
    }
  }

  async listByUser(userId: string): Promise<MemoryRecord[]> {
    return Promise.resolve(
      this.memories.filter((m) => m.record.userId === userId).map((m) => m.record)
    );
  }

  async getById(id: string): Promise<MemoryRecord | null> {
    const entry = this.memories.find((m) => m.record.id === id);
    return Promise.resolve(entry?.record ?? null);
  }
}
