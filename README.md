# RAG Memory Playground

> **Current state:** Framework-first engine is real and wired. LangGraph orchestration is always real; LlamaIndex.TS retrieval, OpenAI generation, Mem0 memory, and Langfuse observability promote to real per-provider when their env keys are present, else fall back to deterministic stubs (surfaced honestly in `providerStatus` + `failureModes`). Evaluation is a Ragas-shaped deterministic stub (real Ragas = Python sidecar, roadmapped).
>
> Surfaces shipping today:
> - **Visual Memory Lab** (`/memory`) — raw note → multi-level long-term memory: normalize → classify → extract entities → split blocks → embed → store → link graph → consolidate. Full per-stage trace + memory graph.
> - **Side-by-side comparison** (`/compare`) — same query through 2–4 pipeline configs; diff quality × cost × latency, winners per axis.
> - **Framework debug** (`/playground`) — raw `ExplainableRun` JSON for any query.
>
> Persistence is env-gated: in-memory by default; Postgres + pgvector when `DATABASE_URL` is set (schema: `supabase/migrations/0001_memory.sql`).

> A sandbox where teams can prototype, evaluate, and compare retrieval-augmented generation pipelines side-by-side. Configure chunker, embedder, retriever, reranker, and generator — run identical queries — measure faithfulness, answer relevance, context precision/recall, latency, and cost.

---

## Project Overview

RAG Memory Playground is a hosted experimentation environment for teams building retrieval-augmented LLM features. It treats a RAG pipeline as a tunable graph of stages — chunker → embedder → retriever → reranker → generator — and lets users run the same query across multiple pipeline configurations to see real, measurable differences in quality, cost, and latency.

The product fills the space between "I have a notebook with langchain code that works on my laptop" and "we have production RAG and I cannot tell why retrieval quality dropped last Tuesday." It is the experimentation and decision layer that lets a small team make defensible RAG decisions without spending three weeks rebuilding plumbing.

## Problem

RAG is the most common pattern in production AI applications and the hardest to debug.

Three problems recur in every team building RAG:

1. **The search space is enormous.** Chunk size, chunk overlap, embedding model, retrieval k, reranker model, context window strategy, prompt template — each has 3–10 reasonable values. The combinatorial space is unmanageable without tooling.
2. **The eval signal is weak.** Most teams eyeball outputs. They cannot tell whether a change improved faithfulness or just made answers longer. They have no ground-truth set.
3. **The cost picture is invisible.** A "better" pipeline that triples cost per query is not a win. Teams routinely ship configurations they would have rejected if they had seen the cost numbers.

Existing tools fall short:
- LangChain / LlamaIndex give you the *components* but no experimentation harness.
- Notebooks are write-only; results don't persist or compare.
- Eval frameworks (Ragas, TruLens) score one pipeline; they don't make comparison the first-class experience.

## Target Users

- **Applied AI engineers** building RAG features and needing to make defensible pipeline choices
- **AI Product Managers** who need to understand the trade-off curves (quality × cost × latency) before signing off on production
- **Founders prototyping** AI features without time to build internal eval tooling
- **Eval / quality engineers** who need to write ground-truth sets and grade outputs

## Core Features

| Feature | Description |
|---------|-------------|
| Pipeline Builder | Visual, declarative pipeline: pick a chunker, embedder, retriever, reranker, generator; save as a named "config" |
| Side-by-side Runner | Run the same query across 2–4 pipeline configs in parallel; see outputs in columns |
| Ground-Truth Sets | Upload a set of (question, ideal_answer, source_doc_ids) tuples; runs are scored against them |
| RAG Eval Suite | Faithfulness, answer relevance, context precision, context recall — built-in, plus LLM-as-judge |
| Cost & Latency Tracker | Every run shows total cost, per-stage cost, p95 latency |
| Config Diff | Diff two saved configs visually; one-click "promote winning config" |
| Export as Code | Generate a LangChain or LlamaIndex template that reproduces the winning config |
| Trace View | Per-query trace: chunks retrieved, reranker scores, final context, generator prompt, output |

## Technical / Product Scope

**Stack (intended):**
- Next.js (UI) + Python FastAPI (pipeline runner)
- Postgres + pgvector for embeddings & runs
- Object store for documents
- Modal or Replicate for embedding/reranker model inference
- LiteLLM as the model gateway abstraction

**Product scope decisions:**
- Pipelines are **declarative JSON**, not arbitrary code. This is what makes config diff and export-as-code possible.
- Ground-truth sets are **first-class objects** with versioning, just like in the Eval Wiki.
- Comparison is **the primary UI surface**, not a buried feature.
- The product is opinionated about which metrics matter and which are noise.

## Portfolio Value

This project demonstrates fluency in the hardest part of building AI products — making defensible decisions in the face of high-dimensional design space and weak feedback signals.

- **Applied AI depth** — accurate understanding of where RAG pipelines actually fail (recall, faithfulness, over-stuffed contexts)
- **PM thinking** — the comparison-first UI is a product decision, not an engineering one
- **Cost-awareness** — exposing cost and latency alongside quality avoids the classic "win the demo, lose the launch" pattern
- **Reproducibility** — declarative configs + export-as-code mean the user's winning config is not trapped in the tool

## What This Project Proves

- I can design a tool around how AI engineers actually do iterative work — small, frequent, comparative experiments.
- I understand RAG well enough to pick the right metrics (faithfulness, context recall) and reject the wrong ones (vague "quality scores").
- I can scope an opinionated product instead of a flexibility-first one — declarative pipelines, not code-first.
- I understand the operational reality that most RAG decisions are cost-quality trade-offs, not pure quality wins.

## Future Roadmap

| Phase | Outcome |
|-------|---------|
| 0 | Schema, pipeline JSON spec, UI mock (current state in this repo) |
| 1 | Single-user MVP: build pipeline, run query, see output + cost |
| 2 | Side-by-side comparison; ground-truth sets; built-in eval metrics |
| 3 | LLM-as-judge scoring; trace view; export-as-code (LangChain template) |
| 4 | Auto-search: sweep over hyperparameters and surface Pareto front (quality vs cost) |
| 5 | Failure-mode tagging on individual queries; failure clusters across configs |
| 6 | Production-trace ingestion (replay prod queries through new configs offline) |

## Repository Layout

```
rag-memory-playground/
├── README.md
├── product-brief.md
├── architecture.md
├── roadmap.md
├── acceptance-criteria.md
├── .env.example
├── src/framework/                    # framework-first engine
│   ├── types.ts                      # ExplainableRun, GraphStep, ProviderStatus
│   ├── engine.ts                     # FrameworkEngine
│   ├── container.ts                  # env-driven DI with fallback tracking
│   ├── ports/                        # provider port interfaces
│   ├── adapters/                     # local stubs + real adapters
│   ├── workflow/                     # LangGraph state + 7 nodes + graph
│   ├── data/seed.ts                  # demo docs + memories
│   └── __tests__/                    # contract tests
├── src/core/                         # legacy Phase 1 simulator (still works)
├── scripts/
│   ├── demo.ts                       # legacy simulator demo
│   └── demo-framework.ts             # framework engine demo
├── app/
│   ├── api/rag-memory/run/route.ts                # legacy POST
│   ├── api/rag-memory/framework-run/route.ts      # framework-first POST
│   └── rag-memory-playground/page.tsx             # debug page
├── docs/, mock-data/, ui/, screens/, diagrams/
```

---

## How to run in local demo mode

Local mode uses deterministic stubs for every provider. No API keys required.

```bash
# install
npm install

# dev server (http://localhost:3000) → / lists all surfaces
npm run dev

# framework engine demo (LangGraph + local stubs, no keys needed)
npx tsx scripts/demo-framework.ts

# legacy Phase 1 simulator
npx tsx scripts/demo.ts

# tests (runs every *.test.ts under src/)
npm test

# typecheck
npm run typecheck
```

The demo prints route decision, provider status, graph steps, retrieved docs/memories, evaluation scores, failure modes, and timing.

### Enable real providers / persistence

Copy `.env.example` → `.env.local`:

```
FRAMEWORK_MODE=real
OPENAI_API_KEY=sk-...        # promotes LlamaIndex retrieval + OpenAI generation + memory extraction
MEM0_API_KEY=...             # promotes memory provider to Mem0 cloud
LANGFUSE_PUBLIC_KEY=...      # promotes observability to Langfuse
LANGFUSE_SECRET_KEY=...
DATABASE_URL=postgres://...  # switches memory store from in-memory to Postgres + pgvector
ALLOW_RUNTIME_CONFIG=1       # local dev only: lets the Settings UI write keys to .env.local
```

Apply the DB schema once: `psql "$DATABASE_URL" -f supabase/migrations/0001_memory.sql` (the store also ensures it idempotently on first use).

## How to enable real providers

Copy `.env.example` to `.env.local` (or export the vars in your shell) and set:

- `FRAMEWORK_MODE=real`
- `OPENAI_API_KEY=...` — promotes LlamaIndex.TS retrieval and OpenAI chat completions to real mode.
- `MEM0_API_KEY=...` — promotes memory provider to Mem0 cloud.
- `LANGFUSE_PUBLIC_KEY=...` and `LANGFUSE_SECRET_KEY=...` — promotes observability to Langfuse.

Promotion is **per provider**. Missing keys cause that one provider to remain a stub and surface as `provider_fallback_used` in the failure modes. Other providers stay real if their keys are present.

## Which parts are real

| Layer | Real provider | Stub fallback |
|-------|---------------|---------------|
| Orchestration | `@langchain/langgraph` StateGraph (always real) | — |
| Retrieval | `llamaindex` 0.8 VectorStoreIndex | `LocalRagProvider` (lexical) |
| Memory | `mem0ai` 2.x cloud | `LocalMemoryProvider` (lexical, in-memory) |
| LLM | `openai` 4.x chat completions | `LocalLLMProvider` (deterministic narration) |
| Observability | `langfuse` 3.x traces | `LocalObservabilityProvider` (in-memory) |

## Which parts are stubs

| Layer | Why it is still a stub | Plan |
|-------|------------------------|------|
| Evaluation | Real Ragas is Python; needs a sidecar | Phase 5: spawn Ragas via subprocess or HTTP bridge |
| Run/trace storage | Engine emits trace; only memory blocks/edges persist | Persist `ExplainableRun` to Postgres next |

Done since the original spec: **memory persistence** — formed memory blocks, entities, and graph edges write to Postgres + pgvector when `DATABASE_URL` is set (`PgMemoryStore`), else in-memory. **Auto memory write-back** — the Visual Memory Lab forms and stores multi-level memory from a note via `POST /api/rag-memory/memory/form`.

The honesty contract: any provider in stub or fallback mode is reported in `providerStatus` and added to `failureModes` (with severity `info` for evaluation and observability stubs, `warn` for retrieval/memory fallbacks).

## Architecture overview

```
POST /api/rag-memory/framework-run
        │
        ▼
FrameworkEngine.run(input)
        │
        ▼
LangGraph StateGraph
    START
      → classifyIntentNode      (langgraph, real)
      → retrieveDocumentsNode   (llamaindex / local-rag)
      → retrieveMemoriesNode    (mem0 / local-memory)
      → buildContextNode        (langgraph, real)
      → generateAnswerNode      (openai / local-llm)
      → evaluateAnswerNode      (Ragas-shaped stub)
      → buildExplainableRunNode (langgraph; synthesises failure modes)
    END
        │
        ▼
ExplainableRun JSON →  /rag-memory-playground  (debug UI)
```

## Example API request

```bash
curl -X POST http://localhost:3000/api/rag-memory/framework-run \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user",
    "message": "Почему я снова застрял с Shadow и этой теорией?",
    "mode": "auto"
  }'
```

## Example API response

```json
{
  "runId": "run_8974...",
  "input": { "userId": "demo-user", "message": "...", "mode": "auto" },
  "route": {
    "mode": "hybrid",
    "useDocuments": true,
    "useMemory": true,
    "useLongContext": false,
    "reason": "Both memory and document signals matched.",
    "confidence": 0.85
  },
  "providerStatus": [
    {
      "role": "rag",
      "name": "local-rag",
      "framework": "in-memory-lexical",
      "mode": "stub",
      "reason": "FRAMEWORK_MODE=local; using stub.",
      "requiredEnvVars": [],
      "isConfigured": true
    }
  ],
  "graphSteps": [
    {
      "id": "step_...",
      "name": "classifyIntentNode",
      "framework": "langgraph",
      "providerMode": "real",
      "status": "ok",
      "inputSummary": "mode=auto message=\"...\"",
      "outputSummary": "route=hybrid confidence=0.85",
      "durationMs": 0
    }
  ],
  "retrievedDocuments": [ /* ... */ ],
  "retrievedMemories": [ /* ... */ ],
  "finalContext": { "tokensEstimate": 203, "finalPrompt": "..." },
  "answer": "Local LLM (deterministic). Route: hybrid...",
  "evaluations": {
    "faithfulness": { "score": 0.64, "explanation": "..." },
    "contextRelevance": { "score": 0.39, "explanation": "..." },
    "answerRelevance": { "score": 0.96, "explanation": "..." },
    "warnings": []
  },
  "trace": [ /* ... */ ],
  "failureModes": [
    {
      "type": "evaluation_stub_used",
      "description": "Evaluation uses Ragas-shaped heuristics, not real Ragas.",
      "severity": "info"
    },
    {
      "type": "missing_observability_keys",
      "description": "Observability is stub; traces are local-only.",
      "severity": "info"
    }
  ],
  "debug": {
    "envHints": [ { "key": "OPENAI_API_KEY", "present": false } ],
    "containerDecisions": [ { "role": "rag", "decision": "stub (FRAMEWORK_MODE=local)" } ],
    "workflow": {
      "nodeOrder": ["classifyIntentNode", "retrieveDocumentsNode", "retrieveMemoriesNode", "buildContextNode", "generateAnswerNode", "evaluateAnswerNode", "buildExplainableRunNode"],
      "skippedNodes": [],
      "failedNodes": []
    }
  },
  "meta": { "totalDurationMs": 37, "frameworks": { /* ... */ } }
}
```

## Failure mode catalog

| Type | Severity | Trigger |
|------|---------|---------|
| `provider_fallback_used` | warn | A real provider was requested but unavailable; using stub |
| `evaluation_stub_used` | info | Evaluator is Ragas-shaped heuristics, not real Ragas |
| `missing_observability_keys` | info | No Langfuse keys; traces are local-only |
| `no_documents_retrieved` | warn | Route requested docs but retrieval returned none |
| `no_memories_retrieved` | warn | Route requested memory but retrieval returned none |
| `low_context_relevance` | warn | Evaluator scored context relevance < 0.3 |
| `low_retrieval_score` | warn | Top retrieval score < 0.3 |
| `empty_context` | critical | Final context contained zero tokens |
| `route_mismatch` | info | Hybrid route picked but evidence missing |
| `framework_error` | critical | Framework (LangGraph / LlamaIndex) threw |
| `evaluation_failed` | critical | Evaluator threw |
