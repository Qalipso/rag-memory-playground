import type { TraceEvent } from "../core/types.js";

export interface TraceRepositoryPort {
  appendBatch(events: TraceEvent[]): Promise<void>;
  listByRun(runId: string): Promise<TraceEvent[]>;
}
