/**
 * In-memory knowledge source store. Singleton per Node process.
 *
 * Sources added at runtime via the Settings UI live here. The RAG provider
 * reads chunks from this store alongside the static seedDocuments.
 *
 * Phase 2 swap: persist to Postgres + pgvector and let LlamaIndex index real
 * embeddings.
 */

import { randomUUID } from "node:crypto";
import { seedDocuments } from "../data/seed.js";
import { getGoldKnowledgeChunks } from "../gold/knowledge.js";
import type {
  KnowledgeChunk,
  KnowledgeSource,
  KnowledgeSourceType,
} from "./types.js";
import { chunkText, fetchAndExtract } from "./ingest.js";

export interface AddLinkInput {
  url: string;
  title?: string;
  tags?: string[];
  providerMode: "real" | "stub" | "fallback";
}

export interface AddFileInput {
  /** Original file name. */
  fileName: string;
  /** Optional path relative to uploaded folder root (webkitRelativePath). */
  relativePath?: string;
  /** Plain-text content already extracted. */
  content: string;
  tags?: string[];
  providerMode: "real" | "stub" | "fallback";
}

export interface KnowledgeSourceWithChunks {
  source: KnowledgeSource;
  chunks: KnowledgeChunk[];
}

class KnowledgeStore {
  private readonly bySource = new Map<string, KnowledgeSourceWithChunks>();

  list(): KnowledgeSource[] {
    return Array.from(this.bySource.values())
      .map((entry) => entry.source)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  allChunks(): KnowledgeChunk[] {
    const dynamic = Array.from(this.bySource.values()).flatMap((e) => e.chunks);
    // Seed docs are also surfaced as chunks for retrieval.
    const seedChunks: KnowledgeChunk[] = seedDocuments.map((d) => ({
      id: d.id,
      sourceId: "seed",
      title: d.title,
      source: d.source,
      content: d.content,
      chunkIndex: 0,
    }));
    // Gold Memory Lab corpus: always-available macro-history documents.
    return [...seedChunks, ...getGoldKnowledgeChunks(), ...dynamic];
  }

  getById(id: string): KnowledgeSourceWithChunks | undefined {
    return this.bySource.get(id);
  }

  async addLink(input: AddLinkInput): Promise<KnowledgeSource> {
    const id = `src_${randomUUID()}`;
    const now = new Date().toISOString();

    // Insert placeholder so list() shows indexing state immediately.
    const placeholder: KnowledgeSource = {
      id,
      type: "link",
      title: input.title?.trim() || input.url,
      url: input.url,
      tags: input.tags ?? [],
      status: "indexing",
      charsExtracted: 0,
      chunksCreated: 0,
      providerMode: input.providerMode,
      createdAt: now,
      lastIndexedAt: now,
    };
    this.bySource.set(id, { source: placeholder, chunks: [] });

    try {
      const doc = await fetchAndExtract(input.url);
      const chunks = chunkText(doc.content);

      const knowledgeChunks: KnowledgeChunk[] = chunks.map((c) => ({
        id: `${id}_chunk_${c.chunkIndex}`,
        sourceId: id,
        title: input.title?.trim() || doc.title,
        source: input.url,
        content: c.content,
        chunkIndex: c.chunkIndex,
      }));

      const finalSource: KnowledgeSource = {
        ...placeholder,
        title: input.title?.trim() || doc.title,
        status: "indexed",
        charsExtracted: doc.charsExtracted,
        chunksCreated: knowledgeChunks.length,
        lastIndexedAt: new Date().toISOString(),
      };
      this.bySource.set(id, { source: finalSource, chunks: knowledgeChunks });
      return finalSource;
    } catch (err) {
      const failed: KnowledgeSource = {
        ...placeholder,
        status: "failed",
        error: (err as Error).message,
        lastIndexedAt: new Date().toISOString(),
      };
      this.bySource.set(id, { source: failed, chunks: [] });
      return failed;
    }
  }

  /**
   * Add a single file already extracted as plain text.
   * Synchronous chunking; no network IO.
   * Idempotent: if a source with the same normalised path already exists,
   * returns the existing source without re-indexing.
   */
  addFile(input: AddFileInput): KnowledgeSource {
    const normalizedPath = input.relativePath || input.fileName;
    for (const entry of this.bySource.values()) {
      if (entry.source.title === normalizedPath) return entry.source;
    }

    const id = `src_${randomUUID()}`;
    const now = new Date().toISOString();
    const title = normalizedPath;

    const chunks = chunkText(input.content);
    const knowledgeChunks: KnowledgeChunk[] = chunks.map((c) => ({
      id: `${id}_chunk_${c.chunkIndex}`,
      sourceId: id,
      title,
      source: input.fileName,
      content: c.content,
      chunkIndex: c.chunkIndex,
    }));

    const source: KnowledgeSource = {
      id,
      type: "file",
      title,
      tags: input.tags ?? [],
      status: knowledgeChunks.length > 0 ? "indexed" : "failed",
      charsExtracted: input.content.length,
      chunksCreated: knowledgeChunks.length,
      providerMode: input.providerMode,
      createdAt: now,
      lastIndexedAt: now,
      ...(knowledgeChunks.length === 0 ? { error: "Empty file content." } : {}),
    };
    this.bySource.set(id, { source, chunks: knowledgeChunks });
    return source;
  }

  loadSamples(providerMode: "real" | "stub" | "fallback"): KnowledgeSource[] {
    // Promote a few of the static seed docs into the dynamic list so user can
    // see / test / delete them without touching the seed module.
    const samples = seedDocuments.slice(0, 3);
    const added: KnowledgeSource[] = [];
    const now = new Date().toISOString();
    for (const d of samples) {
      const id = `src_sample_${d.id}`;
      if (this.bySource.has(id)) continue; // idempotent
      const source: KnowledgeSource = {
        id,
        type: "sample",
        title: d.title,
        url: d.source,
        tags: ["sample"],
        status: "indexed",
        charsExtracted: d.content.length,
        chunksCreated: 1,
        providerMode,
        createdAt: now,
        lastIndexedAt: now,
      };
      const chunks: KnowledgeChunk[] = [
        {
          id: `${id}_chunk_0`,
          sourceId: id,
          title: d.title,
          source: d.source,
          content: d.content,
          chunkIndex: 0,
        },
      ];
      this.bySource.set(id, { source, chunks });
      added.push(source);
    }
    return added;
  }

  async resync(
    id: string,
    providerMode: "real" | "stub" | "fallback"
  ): Promise<KnowledgeSource | null> {
    const existing = this.bySource.get(id);
    if (!existing) return null;
    if (existing.source.type !== "link" || !existing.source.url) {
      return existing.source;
    }
    return this.addLink({
      url: existing.source.url,
      title: existing.source.title,
      tags: existing.source.tags,
      providerMode,
    }).then((fresh) => {
      // Replace under the same id for stable cards in UI.
      this.bySource.delete(fresh.id);
      this.bySource.set(id, {
        source: { ...fresh, id },
        chunks: this.bySource.get(fresh.id)?.chunks.map((c) => ({ ...c, sourceId: id })) ?? [],
      });
      return { ...fresh, id };
    });
  }

  delete(id: string): boolean {
    return this.bySource.delete(id);
  }

  countDynamicSources(): number {
    return this.bySource.size;
  }
}

// Use globalThis so the singleton survives Next.js dev-mode hot reloads
// (module-level variables get reset on each hot reload; globalThis does not).
declare global {
  // eslint-disable-next-line no-var
  var __knowledgeStore: KnowledgeStore | undefined;
}

export function getKnowledgeStore(): KnowledgeStore {
  if (!globalThis.__knowledgeStore) globalThis.__knowledgeStore = new KnowledgeStore();
  return globalThis.__knowledgeStore;
}

export function resetKnowledgeStore(): void {
  globalThis.__knowledgeStore = undefined;
}

export type { KnowledgeStore };
