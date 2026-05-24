/**
 * Public entry point for the framework-first RAG Memory engine.
 */
export * from "./types.js";
export type { RagProvider } from "./ports/rag-provider.port.js";
export type { MemoryProvider } from "./ports/memory-provider.port.js";
export type { LLMProvider } from "./ports/llm-provider.port.js";
export type { EvaluationProvider } from "./ports/evaluation-provider.port.js";
export type { ObservabilityProvider } from "./ports/observability-provider.port.js";

export { LocalRagProvider } from "./adapters/local-rag-provider.js";
export { LocalMemoryProvider } from "./adapters/local-memory-provider.js";
export { LocalLLMProvider } from "./adapters/local-llm-provider.js";
export { DeterministicEvaluator } from "./adapters/deterministic-evaluator.js";
export { LocalObservabilityProvider } from "./adapters/local-observability-provider.js";

export { LlamaIndexRagProvider } from "./adapters/llamaindex-rag-provider.js";
export { Mem0MemoryProvider } from "./adapters/mem0-memory-provider.js";
export { OpenAILLMProvider } from "./adapters/openai-llm-provider.js";
export { LangfuseObservabilityProvider } from "./adapters/langfuse-observability-provider.js";

export { FrameworkEngine } from "./engine.js";
export {
  buildFrameworkContainer,
  getSharedFrameworkContainer,
  resetSharedFrameworkContainer,
  type FrameworkContainer,
} from "./container.js";
