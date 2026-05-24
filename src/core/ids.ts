/**
 * Stable id generation that works in Node (without DOM crypto guarantees).
 */

import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function newRunId(): string {
  return newId("run");
}

export function newTraceEventId(): string {
  return newId("evt");
}

export function newCandidateId(): string {
  return newId("cand");
}
