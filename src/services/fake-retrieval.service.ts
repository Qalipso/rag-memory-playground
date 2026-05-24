import {
  calculateMemoryScore,
  calculateRecencyScore,
  clamp01,
} from "../core/scoring.js";
import type {
  DocumentChunk,
  EngineConfig,
  MemoryRecord,
  RetrievalHit,
} from "../core/types.js";
import { fakeDocuments } from "../data/fake-documents.js";
import { fakeMemories } from "../data/fake-memories.js";

/**
 * Deterministic lexical retrieval for Phase 1.
 * No embeddings. Token-overlap + concept boost gives a stable, debuggable score.
 * Phase 2: swap for real embedder + pgvector cosine similarity.
 */

const conceptBoosts: Record<string, number> = {
  shadow: 0.18,
  memory: 0.14,
  rag: 0.14,
  theory: 0.12,
  visual: 0.1,
  застрял: 0.18,
  спека: 0.12,
  паттерн: 0.14,
  trace: 0.1,
  engine: 0.1,
};

export class FakeRetrievalService {
  retrieveDocuments(query: string, topK: number): RetrievalHit<DocumentChunk>[] {
    const tokens = tokenize(query);

    const scored = fakeDocuments.map((chunk) => {
      const relevance = scoreLexical(tokens, chunk.title + " " + chunk.content, query);
      const hit: RetrievalHit<DocumentChunk> = {
        item: chunk,
        relevance,
        finalScore: relevance,
        reasons: ["lexical_overlap"],
      };
      if (relevance > 0) {
        hit.reasons.push("concept_boost_applied");
      }
      return hit;
    });

    return scored
      .filter((h) => h.relevance > 0)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);
  }

  retrieveMemories(
    userId: string,
    query: string,
    config: EngineConfig
  ): RetrievalHit<MemoryRecord>[] {
    const tokens = tokenize(query);
    const enabled = new Set(config.memory.enabledTypes);
    const now = new Date();

    const scored = fakeMemories
      .filter((m) => m.userId === userId)
      .filter((m) => m.status === "active")
      .filter((m) => enabled.has(m.type))
      .map<RetrievalHit<MemoryRecord>>((memory) => {
        const relevance = scoreLexical(
          tokens,
          memory.content + " " + memory.tags.join(" "),
          query
        );

        const recency = calculateRecencyScore(
          memory.lastAccessedAt ?? memory.createdAt,
          now
        );

        const finalScore = calculateMemoryScore({
          relevance,
          importance: memory.importance,
          createdAt: memory.createdAt,
          lastAccessedAt: memory.lastAccessedAt,
          now,
          weights: config.scoring,
        });

        return {
          item: memory,
          relevance,
          recency,
          importance: memory.importance,
          finalScore,
          reasons: [
            "lexical_overlap",
            "importance_weighted",
            "recency_weighted",
          ],
        };
      });

    return scored
      .filter((h) => h.relevance > 0 || h.importance! >= 0.8)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, config.retrieval.topK);
  }
}

// ---------- helpers ----------

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/**
 * Returns score in [0, 1] using token overlap normalized by query length,
 * plus concept boosts for hot keywords.
 */
function scoreLexical(queryTokens: string[], haystack: string, original: string): number {
  if (queryTokens.length === 0) return 0;

  const hayLower = haystack.toLowerCase();
  const hayTokens = new Set(tokenize(haystack));

  let overlap = 0;
  for (const t of queryTokens) {
    if (hayTokens.has(t)) overlap += 1;
  }

  let base = overlap / queryTokens.length;

  for (const [concept, boost] of Object.entries(conceptBoosts)) {
    if (original.toLowerCase().includes(concept) && hayLower.includes(concept)) {
      base += boost;
    }
  }

  return clamp01(base);
}
