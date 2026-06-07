/**
 * Memory provider backed by the memory-formation store.
 *
 * Closes the loop: notes formed via the Visual Memory Lab become the memory the
 * retrieval workflow grounds on. search() reads active blocks from the same
 * MemoryStore the formation pipeline writes to (in-memory or Postgres+pgvector).
 *
 * When a user has no formed memory yet, falls back to the demo seed so the
 * playground is not blank. Reported as a stub (deterministic, lexical scoring).
 */

import { randomUUID } from "node:crypto";
import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryProvider,
  MemorySearchInput,
} from "../ports/memory-provider.port.js";
import type { RetrievedMemory } from "../types.js";
import { seedMemories } from "../data/seed.js";
import { getMemoryStore } from "../memory/store.js";
import type { MemoryBlock, MemoryLevel } from "../memory/types.js";

export class FormationMemoryProvider implements MemoryProvider {
  readonly name = "formation-memory";
  readonly framework = "formation-store";
  readonly mode = "stub" as const;
  readonly version = "0.4.0";
  readonly requiredEnvVars: string[] = [];

  isConfigured(): boolean {
    return true;
  }

  async search(input: MemorySearchInput): Promise<RetrievedMemory[]> {
    const tokens = tokenize(input.query);
    if (tokens.length === 0) return [];

    const blocks = await getMemoryStore().activeBlocks(input.userId);

    const fromFormation = blocks.map<RetrievedMemory>((b) => {
      const relevance = scoreLexical(tokens, b.content);
      return {
        id: b.id,
        type: b.level,
        content: b.content,
        score: relevance,
        reason: relevance > 0 ? "formation_lexical_overlap" : "no_match",
        metadata: {
          provider: this.name,
          importance: b.importance,
          sourceNoteId: b.sourceNoteId,
        },
      };
    });

    // Fallback to seed memory only when the user has no formed memory at all.
    const pool =
      blocks.length > 0
        ? fromFormation
        : seedMemories.map<RetrievedMemory>((m) => ({
            id: m.id,
            type: m.type,
            content: m.content,
            score: scoreLexical(tokens, m.content),
            reason: "seed_fallback",
            metadata: { provider: this.name, seed: true },
          }));

    return pool
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.topK);
  }

  async add(input: MemoryAddInput): Promise<{ id: string }> {
    const id = `mem_${randomUUID()}`;
    const block: MemoryBlock = {
      id,
      userId: input.userId,
      level: input.type as MemoryLevel,
      content: input.content,
      entityIds: [],
      importance: 0.5,
      embedding: [],
      sourceNoteId: `writeback_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      status: "active",
    };
    await getMemoryStore().addBlocks([block]);
    return { id };
  }

  async listAll(input: MemoryListInput): Promise<RetrievedMemory[]> {
    const blocks = await getMemoryStore().activeBlocks(input.userId);
    return blocks.slice(0, input.limit ?? 200).map<RetrievedMemory>((b) => ({
      id: b.id,
      type: b.level,
      content: b.content,
      score: 0,
      reason: "listAll",
      metadata: { provider: this.name, importance: b.importance },
    }));
  }
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

const conceptBoosts: Record<string, number> = {
  shadow: 0.18,
  застрял: 0.18,
  паттерн: 0.14,
  кофе: 0.14,
  расход: 0.14,
  трекер: 0.12,
};

function scoreLexical(queryTokens: string[], haystack: string): number {
  const hayLower = haystack.toLowerCase();
  const hayTokens = new Set(tokenize(haystack));
  let overlap = 0;
  for (const t of queryTokens) if (hayTokens.has(t)) overlap += 1;
  let base = overlap / queryTokens.length;
  for (const [concept, boost] of Object.entries(conceptBoosts)) {
    if (queryTokens.some((t) => t.includes(concept)) && hayLower.includes(concept)) {
      base += boost;
    }
  }
  return Math.min(1, Math.max(0, base));
}
