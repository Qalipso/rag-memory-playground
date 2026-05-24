import type {
  BuiltContext,
  DocumentChunk,
  MemoryRecord,
  RetrievalHit,
  RouteDecision,
} from "../core/types.js";

export interface LLMGenerateInput {
  message: string;
  route: RouteDecision;
  context: BuiltContext;
  documentHits: RetrievalHit<DocumentChunk>[];
  memoryHits: RetrievalHit<MemoryRecord>[];
}

/**
 * LLM generation port. Phase 3 abstraction.
 * Implementations: FakeLLMService (deterministic), OpenAILLMAdapter (real).
 */
export interface LLMPort {
  generate(input: LLMGenerateInput): Promise<string>;
}
