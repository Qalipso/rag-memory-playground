import { randomUUID } from "node:crypto";
import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryProvider,
  MemorySearchInput,
} from "../ports/memory-provider.port.js";
import type { RetrievedMemory } from "../types.js";
import { seedMemories } from "../data/seed.js";

interface StoredMemory {
  id: string;
  userId: string;
  type: RetrievedMemory["type"];
  content: string;
  createdAt: string;
}

/**
 * Mem0-shaped in-memory provider. No external API required.
 * Used when MEM0_API_KEY is absent or for tests.
 */
export class LocalMemoryProvider implements MemoryProvider {
  readonly name = "local-memory";
  readonly framework = "in-memory-lexical";
  readonly mode = "stub" as const;
  readonly version = "0.3.0";
  readonly requiredEnvVars: string[] = [];
  isConfigured(): boolean {
    return true;
  }

  private readonly store: StoredMemory[] = [];

  constructor(seedUserId = "demo-user") {
    for (const m of seedMemories) {
      this.store.push({
        id: m.id,
        userId: seedUserId,
        type: m.type,
        content: m.content,
        createdAt: new Date().toISOString(),
      });
    }
  }

  async search(input: MemorySearchInput): Promise<RetrievedMemory[]> {
    const tokens = tokenize(input.query);

    const candidates = this.store.filter((m) => m.userId === input.userId);
    if (tokens.length === 0) return [];

    const scored = candidates.map<RetrievedMemory>((m) => {
      const relevance = scoreLexical(tokens, m.content);
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        score: relevance,
        reason: relevance > 0 ? "lexical_overlap" : "no_match",
        metadata: { provider: this.name, createdAt: m.createdAt },
      };
    });

    return scored
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.topK);
  }

  async add(input: MemoryAddInput): Promise<{ id: string }> {
    const id = `mem_${randomUUID()}`;
    this.store.push({
      id,
      userId: input.userId,
      type: input.type,
      content: input.content,
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  async listAll(input: MemoryListInput): Promise<RetrievedMemory[]> {
    const items = this.store
      .filter((m) => m.userId === input.userId)
      .slice(0, input.limit ?? 200)
      .map<RetrievedMemory>((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        score: 0,
        reason: "listAll",
        metadata: { provider: this.name, createdAt: m.createdAt },
      }));
    return Promise.resolve(items);
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
  теори: 0.1,
  visual: 0.1,
  portfolio: 0.12,
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
