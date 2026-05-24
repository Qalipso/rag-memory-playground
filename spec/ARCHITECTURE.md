# RagMemoryEngine — Architecture Specification

> Engine-first, UI-second. Core returns answer + full process trace. UI renders trace.
> Theoretical foundation: see `../GUIDE.md` (builder view) and `../THEORY.md` (papers).

**Status:** v1 spec, pre-implementation
**Last updated:** 2026-05-22

---

## 1. Core concept

`RagMemoryEngine` — orchestrates the full retrieval-augmented memory loop and returns a structured trace of every decision.

### Pipeline

```
User input
  → classify intent
  → decide route (RAG / Memory / Long Context / Hybrid)
  → retrieve docs
  → retrieve memories
  → score / rerank
  → build context
  → generate answer
  → decide what to save
  → update memory
  → evaluate quality
  → return answer + process trace
```

### Engine contract

The engine returns **not just an answer** but the full reasoning artifact:

```ts
{
  runId,
  answer,
  route,
  sources,           // RetrievalHit<DocumentChunk>[]
  usedMemories,      // RetrievalHit<MemoryRecord>[]
  memoryWriteCandidates,
  metrics,           // EvaluationResult
  trace              // TraceEvent[]
}
```

Everything visualizable later must first exist as structured events in code.

---

## 2. File layout

### Framework-agnostic core

```
/src
  /core
    engine.ts          # RagMemoryEngine orchestrator
    types.ts           # Public types: input, output, config, MemoryRecord, etc.
    config.ts          # mergeWithDefaultConfig, defaults
    container.ts       # DI composition root

  /services
    router.service.ts
    ingestion.service.ts
    retrieval.service.ts
    memory.service.ts
    reranker.service.ts
    context-builder.service.ts
    llm.service.ts
    embedder.service.ts          # NEW — interface + provider impl
    evaluation.service.ts
    trace.service.ts
    consolidation.service.ts     # NEW — reflection / summarization
    forgetting.service.ts        # NEW — decay / invalidation jobs
    contradiction.service.ts     # NEW — detect conflicting memories

  /repositories
    document.repository.ts
    chunk.repository.ts
    memory.repository.ts
    memory-link.repository.ts    # NEW — for A-MEM-style graph
    run.repository.ts
    trace.repository.ts          # NEW — persist trace events

  /db
    schema.sql
    migrations/

  /api
    rag-memory-run.ts
    ingest-document.ts
    save-memory.ts
    list-memories.ts             # NEW — inspect store
    invalidate-memory.ts         # NEW — explicit forgetting
```

### Next.js layout (when wired)

```
/app/api/rag-memory/run/route.ts
/app/api/rag-memory/ingest/route.ts
/app/api/rag-memory/memories/route.ts
/lib/rag-memory/...   # re-export of /src/core, /src/services
```

---

## 3. Public types

### Engine input

```ts
export type EngineMode = "rag" | "memory" | "long_context" | "hybrid";

export interface RagMemoryInput {
  userId: string;
  conversationId?: string;
  message: string;
  mode?: EngineMode;
  config?: Partial<EngineConfig>;
}
```

### Engine config

Reflects the dials called out in GUIDE.md §2.1.

```ts
export interface EngineConfig {
  retrieval: {
    mode: "dense" | "bm25" | "hybrid";
    topK: number;
    rerank: boolean;
    minScore: number;
  };

  memory: {
    enabledTypes: MemoryType[];
    writePolicy: "never" | "ask" | "auto_high_confidence";
    consolidationEnabled: boolean;
    forgettingEnabled: boolean;
    contradictionDetection: boolean;
  };

  scoring: {
    relevanceWeight: number;
    recencyWeight: number;
    importanceWeight: number;
  };

  generation: {
    maxContextTokens: number;
    citeSources: boolean;
    strictGrounding: boolean;
  };
}
```

### Memory model

Maps to GUIDE.md §2.3 taxonomy.

```ts
export type MemoryType =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural";

export type MemoryStatus =
  | "active"
  | "stale"
  | "invalidated"
  | "archived";

export interface MemoryRecord {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;

  importance: number; // 0–1
  embedding?: number[];

  tags: string[];
  source: "chat" | "document" | "reflection" | "manual";

  createdAt: string;
  lastAccessedAt?: string;
  expiresAt?: string;

  status: MemoryStatus;

  metadata?: {
    confidence?: number;
    relatedEntity?: string;
    invalidatesMemoryId?: string;
    reason?: string;
  };
}
```

---

## 4. Memory scoring

Three-factor blend (Generative Agents — see GUIDE.md §2.4).

```ts
export interface MemoryScoreInput {
  relevance: number;       // cosine similarity 0–1
  importance: number;      // 0–1
  lastAccessedAt?: string;
  createdAt: string;
  now?: Date;
  weights: {
    relevanceWeight: number;
    recencyWeight: number;
    importanceWeight: number;
  };
}

export function calculateRecencyScore(
  date: string,
  now = new Date(),
  halfLifeDays = 30
): number {
  const past = new Date(date).getTime();
  const diffDays = (now.getTime() - past) / (1000 * 60 * 60 * 24);
  return Math.exp(-diffDays / halfLifeDays);
}

export function calculateMemoryScore(input: MemoryScoreInput): number {
  const recency = calculateRecencyScore(
    input.lastAccessedAt ?? input.createdAt,
    input.now
  );

  const { relevanceWeight, recencyWeight, importanceWeight } = input.weights;

  const weighted =
    relevanceWeight * input.relevance +
    recencyWeight * recency +
    importanceWeight * input.importance;

  const maxWeight = relevanceWeight + recencyWeight + importanceWeight;
  return weighted / maxWeight;
}
```

---

## 5. Trace events

```ts
export type TraceEventType =
  | "input_received"
  | "intent_detected"
  | "route_selected"
  | "documents_retrieved"
  | "memories_retrieved"
  | "items_reranked"
  | "context_built"
  | "answer_generated"
  | "memory_write_decision"
  | "memory_saved"
  | "memory_updated"
  | "memory_invalidated"
  | "evaluation_completed"
  | "failure_detected";

export interface TraceEvent {
  id: string;
  runId: string;
  type: TraceEventType;
  label: string;
  timestamp: string;
  payload: Record<string, unknown>;
}
```

Trace is the **single source of truth** for UI. Anything the UI wants to show must first be emitted here.

---

## 6. Services

### 6.1 Router

Decides RAG / Memory / Long Context / Hybrid. Rule-based first, LLM classifier later.

```ts
export interface RouteDecision {
  mode: EngineMode;
  useDocuments: boolean;
  useMemory: boolean;
  useLongContext: boolean;
  reason: string;
  confidence: number;
}

export class RouterService {
  async decide(message: string): Promise<RouteDecision> {
    const lower = message.toLowerCase();

    const memorySignals = [
      "remember", "last time", "again", "why do i", "my pattern",
      "что я", "почему я снова", "мы обсуждали",
    ];

    const documentSignals = [
      "according to", "in the document", "from the file", "wiki", "theory",
      "документ", "файл", "теория",
    ];

    const needsMemory = memorySignals.some((s) => lower.includes(s));
    const needsDocs = documentSignals.some((s) => lower.includes(s));

    if (needsMemory && needsDocs) {
      return {
        mode: "hybrid",
        useDocuments: true,
        useMemory: true,
        useLongContext: false,
        reason: "Question references both user history and external material.",
        confidence: 0.8,
      };
    }

    if (needsMemory) {
      return {
        mode: "memory",
        useDocuments: false,
        useMemory: true,
        useLongContext: false,
        reason: "Question depends on previous user context.",
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
      reason: "Default safe route for exploratory product questions.",
      confidence: 0.55,
    };
  }
}
```

### 6.2 Retrieval

```ts
export interface RetrievalHit<T> {
  item: T;
  relevance: number;
  recency?: number;
  importance?: number;
  finalScore: number;
  reasons: string[];
}

export class RetrievalService {
  constructor(
    private chunkRepo: ChunkRepository,
    private memoryRepo: MemoryRepository,
    private embedder: EmbedderService
  ) {}

  async retrieveDocuments(query: string, topK: number): Promise<RetrievalHit<DocumentChunk>[]> {
    const queryEmbedding = await this.embedder.embed(query);
    const chunks = await this.chunkRepo.searchByVector(queryEmbedding, topK);

    return chunks.map((chunk) => ({
      item: chunk,
      relevance: chunk.similarity,
      finalScore: chunk.similarity,
      reasons: ["semantic_similarity"],
    }));
  }

  async retrieveMemories(
    userId: string,
    query: string,
    config: EngineConfig
  ): Promise<RetrievalHit<MemoryRecord>[]> {
    const queryEmbedding = await this.embedder.embed(query);

    const memories = await this.memoryRepo.searchByVector({
      userId,
      embedding: queryEmbedding,
      types: config.memory.enabledTypes,
      limit: config.retrieval.topK * 3,
    });

    return memories
      .filter((m) => m.status === "active")
      .map((memory) => {
        const relevance = memory.similarity ?? 0;

        const finalScore = calculateMemoryScore({
          relevance,
          importance: memory.importance,
          createdAt: memory.createdAt,
          lastAccessedAt: memory.lastAccessedAt,
          weights: config.scoring,
        });

        return {
          item: memory,
          relevance,
          importance: memory.importance,
          finalScore,
          reasons: ["semantic_similarity", "importance_weight", "recency_weight"],
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, config.retrieval.topK);
  }
}
```

### 6.3 Context builder

```ts
export interface BuiltContext {
  systemPrompt: string;
  memoryContext: string;
  documentContext: string;
  finalPrompt: string;
  includedItems: Array<{
    id: string;
    type: "memory" | "document";
    score: number;
    reason: string;
  }>;
  excludedItems: Array<{
    id: string;
    type: "memory" | "document";
    reason: string;
  }>;
}

export class ContextBuilderService {
  build(params: {
    message: string;
    documentHits: RetrievalHit<DocumentChunk>[];
    memoryHits: RetrievalHit<MemoryRecord>[];
    config: EngineConfig;
  }): BuiltContext {
    const topDocs = params.documentHits
      .filter((h) => h.finalScore >= params.config.retrieval.minScore)
      .slice(0, params.config.retrieval.topK);

    const topMemories = params.memoryHits
      .filter((h) => h.finalScore >= params.config.retrieval.minScore)
      .slice(0, params.config.retrieval.topK);

    const memoryContext = topMemories
      .map((h, i) => `[Memory ${i + 1} | score=${h.finalScore.toFixed(2)}]\n${h.item.content}`)
      .join("\n\n");

    const documentContext = topDocs
      .map((h, i) => `[Source ${i + 1} | score=${h.finalScore.toFixed(2)}]\n${h.item.content}`)
      .join("\n\n");

    const systemPrompt = `
You are a grounded AI assistant.
Use provided memory and document context.
If context is insufficient, say so.
Do not invent user facts.
`;

    const finalPrompt = `
${systemPrompt}

User message:
${params.message}

Relevant memories:
${memoryContext || "No relevant memories found."}

Relevant documents:
${documentContext || "No relevant documents found."}

Answer:
`;

    return {
      systemPrompt,
      memoryContext,
      documentContext,
      finalPrompt,
      includedItems: [
        ...topMemories.map((h) => ({
          id: h.item.id,
          type: "memory" as const,
          score: h.finalScore,
          reason: h.reasons.join(", "),
        })),
        ...topDocs.map((h) => ({
          id: h.item.id,
          type: "document" as const,
          score: h.finalScore,
          reason: h.reasons.join(", "),
        })),
      ],
      excludedItems: [],
    };
  }
}
```

### 6.4 Memory write policy

```ts
export interface MemoryWriteCandidate {
  shouldSave: boolean;
  type: MemoryType;
  content: string;
  importance: number;
  confidence: number;
  reason: string;
  requiresUserApproval: boolean;
}

export class MemoryWritePolicyService {
  async decide(params: {
    userId: string;
    userMessage: string;
    assistantAnswer: string;
    route: RouteDecision;
    config: EngineConfig;
  }): Promise<MemoryWriteCandidate[]> {
    if (params.config.memory.writePolicy === "never") return [];

    const candidates: MemoryWriteCandidate[] = [];
    const m = params.userMessage.toLowerCase();

    if (m.includes("i prefer") || m.includes("мне нравится") || m.includes("я хочу") || m.includes("моя цель")) {
      candidates.push({
        shouldSave: true,
        type: "semantic",
        content: params.userMessage,
        importance: 0.75,
        confidence: 0.7,
        reason: "User stated a preference, goal, or stable personal fact.",
        requiresUserApproval: params.config.memory.writePolicy === "ask",
      });
    }

    if (m.includes("stuck") || m.includes("застрял") || m.includes("снова") || m.includes("паттерн")) {
      candidates.push({
        shouldSave: true,
        type: "episodic",
        content: `User described a recurring pattern: ${params.userMessage}`,
        importance: 0.65,
        confidence: 0.65,
        reason: "User described a repeated behavior or pattern.",
        requiresUserApproval: params.config.memory.writePolicy === "ask",
      });
    }

    return candidates;
  }
}
```

---

## 7. Engine orchestration

```ts
export interface RagMemoryOutput {
  runId: string;
  answer: string;
  route: RouteDecision;
  sources: RetrievalHit<DocumentChunk>[];
  usedMemories: RetrievalHit<MemoryRecord>[];
  memoryWriteCandidates: MemoryWriteCandidate[];
  metrics?: EvaluationResult;
  trace: TraceEvent[];
}

export class RagMemoryEngine {
  constructor(
    private router: RouterService,
    private retrieval: RetrievalService,
    private contextBuilder: ContextBuilderService,
    private llm: LLMService,
    private memoryWritePolicy: MemoryWritePolicyService,
    private evaluation: EvaluationService,
    private trace: TraceService
  ) {}

  async run(input: RagMemoryInput): Promise<RagMemoryOutput> {
    const runId = crypto.randomUUID();
    const config = mergeWithDefaultConfig(input.config);

    this.trace.add(runId, "input_received", "Input received", {
      message: input.message,
      userId: input.userId,
    });

    const route = await this.router.decide(input.message);
    this.trace.add(runId, "route_selected", "Route selected", route);

    const documentHits = route.useDocuments
      ? await this.retrieval.retrieveDocuments(input.message, config.retrieval.topK)
      : [];

    this.trace.add(runId, "documents_retrieved", "Documents retrieved", {
      count: documentHits.length,
      topScore: documentHits[0]?.finalScore ?? null,
    });

    const memoryHits = route.useMemory
      ? await this.retrieval.retrieveMemories(input.userId, input.message, config)
      : [];

    this.trace.add(runId, "memories_retrieved", "Memories retrieved", {
      count: memoryHits.length,
      topScore: memoryHits[0]?.finalScore ?? null,
    });

    const context = this.contextBuilder.build({
      message: input.message,
      documentHits,
      memoryHits,
      config,
    });

    this.trace.add(runId, "context_built", "Context built", {
      includedItems: context.includedItems,
      excludedItems: context.excludedItems,
    });

    const answer = await this.llm.generate(context.finalPrompt);
    this.trace.add(runId, "answer_generated", "Answer generated", {
      answerLength: answer.length,
    });

    const memoryWriteCandidates = await this.memoryWritePolicy.decide({
      userId: input.userId,
      userMessage: input.message,
      assistantAnswer: answer,
      route,
      config,
    });

    this.trace.add(runId, "memory_write_decision", "Memory write decision completed", {
      candidates: memoryWriteCandidates,
    });

    const metrics = await this.evaluation.evaluate({
      question: input.message,
      answer,
      documentHits,
      memoryHits,
    });

    this.trace.add(runId, "evaluation_completed", "Evaluation completed", { metrics });

    return {
      runId,
      answer,
      route,
      sources: documentHits,
      usedMemories: memoryHits,
      memoryWriteCandidates,
      metrics,
      trace: this.trace.get(runId),
    };
  }
}
```

---

## 8. Database schema (Postgres + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_url TEXT,
  content TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance FLOAT DEFAULT 0.5,
  embedding vector(1536),
  tags TEXT[] DEFAULT '{}',
  source TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now(),
  last_accessed_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE memory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  to_memory_id UUID REFERENCES memories(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.5,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE engine_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  input TEXT NOT NULL,
  answer TEXT,
  route JSONB,
  metrics JSONB,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE trace_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES engine_runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);

-- Indexes
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memories_user_status ON memories (user_id, status);
CREATE INDEX idx_trace_run ON trace_events (run_id, created_at);
```

---

## 9. API endpoint

```ts
// app/api/rag-memory/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ragMemoryEngine } from "@/lib/rag-memory/container";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const result = await ragMemoryEngine.run({
      userId: body.userId,
      conversationId: body.conversationId,
      message: body.message,
      mode: body.mode,
      config: body.config,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to run RAG Memory engine" },
      { status: 500 }
    );
  }
}
```

---

## 10. Example response

```json
{
  "runId": "run_123",
  "answer": "...",
  "route": {
    "mode": "hybrid",
    "useDocuments": true,
    "useMemory": true,
    "useLongContext": false,
    "reason": "Question needs both project docs and user history.",
    "confidence": 0.82
  },
  "sources": [
    {
      "item": { "id": "chunk_1", "content": "RAG Memory adds write, consolidate, forget..." },
      "finalScore": 0.79,
      "reasons": ["semantic_similarity"]
    }
  ],
  "usedMemories": [
    {
      "item": { "id": "mem_1", "type": "semantic", "content": "User wants Shadow to be an AI second brain." },
      "finalScore": 0.86,
      "reasons": ["semantic_similarity", "importance_weight", "recency_weight"]
    }
  ],
  "memoryWriteCandidates": [
    {
      "shouldSave": true,
      "type": "episodic",
      "content": "User prefers visual/product-oriented explanations.",
      "importance": 0.7,
      "confidence": 0.76,
      "requiresUserApproval": true
    }
  ],
  "metrics": {
    "faithfulness": 0.82,
    "contextRelevance": 0.78,
    "answerRelevance": 0.88
  },
  "trace": []
}
```

---

## 11. MVP implementation order

### Phase 1 — Deterministic simulator
No LLM, no embeddings. Prove the contract.
- Hardcoded documents and memories
- Fake similarity scores
- Rule-based router
- Trace events fully emitted
- JSON response complete

**Goal:** UI-ready contract validated end-to-end. Testable, fast, deterministic.

### Phase 2 — Real embeddings + vector search
- OpenAI or local embedder
- Postgres + pgvector
- Document ingestion pipeline
- Memory ingestion pipeline
- Real semantic search

### Phase 3 — LLM answer generation
- Context builder live
- Provider-agnostic LLM service
- Source citations
- Strict grounding prompt

### Phase 4 — Memory write
- Persist write candidates
- `ask` vs `auto_high_confidence` policy split
- Semantic vs episodic routing on save
- Memory invalidation API

### Phase 5 — Evaluation
- Faithfulness, answer relevance, context relevance (RAGAS-style LLM judge)
- Recall@k, nDCG@k on a synthetic gold set
- Tokens/query, p50/p95 latency
- Failure-mode detector

---

## 12. Core principle

Do not start with UI.

Start with the contract:

```ts
const result = await ragMemoryEngine.run({
  userId: "demo-user",
  message: "Why am I stuck with Shadow?",
});
```

Result must explain:
1. Which route was chosen
2. Which documents were found
3. Which memories were found
4. Why those specifically
5. What entered context
6. What answer was generated
7. What the system wants to save
8. What quality metrics say
9. What failure modes were detected

UI then becomes trivial: take `trace`, `sources`, `usedMemories`, `metrics`, render.

---

## 13. Theory ↔ Code mapping

| Theory (GUIDE.md / THEORY.md §) | Code artifact |
|---|---|
| RAG pipeline (§2.1) | `RetrievalService` + `ContextBuilderService` + `LLMService` |
| Memory lifecycle (§2.2) | `MemoryWritePolicyService` + `ConsolidationService` + `ForgettingService` |
| Memory taxonomy (§2.3) | `MemoryType` enum, separate stores per type |
| Three-factor scoring (§2.4) | `calculateMemoryScore` |
| Retrieval metrics (§2.5) | `EvaluationService` |
| Architectural patterns (§2.6) | `EngineMode` enum, `RouterService` |
| Failure modes (§2.7) | `failure_detected` trace event, future detectors |
| Hypotheses (§2.8) | Phase 5 experiments |
