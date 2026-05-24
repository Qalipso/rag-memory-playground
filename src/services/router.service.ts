import type { EngineMode, RouteDecision } from "../core/types.js";

const memorySignals = [
  "remember",
  "last time",
  "again",
  "why do i",
  "my pattern",
  "что я",
  "почему я снова",
  "мы обсуждали",
  "застрял",
  "паттерн",
];

const documentSignals = [
  "according to",
  "in the document",
  "from the file",
  "wiki",
  "theory",
  "документ",
  "файл",
  // "теори" prefix matches теория / теории / теорию / теорией.
  "теори",
  "спека",
];

/**
 * Decides retrieval route. Rule-based for Phase 1.
 * Phase 3+: replace with LLM classifier or learned policy.
 */
export class RouterService {
  decide(message: string, mode: EngineMode | undefined): RouteDecision {
    // Forced modes bypass rule-based detection.
    if (mode === "rag") {
      return forced("rag", {
        useDocuments: true,
        useMemory: false,
        useLongContext: false,
        reason: "Forced RAG mode via input.mode = 'rag'.",
      });
    }

    if (mode === "memory") {
      return forced("memory", {
        useDocuments: false,
        useMemory: true,
        useLongContext: false,
        reason: "Forced Memory mode via input.mode = 'memory'.",
      });
    }

    if (mode === "long_context") {
      return forced("long_context", {
        useDocuments: false,
        useMemory: false,
        useLongContext: true,
        reason: "Forced Long Context mode via input.mode = 'long_context'.",
      });
    }

    if (mode === "hybrid") {
      return forced("hybrid", {
        useDocuments: true,
        useMemory: true,
        useLongContext: false,
        reason: "Forced Hybrid mode via input.mode = 'hybrid'.",
      });
    }

    // Auto / undefined: rule-based detection.
    const lower = message.toLowerCase();
    const needsMemory = memorySignals.some((s) => lower.includes(s));
    const needsDocs = documentSignals.some((s) => lower.includes(s));

    if (needsMemory && needsDocs) {
      return {
        mode: "hybrid",
        useDocuments: true,
        useMemory: true,
        useLongContext: false,
        reason:
          "Question references both user history (memory signals) and external project material (document signals).",
        confidence: 0.85,
      };
    }

    if (needsMemory) {
      return {
        mode: "memory",
        useDocuments: false,
        useMemory: true,
        useLongContext: false,
        reason: "Question depends on previous user context (memory signals matched).",
        confidence: 0.75,
      };
    }

    if (needsDocs) {
      return {
        mode: "rag",
        useDocuments: true,
        useMemory: false,
        useLongContext: false,
        reason: "Question asks about provided documents or knowledge base.",
        confidence: 0.75,
      };
    }

    return {
      mode: "hybrid",
      useDocuments: true,
      useMemory: true,
      useLongContext: false,
      reason: "Default safe route for exploratory question. Try both sources.",
      confidence: 0.55,
    };
  }
}

function forced(
  mode: EngineMode,
  partial: Omit<RouteDecision, "mode" | "confidence">
): RouteDecision {
  return { ...partial, mode, confidence: 1.0 };
}
