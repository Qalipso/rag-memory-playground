/**
 * Consolidation depth (N4): entity aliasing, cross-level supersede, decay.
 * Deterministic — builds blocks directly, no model calls.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { consolidateMemory, entityId } from "../memory/formation.js";
import { getMemoryStore, resetMemoryStore } from "../memory/store.js";
import type { MemoryStore } from "../memory/store.js";
import type { MemoryBlock, MemoryLevel } from "../memory/types.js";

function block(p: Partial<MemoryBlock> & { id: string; level: MemoryLevel }): MemoryBlock {
  return {
    userId: "c-user",
    content: p.content ?? p.id,
    entityIds: p.entityIds ?? [],
    importance: 0.5,
    embedding: [],
    sourceNoteId: p.sourceNoteId ?? `note_${p.id}`,
    createdAt: p.createdAt ?? new Date().toISOString(),
    status: "active",
    ...p,
  };
}

function fresh(): MemoryStore {
  resetMemoryStore();
  return getMemoryStore();
}

test("entity aliases collapse cross-language surface forms", () => {
  assert.equal(entityId("трекер расходов"), entityId("expense tracker"));
  assert.equal(entityId("трекер"), entityId("expense tracker"));
  assert.equal(entityId("кофе"), entityId("coffee"));
  assert.notEqual(entityId("Shadow"), entityId("expense tracker"));
});

test("cross-level supersede: newer knowledge absorbs older working task", async () => {
  const store = fresh();
  const ent = entityId("expense tracker");
  await store.addBlocks([
    block({
      id: "w1",
      level: "working",
      content: "Build expense tracker in Shadow",
      entityIds: [ent],
      sourceNoteId: "noteA",
      createdAt: "2026-06-01T00:00:00.000Z",
    }),
    block({
      id: "p1",
      level: "procedural",
      content: "Built expense tracker feature in Shadow",
      entityIds: [ent],
      sourceNoteId: "noteB",
      createdAt: "2026-06-02T00:00:00.000Z",
    }),
  ]);

  const res = await consolidateMemory("c-user", { store });

  assert.equal(res.supersededAcrossLevel, 1);
  assert.equal(res.invalidated, 1);
  const active = await store.activeBlocks("c-user");
  assert.deepEqual(active.map((b) => b.id), ["p1"], "working task invalidated, knowledge kept");
  assert.ok(res.supersedesEdges.some((e) => e.from === "p1" && e.to === "w1"));
});

test("same-note working task is NOT absorbed", async () => {
  const store = fresh();
  const ent = entityId("expense tracker");
  await store.addBlocks([
    block({ id: "w", level: "working", entityIds: [ent], sourceNoteId: "n", content: "do tracker" }),
    block({ id: "p", level: "procedural", entityIds: [ent], sourceNoteId: "n", content: "do tracker" }),
  ]);
  const res = await consolidateMemory("c-user", { store });
  assert.equal(res.supersededAcrossLevel, 0, "same note → task stays active");
});

test("decay: stale working blocks past TTL are invalidated", async () => {
  const store = fresh();
  const now = Date.parse("2026-06-10T00:00:00.000Z");
  await store.addBlocks([
    block({ id: "old", level: "working", createdAt: "2026-06-01T00:00:00.000Z" }), // 9d old
    block({ id: "new", level: "working", createdAt: "2026-06-09T00:00:00.000Z" }), // 1d old
  ]);

  const res = await consolidateMemory("c-user", { store, now, workingTtlDays: 7 });

  assert.equal(res.decayed, 1);
  const active = await store.activeBlocks("c-user");
  assert.deepEqual(active.map((b) => b.id), ["new"], "only fresh task remains");
});

test("non-working levels never decay", async () => {
  const store = fresh();
  const now = Date.parse("2027-01-01T00:00:00.000Z");
  await store.addBlocks([
    block({ id: "s", level: "semantic", createdAt: "2026-01-01T00:00:00.000Z" }),
  ]);
  const res = await consolidateMemory("c-user", { store, now, workingTtlDays: 7 });
  assert.equal(res.decayed, 0);
  assert.equal((await store.activeBlocks("c-user")).length, 1);
});
