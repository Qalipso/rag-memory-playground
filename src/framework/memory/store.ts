/**
 * Memory store abstraction with two implementations:
 *
 *   InMemoryStore — default, zero-dependency, per-process (globalThis singleton).
 *   PgMemoryStore  — Postgres + pgvector, active when DATABASE_URL is set.
 *
 * The pipeline depends on this async interface, so persistence is a drop-in.
 */

import { createRequire } from "node:module";
import type { ExtractedEntity, MemoryBlock, MemoryEdge } from "./types.js";

export interface MemoryGraphSnapshot {
  blocks: MemoryBlock[];
  edges: MemoryEdge[];
  entities: ExtractedEntity[];
}

export interface MemoryStore {
  readonly backend: "in-memory" | "postgres";
  upsertEntities(userId: string, entities: ExtractedEntity[]): Promise<void>;
  addBlocks(blocks: MemoryBlock[]): Promise<void>;
  addEdges(edges: MemoryEdge[]): Promise<void>;
  activeBlocks(userId: string): Promise<MemoryBlock[]>;
  snapshot(userId: string): Promise<MemoryGraphSnapshot>;
  setBlockStatus(id: string, status: MemoryBlock["status"]): Promise<void>;
  clear(userId: string): Promise<void>;
}

class InMemoryStore implements MemoryStore {
  readonly backend = "in-memory" as const;
  private readonly blocks = new Map<string, MemoryBlock>();
  private readonly edges = new Map<string, MemoryEdge>();
  private readonly entities = new Map<string, ExtractedEntity>();

  async upsertEntities(_userId: string, entities: ExtractedEntity[]): Promise<void> {
    for (const e of entities) this.entities.set(e.id, e);
  }

  async addBlocks(blocks: MemoryBlock[]): Promise<void> {
    for (const b of blocks) this.blocks.set(b.id, b);
  }

  async addEdges(edges: MemoryEdge[]): Promise<void> {
    for (const e of edges) this.edges.set(e.id, e);
  }

  async activeBlocks(userId: string): Promise<MemoryBlock[]> {
    return Array.from(this.blocks.values()).filter(
      (b) => b.userId === userId && b.status === "active"
    );
  }

  async snapshot(userId: string): Promise<MemoryGraphSnapshot> {
    const blocks = Array.from(this.blocks.values()).filter((b) => b.userId === userId);
    const blockIds = new Set(blocks.map((b) => b.id));
    const edges = Array.from(this.edges.values()).filter(
      (e) => blockIds.has(e.from) && blockIds.has(e.to)
    );
    const entityIds = new Set(blocks.flatMap((b) => b.entityIds));
    const entities = Array.from(this.entities.values()).filter((e) => entityIds.has(e.id));
    return { blocks, edges, entities };
  }

  async setBlockStatus(id: string, status: MemoryBlock["status"]): Promise<void> {
    const b = this.blocks.get(id);
    if (b) this.blocks.set(id, { ...b, status });
  }

  async clear(userId: string): Promise<void> {
    for (const [id, b] of this.blocks) if (b.userId === userId) this.blocks.delete(id);
    for (const [id, e] of this.edges) {
      if (!this.blocks.has(e.from) || !this.blocks.has(e.to)) this.edges.delete(id);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __memoryStore: MemoryStore | undefined;
}

export function getMemoryStore(): MemoryStore {
  if (!globalThis.__memoryStore) {
    globalThis.__memoryStore = selectStore();
  }
  return globalThis.__memoryStore;
}

function selectStore(): MemoryStore {
  const url = process.env["DATABASE_URL"];
  if (!url) return new InMemoryStore();

  // Lazy-load the Postgres backend so `pg` is only required when persistence
  // is enabled. Under Next.js/webpack the literal `require("./pg.js")` is
  // statically bundled. Under a pure-ESM runner (tsx) `require` is undefined,
  // so fall back to createRequire bound to this module.
  if (typeof require === "function") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./pg.js") as typeof import("./pg.js");
    return new mod.PgMemoryStore(url);
  }
  const req = createRequire(import.meta.url);
  const mod = req("./pg.js") as typeof import("./pg.js");
  return new mod.PgMemoryStore(url);
}

export function resetMemoryStore(): void {
  globalThis.__memoryStore = undefined;
}

export { InMemoryStore };
