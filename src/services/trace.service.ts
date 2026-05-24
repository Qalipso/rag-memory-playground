import { newTraceEventId } from "../core/ids.js";
import type { TraceEvent, TraceEventType } from "../core/types.js";

/**
 * In-memory trace store. Phase 1 only.
 * Phase 2: persist via TraceRepository to trace_events table.
 */
export class TraceService {
  private events = new Map<string, TraceEvent[]>();

  add(
    runId: string,
    type: TraceEventType,
    label: string,
    payload: Record<string, unknown> = {}
  ): TraceEvent {
    const event: TraceEvent = {
      id: newTraceEventId(),
      runId,
      type,
      label,
      timestamp: new Date().toISOString(),
      payload,
    };

    const bucket = this.events.get(runId);
    if (bucket) {
      bucket.push(event);
    } else {
      this.events.set(runId, [event]);
    }

    return event;
  }

  get(runId: string): TraceEvent[] {
    return [...(this.events.get(runId) ?? [])];
  }

  clear(runId: string): void {
    this.events.delete(runId);
  }
}
