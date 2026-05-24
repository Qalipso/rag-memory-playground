# Spec Gaps & Open Questions

> Found during ARCHITECTURE.md review. Resolve before Phase 1 → Phase 2 jump.

---

## Critical gaps (must resolve before coding Phase 2)

### G1 — LongContext route declared but unimplemented
`EngineMode = "long_context"` exists, but no `LongContextService` defined. Router can never return `useLongContext: true`. **Decision needed:** drop the mode for v1, or add a stub service that just dumps a large doc into context.

### G2 — Consolidation service missing
GUIDE.md §2.2 lifecycle includes `consolidate` (reflection / summarization). Architecture lists `consolidationEnabled` in config but no `ConsolidationService` defined. **Decision:** add interface stub now, implement Phase 4+.

### G3 — Forgetting service missing
Same as G2. `forgettingEnabled` flag exists, no service. Decay happens implicitly via `calculateRecencyScore`, but **active invalidation** (`status: "invalidated"`) needs an explicit pass.

### G4 — Contradiction detection missing
`contradictionDetection: boolean` in config, no service. A-MEM-style link refactoring needs a real subroutine.

### G5 — TraceService interface undefined
Engine calls `this.trace.add(...)` and `this.trace.get(runId)`. Interface not shown. **Spec needed:**
```ts
interface TraceService {
  add(runId: string, type: TraceEventType, label: string, payload: Record<string, unknown>): void;
  get(runId: string): TraceEvent[];
  persist(runId: string): Promise<void>;
}
```

### G6 — EvaluationService interface undefined
Engine calls `this.evaluation.evaluate(...)`. Return type `EvaluationResult` referenced but not defined. **Spec needed:**
```ts
interface EvaluationResult {
  faithfulness: number;
  contextRelevance: number;
  answerRelevance: number;
  tokensUsed: number;
  latencyMs: number;
}
```

### G7 — EmbedderService interface undefined
Used by `RetrievalService`. **Spec needed:**
```ts
interface EmbedderService {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  dimensions: number;
}
```

### G8 — LLMService interface undefined
**Spec needed:**
```ts
interface LLMService {
  generate(prompt: string, opts?: { model?: string; maxTokens?: number; }): Promise<string>;
}
```

### G9 — `mergeWithDefaultConfig` referenced but undefined
Engine calls it. Defaults need to live somewhere — propose `/src/core/config.ts`.

### G10 — DI container undefined
API route imports `@/lib/rag-memory/container`. Composition root not specified. Propose explicit `Container` class or simple factory function.

---

## Medium gaps (can defer to Phase 3+)

### G11 — Reranker service in tree, not implemented
`reranker.service.ts` listed in file layout. No interface. `config.retrieval.rerank: boolean` exists but unused.

### G12 — Working memory unhandled
`MemoryType = "working"` exists but no special handling. Working memory ≠ vector store; it's the active LLM context. **Decision:** is "working" actually a stored type, or just a label for the live context window?

### G13 — Conversation history not wired
`conversationId?: string` received in input but never used. Multi-turn conversations need history packing into context.

### G14 — `excludedItems` always empty
ContextBuilder builds `includedItems` correctly but never populates `excludedItems`. Should track items filtered by `minScore` for trace visibility.

### G15 — Memory write candidates never persisted
`memoryWriteCandidates` returned in output but `MemoryService.save()` and persistence path not shown. When `auto_high_confidence`, who actually inserts?

### G16 — Memory `similarity` field
`memory.similarity ?? 0` referenced in retrieval. `MemoryRecord` type does not include `similarity`. **Fix:** define `MemoryRecordWithScore = MemoryRecord & { similarity: number }` for repo return type.

### G17 — Trace events not persisted to `trace_events` table
Engine emits trace in-memory via `TraceService`. Schema has `trace_events` table. No code path persists. Add `trace.persist(runId)` call at end of `engine.run()`.

### G18 — `engine_runs` table inserted where?
No `RunRepository.create()` call shown in engine. Spec implies persistence but skips it.

### G19 — Failure mode detection
`failure_detected` trace event type exists. No detector defined. Candidate signals: low retrieval scores, low faithfulness, repeated contradictions.

### G20 — No test scaffolding
Architecture defines interfaces clearly (good for testing) but no test file layout. Propose `/src/__tests__/` with unit + integration split.

---

## Low priority / nice-to-have

### G21 — Importance scoring source
`importance: 0.5` default in schema. Real importance scoring (LLM-rated 1–10, Generative Agents-style) not specified. Phase 4 addition.

### G22 — Memory access tracking
`lastAccessedAt` field exists. Retrieval should update it on hit. Not shown in code.

### G23 — Embedding dimension hardcoded
`vector(1536)` hardcoded to OpenAI ada-002 / text-embedding-3-small. If switching to BGE or E5, dimension differs. Make configurable.

### G24 — Multilingual signals in router
Router mixes EN + RU signals inline. OK for prototype, but signals belong in config file for maintainability.

### G25 — No streaming
LLM service returns full string. For UX, streaming response is standard. Phase 3+ concern.

### G26 — Ingestion service is a stub
Listed in file layout, no spec. Phase 2 must define: chunking strategy, embed-and-store flow, batch sizing.

---

## Resolution recommendation

**Block Phase 2 on:** G1, G5, G6, G7, G8, G9, G10. These are interface contracts the engine cannot run without.

**Resolve in Phase 2:** G11, G15, G16, G17, G18, G22, G23, G26.

**Defer to Phase 4+:** G2, G3, G4, G12, G13, G14, G19, G20, G21, G24, G25.

---

## Next move

Recommended sequence:

1. Patch ARCHITECTURE.md with interface stubs for G5, G6, G7, G8, G9, G10.
2. Decide G1 (drop long_context or stub it).
3. Start Phase 1: deterministic simulator, in-memory only, full trace contract validated.
4. Write contract tests against `engine.run()` output shape before any real embedder is plugged in.
