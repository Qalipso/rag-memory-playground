/**
 * Postgres + pgvector implementation of MemoryStore.
 *
 * Active when DATABASE_URL is set. Schema lives in
 * supabase/migrations/0001_memory.sql and is also ensured idempotently on first
 * use so a fresh database works without a manual migration step.
 */

import type { Pool as PoolType } from "pg";
import type { MemoryGraphSnapshot, MemoryStore } from "./store.js";
import type {
  ExtractedEntity,
  MemoryBlock,
  MemoryEdge,
  MemoryLevel,
} from "./types.js";

const SCHEMA_SQL = `
create extension if not exists vector;
create table if not exists memory_entities (
  id text primary key, user_id text not null, name text not null,
  kind text not null, created_at timestamptz not null default now()
);
create index if not exists memory_entities_user_idx on memory_entities (user_id);
create table if not exists memory_blocks (
  id text primary key, user_id text not null,
  level text not null, content text not null,
  entity_ids text[] not null default '{}', importance real not null default 0.5,
  embedding vector, embedding_dim int, source_note_id text not null,
  status text not null default 'active', created_at timestamptz not null default now()
);
create index if not exists memory_blocks_user_status_idx on memory_blocks (user_id, status);
create table if not exists memory_edges (
  id text primary key, user_id text not null,
  from_id text not null, to_id text not null, kind text not null,
  weight real not null default 1, reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists memory_edges_user_idx on memory_edges (user_id);
`;

function toVectorLiteral(embedding: number[]): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
}

function parseVector(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string" && raw.length > 1) {
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

export class PgMemoryStore implements MemoryStore {
  readonly backend = "postgres" as const;
  private pool: PoolType | null = null;
  private readyPromise: Promise<void> | null = null;
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  private async getPool(): Promise<PoolType> {
    if (this.pool) return this.pool;
    const { Pool } = await import("pg");
    this.pool = new Pool({
      connectionString: this.connectionString,
      max: 3,
      ...(this.connectionString.includes("supabase")
        ? { ssl: { rejectUnauthorized: false } }
        : {}),
    });
    return this.pool;
  }

  private async ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        const pool = await this.getPool();
        await pool.query(SCHEMA_SQL);
      })();
    }
    return this.readyPromise;
  }

  async upsertEntities(userId: string, entities: ExtractedEntity[]): Promise<void> {
    if (entities.length === 0) return;
    await this.ready();
    const pool = await this.getPool();
    for (const e of entities) {
      await pool.query(
        `insert into memory_entities (id, user_id, name, kind)
         values ($1,$2,$3,$4)
         on conflict (id) do update set name = excluded.name, kind = excluded.kind`,
        [e.id, userId, e.name, e.kind]
      );
    }
  }

  async addBlocks(blocks: MemoryBlock[]): Promise<void> {
    if (blocks.length === 0) return;
    await this.ready();
    const pool = await this.getPool();
    for (const b of blocks) {
      await pool.query(
        `insert into memory_blocks
           (id, user_id, level, content, entity_ids, importance, embedding, embedding_dim, source_note_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (id) do nothing`,
        [
          b.id,
          b.userId,
          b.level,
          b.content,
          b.entityIds,
          b.importance,
          toVectorLiteral(b.embedding),
          b.embedding.length || null,
          b.sourceNoteId,
          b.status,
        ]
      );
    }
  }

  async addEdges(edges: MemoryEdge[]): Promise<void> {
    if (edges.length === 0) return;
    await this.ready();
    const pool = await this.getPool();
    for (const e of edges) {
      // user_id derived from the source block.
      await pool.query(
        `insert into memory_edges (id, user_id, from_id, to_id, kind, weight, reason)
         values ($1, (select user_id from memory_blocks where id = $2), $2, $3, $4, $5, $6)
         on conflict (id) do nothing`,
        [e.id, e.from, e.to, e.kind, e.weight, e.reason]
      );
    }
  }

  async activeBlocks(userId: string): Promise<MemoryBlock[]> {
    await this.ready();
    const pool = await this.getPool();
    const res = await pool.query(
      `select * from memory_blocks where user_id = $1 and status = 'active'`,
      [userId]
    );
    return res.rows.map(rowToBlock);
  }

  async snapshot(userId: string): Promise<MemoryGraphSnapshot> {
    await this.ready();
    const pool = await this.getPool();
    const blocksRes = await pool.query(
      `select * from memory_blocks where user_id = $1`,
      [userId]
    );
    const blocks = blocksRes.rows.map(rowToBlock);
    const edgesRes = await pool.query(
      `select * from memory_edges where user_id = $1`,
      [userId]
    );
    const blockIds = new Set(blocks.map((b) => b.id));
    const edges: MemoryEdge[] = edgesRes.rows
      .filter((r) => blockIds.has(r.from_id) && blockIds.has(r.to_id))
      .map((r) => ({
        id: r.id,
        from: r.from_id,
        to: r.to_id,
        kind: r.kind,
        weight: r.weight,
        reason: r.reason,
      }));
    const entitiesRes = await pool.query(
      `select * from memory_entities where user_id = $1`,
      [userId]
    );
    const referenced = new Set(blocks.flatMap((b) => b.entityIds));
    const entities: ExtractedEntity[] = entitiesRes.rows
      .filter((r) => referenced.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
    return { blocks, edges, entities };
  }

  async setBlockStatus(id: string, status: MemoryBlock["status"]): Promise<void> {
    await this.ready();
    const pool = await this.getPool();
    await pool.query(`update memory_blocks set status = $2 where id = $1`, [id, status]);
  }

  async clear(userId: string): Promise<void> {
    await this.ready();
    const pool = await this.getPool();
    await pool.query(`delete from memory_blocks where user_id = $1`, [userId]);
    await pool.query(`delete from memory_entities where user_id = $1`, [userId]);
  }
}

function rowToBlock(r: Record<string, unknown>): MemoryBlock {
  return {
    id: r["id"] as string,
    userId: r["user_id"] as string,
    level: r["level"] as MemoryLevel,
    content: r["content"] as string,
    entityIds: (r["entity_ids"] as string[]) ?? [],
    importance: Number(r["importance"] ?? 0.5),
    embedding: parseVector(r["embedding"]),
    sourceNoteId: r["source_note_id"] as string,
    createdAt:
      r["created_at"] instanceof Date
        ? (r["created_at"] as Date).toISOString()
        : String(r["created_at"]),
    status: r["status"] as MemoryBlock["status"],
  };
}
