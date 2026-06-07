/**
 * End-to-end memory flow — full staged pipeline.
 *
 * Walks the whole journey a note takes through the system, asserting at each
 * stage. Deterministic: uses stub extractor + stub embedder + a fresh in-memory
 * store, so it runs in CI with zero API keys.
 *
 *   Stage 1  Ingest note A           → normalize→classify→extract→split→embed→store→link
 *   Stage 2  Inspect graph after A   → blocks + entities persisted
 *   Stage 3  Ingest related note B   → cross-note shares_entity edges
 *   Stage 4  Graph grows             → A+B blocks, edges accumulate
 *   Stage 5  Consolidate duplicates  → re-ingest A, merge near-duplicates
 *   Stage 6  Active filtering        → merged blocks excluded from active set
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { StubMemoryExtractor } from "../memory/extractor.js";
import { StubBlockEmbedder } from "../memory/embedder.js";
import { formMemory, consolidateMemory } from "../memory/formation.js";
import { getMemoryStore, resetMemoryStore } from "../memory/store.js";
import type { MemoryStore } from "../memory/store.js";

const NOTE_A =
  "Сегодня я понял, что много трачу на кофе. Надо сделать автоматический трекер расходов в Shadow.";
const NOTE_B =
  "Опять потратил кучу денег на кофе. Надо доделать трекер расходов в Shadow поскорее.";

const EXPECTED_STAGE_ORDER = [
  "normalizeNode",
  "classifyExtractSplitNode",
  "embedNode",
  "storeNode",
  "linkGraphNode",
];

function deps(store: MemoryStore) {
  return { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store };
}

test("full memory flow: ingest → graph → link → consolidate", async (t) => {
  resetMemoryStore();
  const store = getMemoryStore();
  const userId = "e2e-user";

  // ---------- Stage 1: ingest note A ----------
  await t.test("stage 1 — note A forms multi-level memory with ordered trace", async () => {
    const a = await formMemory({ userId, text: NOTE_A }, deps(store));

    // pipeline ran every stage, in order
    assert.deepEqual(a.steps.map((s) => s.name), EXPECTED_STAGE_ORDER);
    assert.ok(a.steps.every((s) => s.status === "ok"), "no failed stages");

    // multi-level split
    const levels = new Set(a.blocks.map((b) => b.level));
    assert.ok(a.blocks.length >= 3, ">=3 blocks formed");
    assert.ok(levels.has("procedural"), "intent → procedural");
    assert.ok(levels.has("working"), "intent → working task");
    assert.ok(levels.has("episodic") || levels.has("semantic"), "realization → episodic/semantic");

    // entities
    const shadow = a.entities.find((e) => e.name.toLowerCase() === "shadow");
    assert.ok(shadow && shadow.kind === "project", "Shadow extracted as project");

    // intra-note edges (procedural + working both reference Shadow)
    assert.ok(a.newEdges.some((e) => e.kind === "shares_entity"), "intra-note shares_entity edge");

    // honesty
    assert.deepEqual(
      a.providerStatus.map((p) => p.mode).sort(),
      ["stub", "stub"],
      "extractor + embedder report stub"
    );
    const fm = a.failureModes.map((f) => f.type);
    assert.ok(fm.includes("extractor_stub_used"));
    assert.ok(fm.includes("embedder_stub_used"));
  });

  // ---------- Stage 2: inspect graph after A ----------
  let blocksAfterA = 0;
  await t.test("stage 2 — graph snapshot persists A", async () => {
    const snap = await store.snapshot(userId);
    blocksAfterA = snap.blocks.length;
    assert.ok(blocksAfterA >= 3, "blocks persisted");
    assert.ok(snap.entities.length >= 1, "entities persisted");
    assert.ok(snap.blocks.every((b) => b.userId === userId), "scoped to user");
  });

  // ---------- Stage 3: ingest related note B ----------
  let blocksFromB = 0;
  await t.test("stage 3 — note B links across notes via shared entity", async () => {
    const b = await formMemory({ userId, text: NOTE_B }, deps(store));
    blocksFromB = b.blocks.length;

    // linkGraph step reports it saw the existing corpus
    const link = b.steps.find((s) => s.name === "linkGraphNode");
    assert.ok(link && /existing=[1-9]/.test(link.inputSummary), "linker saw existing blocks");

    // at least one new edge connects to a pre-existing block (cross-note)
    const snap = await store.snapshot(userId);
    const bIds = new Set(b.blocks.map((x) => x.id));
    const crossNote = b.newEdges.filter((e) => !bIds.has(e.from) || !bIds.has(e.to));
    assert.ok(crossNote.length >= 1, "cross-note edge created");
    assert.ok(snap.edges.length >= 1);
  });

  // ---------- Stage 4: graph grows ----------
  await t.test("stage 4 — corpus accumulates A + B", async () => {
    const snap = await store.snapshot(userId);
    assert.equal(snap.blocks.length, blocksAfterA + blocksFromB, "A + B blocks present");
  });

  // ---------- Stage 5: consolidate duplicates ----------
  await t.test("stage 5 — re-ingesting A is consolidated", async () => {
    await formMemory({ userId, text: NOTE_A }, deps(store)); // exact duplicate
    const before = (await store.activeBlocks(userId)).length;

    const res = await consolidateMemory(userId, { store });
    const after = (await store.activeBlocks(userId)).length;

    assert.ok(res.merged > 0, "duplicates merged");
    assert.equal(
      after,
      before - res.merged - res.invalidated,
      "active count drops by merged + invalidated"
    );
    assert.ok(
      res.supersedesEdges.every((e) => e.kind === "supersedes"),
      "supersedes edges recorded"
    );
  });

  // ---------- Stage 6: active filtering ----------
  await t.test("stage 6 — merged blocks excluded from active set", async () => {
    const active = await store.activeBlocks(userId);
    assert.ok(active.every((b) => b.status === "active"), "only active returned");
    const snap = await store.snapshot(userId);
    const merged = snap.blocks.filter((b) => b.status === "merged");
    assert.ok(merged.length >= 1, "merged blocks retained in snapshot (audit trail)");
  });
});
