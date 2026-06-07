/**
 * Postgres implementation of RunStore. Stores the full ExplainableRun as JSONB
 * plus denormalized summary columns for cheap listing. Schema in
 * supabase/migrations/0002_runs.sql, ensured idempotently on first use.
 */

import type { Pool as PoolType } from "pg";
import type { ExplainableRun } from "../types.js";
import {
  toSummary,
  type RunRecord,
  type RunStore,
  type RunSummary,
} from "./store.js";

const SCHEMA_SQL = `
create table if not exists run_history (
  id text primary key,
  user_id text not null,
  message text not null,
  route_mode text not null,
  faithfulness real not null default 0,
  total_duration_ms int not null default 0,
  run jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists run_history_user_idx on run_history (user_id, created_at desc);
`;

export class PgRunStore implements RunStore {
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
      max: 2,
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

  async save(record: RunRecord): Promise<void> {
    await this.ready();
    const pool = await this.getPool();
    const s = toSummary(record);
    await pool.query(
      `insert into run_history
         (id, user_id, message, route_mode, faithfulness, total_duration_ms, run, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do nothing`,
      [
        record.id,
        record.userId,
        s.message,
        s.routeMode,
        s.faithfulness,
        s.totalDurationMs,
        JSON.stringify(record.run),
        record.createdAt,
      ]
    );
  }

  async get(id: string): Promise<RunRecord | null> {
    await this.ready();
    const pool = await this.getPool();
    const res = await pool.query(`select * from run_history where id = $1`, [id]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      run: (typeof row.run === "string" ? JSON.parse(row.run) : row.run) as ExplainableRun,
    };
  }

  async list(userId: string, limit = 50): Promise<RunSummary[]> {
    await this.ready();
    const pool = await this.getPool();
    const res = await pool.query(
      `select id, user_id, message, route_mode, faithfulness, total_duration_ms, created_at
       from run_history where user_id = $1 order by created_at desc limit $2`,
      [userId, limit]
    );
    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      message: r.message,
      routeMode: r.route_mode,
      faithfulness: Number(r.faithfulness),
      totalDurationMs: Number(r.total_duration_ms),
    }));
  }
}
