/**
 * Seeds the Gold Memory Lab corpus into long-term memory.
 *
 * Pushes each derived note through the real memory-formation pipeline
 * (formMemory) under GOLD_USER_ID, creating multi-level memory blocks and
 * graph edges in the active MemoryStore (in-memory or Postgres+pgvector).
 *
 * Idempotent by default: if memory already exists for the gold user it skips,
 * unless { force: true } is passed (which clears first).
 */

import { formMemory } from "../memory/formation.js";
import { getMemoryStore } from "../memory/store.js";
import { getGoldMemoryNotes } from "./notes.js";
import { GOLD_USER_ID } from "./types.js";

export interface SeedGoldResult {
  userId: string;
  backend: string;
  alreadySeeded: boolean;
  notesProcessed: number;
  blocksCreated: number;
  edgesCreated: number;
  entitiesCreated: number;
}

export async function seedGoldMemory(opts: { force?: boolean } = {}): Promise<SeedGoldResult> {
  const store = getMemoryStore();
  const existing = await store.activeBlocks(GOLD_USER_ID);

  if (existing.length > 0 && !opts.force) {
    return {
      userId: GOLD_USER_ID,
      backend: store.backend,
      alreadySeeded: true,
      notesProcessed: 0,
      blocksCreated: existing.length,
      edgesCreated: 0,
      entitiesCreated: 0,
    };
  }

  if (opts.force) await store.clear(GOLD_USER_ID);

  const notes = getGoldMemoryNotes();
  let blocksCreated = 0;
  let edgesCreated = 0;
  const entityIds = new Set<string>();

  for (const note of notes) {
    const result = await formMemory({ userId: GOLD_USER_ID, text: note.text });
    blocksCreated += result.blocks.length;
    edgesCreated += result.newEdges.length;
    for (const e of result.entities) entityIds.add(e.id);
  }

  return {
    userId: GOLD_USER_ID,
    backend: store.backend,
    alreadySeeded: false,
    notesProcessed: notes.length,
    blocksCreated,
    edgesCreated,
    entitiesCreated: entityIds.size,
  };
}
