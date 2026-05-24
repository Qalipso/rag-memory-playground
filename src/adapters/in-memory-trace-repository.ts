import type { TraceEvent } from "../core/types.js";
import type { TraceRepositoryPort } from "../ports/trace-repository.port.js";

export class InMemoryTraceRepository implements TraceRepositoryPort {
  private readonly byRun = new Map<string, TraceEvent[]>();

  async appendBatch(events: TraceEvent[]): Promise<void> {
    for (const ev of events) {
      const bucket = this.byRun.get(ev.runId);
      if (bucket) bucket.push(ev);
      else this.byRun.set(ev.runId, [ev]);
    }
  }

  async listByRun(runId: string): Promise<TraceEvent[]> {
    return Promise.resolve([...(this.byRun.get(runId) ?? [])]);
  }
}
