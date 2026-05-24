/**
 * Composition root for Phase 1.
 * Wires deterministic, in-memory services. Swap individual services for real
 * implementations in later phases without touching the engine.
 */

import { RagMemoryEngine } from "./engine.js";
import { ContextBuilderService } from "../services/context-builder.service.js";
import { EvaluationService } from "../services/evaluation.service.js";
import { FakeLLMService } from "../services/fake-llm.service.js";
import { FakeRetrievalService } from "../services/fake-retrieval.service.js";
import { MemoryWritePolicyService } from "../services/memory-write-policy.service.js";
import { RouterService } from "../services/router.service.js";
import { TraceService } from "../services/trace.service.js";

export interface RagMemoryContainer {
  engine: RagMemoryEngine;
  trace: TraceService;
}

export function buildContainer(): RagMemoryContainer {
  const trace = new TraceService();
  const router = new RouterService();
  const retrieval = new FakeRetrievalService();
  const contextBuilder = new ContextBuilderService();
  const llm = new FakeLLMService();
  const memoryWritePolicy = new MemoryWritePolicyService();
  const evaluation = new EvaluationService();

  const engine = new RagMemoryEngine(
    router,
    retrieval,
    contextBuilder,
    llm,
    memoryWritePolicy,
    evaluation,
    trace
  );

  return { engine, trace };
}

// Single shared container for simple consumers (API route, demo script).
// Tests should call buildContainer() to get an isolated instance.
let sharedContainer: RagMemoryContainer | undefined;

export function getSharedContainer(): RagMemoryContainer {
  if (!sharedContainer) {
    sharedContainer = buildContainer();
  }
  return sharedContainer;
}

export const ragMemoryEngine = getSharedContainer().engine;
