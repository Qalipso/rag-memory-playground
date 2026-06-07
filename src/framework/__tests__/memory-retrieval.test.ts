/**
 * Retrieval loop (N2): memory formed via the pipeline is what the retrieval
 * provider returns. Proves /memory and /playground share one memory store.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { StubMemoryExtractor } from "../memory/extractor.js";
import { StubBlockEmbedder } from "../memory/embedder.js";
import { formMemory } from "../memory/formation.js";
import { getMemoryStore, resetMemoryStore } from "../memory/store.js";
import { FormationMemoryProvider } from "../adapters/formation-memory-provider.js";

const NOTE =
  "Сегодня я понял, что много трачу на кофе. Надо сделать автоматический трекер расходов в Shadow.";

test("formed memory is retrievable via FormationMemoryProvider", async () => {
  resetMemoryStore();
  const store = getMemoryStore();
  const provider = new FormationMemoryProvider();

  // Before forming: user has no memory → falls back to seed (or empty).
  const before = await provider.search({ userId: "u-ret", query: "кофе расходы Shadow", topK: 5 });
  assert.ok(
    before.every((m) => m.reason !== "formation_lexical_overlap"),
    "no formed memory yet"
  );

  // Form a note into the shared store.
  await formMemory(
    { userId: "u-ret", text: NOTE },
    { extractor: new StubMemoryExtractor(), embedder: new StubBlockEmbedder(), store }
  );

  // After: retrieval returns the formed blocks.
  const after = await provider.search({ userId: "u-ret", query: "трекер расходов Shadow", topK: 5 });
  assert.ok(after.length > 0, "formed memory retrieved");
  assert.ok(
    after.some((m) => m.reason === "formation_lexical_overlap"),
    "results come from formation store, not seed"
  );
  assert.ok(
    after.some((m) => m.content.toLowerCase().includes("shadow")),
    "Shadow memory surfaced"
  );
  assert.ok(after.every((m) => m.metadata?.["provider"] === "formation-memory"));
});

test("write-back: provider.add persists into the same store", async () => {
  resetMemoryStore();
  const provider = new FormationMemoryProvider();
  const { id } = await provider.add({
    userId: "u-wb",
    content: "User prefers concise answers.",
    type: "procedural",
  });
  assert.ok(id.startsWith("mem_"));

  const active = await getMemoryStore().activeBlocks("u-wb");
  assert.equal(active.length, 1);
  assert.equal(active[0]?.content, "User prefers concise answers.");
});
