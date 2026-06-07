import { strict as assert } from "node:assert";
import { test } from "node:test";
import { StubMemoryExtractor } from "../memory/extractor.js";
import { StubBlockEmbedder } from "../memory/embedder.js";
import { formMemory, consolidateMemory } from "../memory/formation.js";
import { getMemoryStore, resetMemoryStore } from "../memory/store.js";
import type { MemoryStore } from "../memory/store.js";

const NOTE =
  "Сегодня я понял, что много трачу на кофе. Надо сделать автоматический трекер расходов в Shadow.";

function freshDeps(): { store: MemoryStore } {
  resetMemoryStore();
  return { store: getMemoryStore() };
}

test("forms multi-level memory from a single note (stub)", async () => {
  const { store } = freshDeps();
  const result = await formMemory(
    { userId: "u1", text: NOTE },
    { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store }
  );

  const levels = new Set(result.blocks.map((b) => b.level));
  assert.ok(result.blocks.length >= 2, "should form multiple blocks");
  assert.ok(levels.has("procedural"), "intent → procedural block");
  assert.ok(levels.has("working"), "intent → working task block");
  assert.ok(
    levels.has("episodic") || levels.has("semantic"),
    "realization → episodic/semantic block"
  );
});

test("extracts Shadow as a project entity", async () => {
  const { store } = freshDeps();
  const result = await formMemory(
    { userId: "u1", text: NOTE },
    { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store }
  );
  const shadow = result.entities.find((e) => e.name.toLowerCase() === "shadow");
  assert.ok(shadow, "Shadow entity extracted");
  assert.equal(shadow?.kind, "project");
});

test("graph snapshot persists blocks and links", async () => {
  const { store } = freshDeps();
  await formMemory(
    { userId: "u1", text: NOTE },
    { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store }
  );
  const snap = await store.snapshot("u1");
  assert.ok(snap.blocks.length >= 2);
  assert.ok(snap.entities.length >= 1);
});

test("consolidation merges duplicate blocks", async () => {
  const { store } = freshDeps();
  const deps = { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store };
  await formMemory({ userId: "u1", text: NOTE }, deps);
  await formMemory({ userId: "u1", text: NOTE }, deps); // same note again → duplicates

  const before = (await store.activeBlocks("u1")).length;
  const res = await consolidateMemory("u1", { store });
  const after = (await store.activeBlocks("u1")).length;

  assert.ok(res.merged > 0, "should merge at least one duplicate");
  assert.equal(after, before - res.merged);
});

test("reports stub provider modes honestly", async () => {
  const { store } = freshDeps();
  const result = await formMemory(
    { userId: "u1", text: NOTE },
    { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store }
  );
  const types = result.failureModes.map((f) => f.type);
  assert.ok(types.includes("extractor_stub_used"));
  assert.ok(types.includes("embedder_stub_used"));
});
