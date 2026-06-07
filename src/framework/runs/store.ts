/**
 * Run history store. Persists ExplainableRun for history + permalinks.
 *
 *   InMemoryRunStore — default, per-process (globalThis singleton).
 *   PgRunStore        — Postgres, active when DATABASE_URL is set.
 */

import type { ExplainableRun } from "../types.js";

export interface RunRecord {
  id: string;
  userId: string;
  createdAt: string;
  run: ExplainableRun;
}

export interface RunSummary {
  id: string;
  userId: string;
  createdAt: string;
  message: string;
  routeMode: string;
  faithfulness: number;
  totalDurationMs: number;
}

export interface RunStore {
  readonly backend: "in-memory" | "postgres";
  save(record: RunRecord): Promise<void>;
  get(id: string): Promise<RunRecord | null>;
  list(userId: string, limit?: number): Promise<RunSummary[]>;
}

export function toSummary(r: RunRecord): RunSummary {
  return {
    id: r.id,
    userId: r.userId,
    createdAt: r.createdAt,
    message: r.run.input.message,
    routeMode: r.run.route.mode,
    faithfulness: r.run.evaluations.faithfulness.score,
    totalDurationMs: r.run.meta.totalDurationMs,
  };
}

class InMemoryRunStore implements RunStore {
  readonly backend = "in-memory" as const;
  private readonly runs = new Map<string, RunRecord>();

  async save(record: RunRecord): Promise<void> {
    this.runs.set(record.id, record);
  }

  async get(id: string): Promise<RunRecord | null> {
    return this.runs.get(id) ?? null;
  }

  async list(userId: string, limit = 50): Promise<RunSummary[]> {
    return Array.from(this.runs.values())
      .filter((r) => r.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit)
      .map(toSummary);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __runStore: RunStore | undefined;
}

export function getRunStore(): RunStore {
  if (!globalThis.__runStore) {
    if (process.env["DATABASE_URL"]) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./pg.js") as typeof import("./pg.js");
      globalThis.__runStore = new mod.PgRunStore(process.env["DATABASE_URL"]);
    } else {
      globalThis.__runStore = new InMemoryRunStore();
    }
  }
  return globalThis.__runStore;
}

export function resetRunStore(): void {
  globalThis.__runStore = undefined;
}

export { InMemoryRunStore };
