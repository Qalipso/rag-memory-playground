import type {
  BuiltContext,
  DocumentChunk,
  EngineConfig,
  ExcludedItem,
  IncludedItem,
  MemoryRecord,
  RetrievalHit,
  RouteDecision,
} from "../core/types.js";

/**
 * Token estimate. Phase 1 uses chars/4 heuristic to avoid tokenizer dependency.
 * Phase 3 can swap for a real tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const RESERVED_FOR_SYSTEM_AND_ANSWER = 600;

export class ContextBuilderService {
  build(params: {
    message: string;
    route: RouteDecision;
    documentHits: RetrievalHit<DocumentChunk>[];
    memoryHits: RetrievalHit<MemoryRecord>[];
    config: EngineConfig;
  }): BuiltContext {
    const { message, route, documentHits, memoryHits, config } = params;

    const systemPrompt = buildSystemPrompt(config);
    const reserved =
      estimateTokens(systemPrompt) + estimateTokens(message) + RESERVED_FOR_SYSTEM_AND_ANSWER;
    const budget = Math.max(0, config.generation.maxContextTokens - reserved);

    const included: IncludedItem[] = [];
    const excluded: ExcludedItem[] = [];
    let used = 0;

    // Route gating — exclude entire pool if the route disabled it.
    if (!route.useDocuments) {
      for (const hit of documentHits) {
        excluded.push({
          id: hit.item.id,
          type: "document",
          score: hit.finalScore,
          reason: "route_disabled",
        });
      }
    }

    if (!route.useMemory) {
      for (const hit of memoryHits) {
        excluded.push({
          id: hit.item.id,
          type: "memory",
          score: hit.finalScore,
          reason: "route_disabled",
        });
      }
    }

    // Filter + pack memories first (typically smaller, higher-value per token).
    const memoryCandidates = route.useMemory ? memoryHits : [];
    for (const hit of memoryCandidates) {
      if (hit.finalScore < config.retrieval.minScore) {
        excluded.push({
          id: hit.item.id,
          type: "memory",
          score: hit.finalScore,
          reason: "below_min_score",
        });
        continue;
      }
      if (hit.item.status === "stale" || hit.item.status === "invalidated") {
        excluded.push({
          id: hit.item.id,
          type: "memory",
          score: hit.finalScore,
          reason: "stale",
        });
        continue;
      }

      const tokens = estimateTokens(hit.item.content);
      if (used + tokens > budget) {
        excluded.push({
          id: hit.item.id,
          type: "memory",
          score: hit.finalScore,
          reason: "token_budget_exceeded",
        });
        continue;
      }

      used += tokens;
      included.push({
        id: hit.item.id,
        type: "memory",
        score: hit.finalScore,
        reason: hit.reasons.join(", "),
        tokensEstimate: tokens,
      });
    }

    // Pack documents next. Deduplicate by documentId so we do not stuff multiple
    // chunks from the same source unless absolutely needed.
    const seenDocuments = new Set<string>();
    const docCandidates = route.useDocuments ? documentHits : [];
    for (const hit of docCandidates) {
      if (hit.finalScore < config.retrieval.minScore) {
        excluded.push({
          id: hit.item.id,
          type: "document",
          score: hit.finalScore,
          reason: "below_min_score",
        });
        continue;
      }
      if (seenDocuments.has(hit.item.documentId)) {
        excluded.push({
          id: hit.item.id,
          type: "document",
          score: hit.finalScore,
          reason: "duplicate",
        });
        continue;
      }

      const tokens = estimateTokens(hit.item.content);
      if (used + tokens > budget) {
        excluded.push({
          id: hit.item.id,
          type: "document",
          score: hit.finalScore,
          reason: "token_budget_exceeded",
        });
        continue;
      }

      seenDocuments.add(hit.item.documentId);
      used += tokens;
      included.push({
        id: hit.item.id,
        type: "document",
        score: hit.finalScore,
        reason: hit.reasons.join(", "),
        tokensEstimate: tokens,
      });
    }

    // Render the included items back to text blocks.
    const includedMemoryIds = new Set(
      included.filter((i) => i.type === "memory").map((i) => i.id)
    );
    const includedDocIds = new Set(
      included.filter((i) => i.type === "document").map((i) => i.id)
    );

    const memoryContext = memoryHits
      .filter((h) => includedMemoryIds.has(h.item.id))
      .map(
        (h, i) =>
          `[Memory ${i + 1} | score=${h.finalScore.toFixed(2)} | type=${h.item.type}]\n${h.item.content}`
      )
      .join("\n\n");

    const documentContext = documentHits
      .filter((h) => includedDocIds.has(h.item.id))
      .map(
        (h, i) =>
          `[Source ${i + 1} | score=${h.finalScore.toFixed(2)} | doc=${h.item.title}]\n${h.item.content}`
      )
      .join("\n\n");

    const finalPrompt = renderFinalPrompt({
      systemPrompt,
      message,
      memoryContext,
      documentContext,
    });

    return {
      systemPrompt,
      memoryContext,
      documentContext,
      finalPrompt,
      includedItems: included,
      excludedItems: excluded,
      tokenBudget: {
        max: config.generation.maxContextTokens,
        used,
        reserved,
      },
    };
  }
}

function buildSystemPrompt(config: EngineConfig): string {
  const grounding = config.generation.strictGrounding
    ? "Use only the provided memory and document context. If context is insufficient, say so clearly."
    : "Prefer the provided context. Fall back to general knowledge only when context is silent.";

  const cites = config.generation.citeSources
    ? "Cite sources using their [Source N] or [Memory N] tags."
    : "Source citations optional.";

  return [
    "You are a grounded RAG Memory assistant.",
    grounding,
    cites,
    "Do not invent user facts. Do not contradict provided memories.",
  ].join(" ");
}

function renderFinalPrompt(args: {
  systemPrompt: string;
  message: string;
  memoryContext: string;
  documentContext: string;
}): string {
  return [
    args.systemPrompt,
    "",
    "User message:",
    args.message,
    "",
    "Relevant memories:",
    args.memoryContext || "(none)",
    "",
    "Relevant documents:",
    args.documentContext || "(none)",
    "",
    "Answer:",
  ].join("\n");
}
