import type {
  RagProvider,
  RagSearchInput,
} from "../ports/rag-provider.port.js";
import type { RetrievedDocument } from "../types.js";
import { getKnowledgeStore } from "../knowledge/store.js";

/**
 * Deterministic local RAG provider. No LlamaIndex required.
 * Reads chunks from the in-memory KnowledgeStore (seed docs + dynamically
 * added link / sample / file sources). Lexical token-overlap scoring with
 * a small concept-boost table.
 */
export class LocalRagProvider implements RagProvider {
  readonly name = "local-rag";
  readonly framework = "in-memory-lexical";
  readonly mode = "stub" as const;
  readonly version = "0.3.0";
  readonly requiredEnvVars: string[] = [];
  isConfigured(): boolean {
    return true;
  }

  async search(input: RagSearchInput): Promise<RetrievedDocument[]> {
    const tokens = tokenize(input.query);
    if (tokens.length === 0) return [];

    const chunks = getKnowledgeStore().allChunks();

    const scored = chunks.map<RetrievedDocument>((c) => {
      const relevance = scoreLexical(tokens, `${c.title} ${c.content}`);
      return {
        id: c.id,
        title: c.title,
        content: c.content,
        source: c.source,
        score: relevance,
        reason: relevance > 0 ? "lexical_overlap" : "no_match",
        metadata: { provider: this.name, sourceId: c.sourceId },
      };
    });

    return scored
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.topK);
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
  shadow: 0.15,
  memory: 0.12,
  rag: 0.12,
  theory: 0.1,
  visual: 0.08,
  застрял: 0.18,
  паттерн: 0.12,
  теори: 0.12,
  trace: 0.1,
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
