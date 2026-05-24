/**
 * Public entry point for the RagMemoryEngine package.
 * Import from here in API routes, demo scripts, and UI integration code.
 */

export * from "./core/types.js";
export { defaultEngineConfig, mergeWithDefaultConfig } from "./core/config.js";
export {
  calculateMemoryScore,
  calculateRecencyScore,
} from "./core/scoring.js";
export { RagMemoryEngine } from "./core/engine.js";
export {
  buildContainer,
  getSharedContainer,
  ragMemoryEngine,
  type RagMemoryContainer,
} from "./core/container.js";

export { RouterService } from "./services/router.service.js";
export { FakeRetrievalService } from "./services/fake-retrieval.service.js";
export { ContextBuilderService } from "./services/context-builder.service.js";
export { FakeLLMService } from "./services/fake-llm.service.js";
export { MemoryWritePolicyService } from "./services/memory-write-policy.service.js";
export { EvaluationService } from "./services/evaluation.service.js";
export { TraceService } from "./services/trace.service.js";

export { fakeDocuments } from "./data/fake-documents.js";
export { fakeMemories } from "./data/fake-memories.js";
