import type {
  BuiltContext,
  DocumentChunk,
  MemoryRecord,
  RetrievalHit,
  RouteDecision,
} from "../core/types.js";

/**
 * Deterministic answer renderer.
 * No real LLM call in Phase 1. The "answer" is constructed from the route +
 * the items actually included in context. Replace with a real LLM provider in Phase 3.
 */
export class FakeLLMService {
  generate(args: {
    message: string;
    route: RouteDecision;
    context: BuiltContext;
    documentHits: RetrievalHit<DocumentChunk>[];
    memoryHits: RetrievalHit<MemoryRecord>[];
  }): string {
    const { message, route, context, documentHits, memoryHits } = args;

    const usedDocs = context.includedItems.filter((i) => i.type === "document").length;
    const usedMems = context.includedItems.filter((i) => i.type === "memory").length;

    const topMem = memoryHits[0];
    const topDoc = documentHits[0];

    const lines: string[] = [];
    lines.push(
      `Simulator answer (no real LLM yet). Route: ${route.mode} (confidence ${route.confidence.toFixed(
        2
      )}). Reason: ${route.reason}`
    );
    lines.push(
      `Used ${usedDocs} document chunk${usedDocs === 1 ? "" : "s"} and ${usedMems} memor${
        usedMems === 1 ? "y" : "ies"
      } in the prompt.`
    );

    if (topMem) {
      lines.push(
        `Top memory (score ${topMem.finalScore.toFixed(2)}, type ${topMem.item.type}): "${truncate(
          topMem.item.content,
          140
        )}"`
      );
    }

    if (topDoc) {
      lines.push(
        `Top document (score ${topDoc.finalScore.toFixed(2)}, ${topDoc.item.title}): "${truncate(
          topDoc.item.content,
          140
        )}"`
      );
    }

    lines.push(
      `Concise response to "${truncate(message, 90)}": ${composeConcise(message, route, topMem, topDoc)}`
    );

    lines.push(
      `Notice: Phase 1 simulator. Real embeddings, real LLM, and Postgres come in later phases.`
    );

    return lines.join("\n");
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function composeConcise(
  message: string,
  route: RouteDecision,
  topMem: RetrievalHit<MemoryRecord> | undefined,
  topDoc: RetrievalHit<DocumentChunk> | undefined
): string {
  const lower = message.toLowerCase();

  if (lower.includes("застрял") || lower.includes("stuck")) {
    if (topMem) {
      return `Likely pattern from memory: "${truncate(topMem.item.content, 100)}". Trace shows route=${route.mode}, so unblock by acting on this pattern first.`;
    }
    return `No matching pattern in memory yet. Surface the next concrete blocker explicitly.`;
  }

  if (lower.includes("теори") || lower.includes("theory")) {
    if (topDoc) {
      return `Theory anchor: "${truncate(topDoc.item.content, 100)}".`;
    }
    return `Theory layer not retrieved. Likely route mismatch — check the trace.`;
  }

  // Default narration.
  if (topDoc && topMem) {
    return `Hybrid evidence: doc + memory both contribute. See sources and usedMemories in the response.`;
  }
  if (topDoc) {
    return `Anchored to document evidence. Memory contributed nothing this turn.`;
  }
  if (topMem) {
    return `Anchored to user memory. No document evidence retrieved.`;
  }
  return `No retrieval signal above threshold. Engine returns a low-confidence answer — see warnings.`;
}
