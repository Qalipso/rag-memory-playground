# Architecture — RAG Memory Playground

## System Overview

```
                ┌────────────┐
   user ───────▶│  Next.js   │
                │     UI     │
                └─────┬──────┘
                      │  tRPC / HTTP
                      ▼
              ┌───────────────┐         ┌──────────────┐
              │ Orchestrator  │────────▶│  Postgres    │
              │ (Node API)    │         │ + pgvector   │
              └───────┬───────┘         └──────────────┘
                      │
                      ▼
              ┌───────────────┐
              │ Python Runner │
              │  (FastAPI)    │
              └───┬─────┬─────┘
        ┌─────────┘     └─────────┐
        ▼                          ▼
  ┌──────────┐              ┌─────────────┐
  │ LiteLLM  │              │ Embedder/   │
  │ Gateway  │              │ Reranker    │
  │ (OpenAI, │              │ (Modal /    │
  │ Claude,  │              │ Replicate / │
  │ local,…) │              │ self-host)  │
  └──────────┘              └─────────────┘
```

## Components

| Component | Responsibility |
|-----------|---------------|
| Next.js UI | Pipeline builder, comparison view, ground-truth editor, trace viewer |
| Orchestrator (Node + tRPC) | Persist pipelines, schedule runs, expose API |
| Python Runner (FastAPI) | Execute a declarative pipeline JSON: load docs → chunk → embed → retrieve → rerank → generate |
| Postgres + pgvector | All persistence + embeddings for retrieval indexes |
| Object store | Source documents (PDF, MD, HTML, etc.) |
| LiteLLM | Unified interface to OpenAI, Anthropic, Together, local models |
| Embedder/Reranker hosting | Modal/Replicate for non-OpenAI embedders/rerankers |
| Eval workers | Compute faithfulness, answer relevance, context precision/recall, LLM-judge scores |

## Data Model

```
Workspace ──< User
Workspace ──< DocumentSet ──< Document ──< DocumentChunk (lazy, per chunking config)
Workspace ──< Pipeline ──< PipelineVersion
  PipelineVersion.config_json  → declarative pipeline (see Pipeline JSON Spec below)
Workspace ──< GroundTruthSet ──< GroundTruthRow
  GroundTruthRow.question, ideal_answer, source_doc_ids[], notes
Workspace ──< Run
  Run.pipeline_version_id        → PipelineVersion
  Run.ground_truth_set_id        → GroundTruthSet (nullable for ad-hoc queries)
  Run.queries[]                  → either GT rows or free-form queries
  Run.results[]                  → RunResult per (query × pipeline version)
RunResult
  .retrieved_chunks[]
  .reranker_scores
  .final_context
  .generator_prompt
  .output
  .metrics                       → {faithfulness, answer_relevance, ctx_precision, ctx_recall, llm_judge}
  .cost_usd, .latency_ms_total, .latency_ms_per_stage
```

## Pipeline JSON Spec (declarative)

```json
{
  "name": "v2-bge-rerank",
  "chunker": { "type": "recursive_character", "size": 800, "overlap": 120 },
  "embedder": { "provider": "openai", "model": "text-embedding-3-large" },
  "retriever": { "k": 12, "filter": null },
  "reranker": { "provider": "cohere", "model": "rerank-3", "top_k": 4 },
  "generator": {
    "provider": "openai",
    "model": "gpt-4o-2024-08-06",
    "temperature": 0.1,
    "prompt_template_id": "pt_default_qa_v3"
  }
}
```

A pipeline is identified by its content hash. Pipelines are immutable once published; edits create a new version.

## Service Boundaries

- **UI ↔ Orchestrator** — tRPC; the UI never talks to the Python runner directly
- **Orchestrator ↔ Python Runner** — REST + JSON; runner is stateless
- **Eval workers** — pull from a queue; can scale independently

## Why Python for the runner

Most RAG building blocks (chunking libraries, embedders, rerankers, vector DB clients) are Python-native. The runner is Python so we can plug in components without porting. The Orchestrator stays in Node for tRPC ergonomics with the UI.

## Storage

- Documents in object store (S3-compatible)
- Chunks materialized in Postgres per chunking config, with `(doc_id, chunker_hash)` keying — chunking is computed once per unique config across the workspace
- Embeddings in pgvector, keyed `(chunk_id, embedder_hash)`
- Both layers are caches: re-chunking and re-embedding are deterministic

## Cost & Latency Accounting

Every stage emits:
- `cost_usd` (token counts × current model price)
- `latency_ms`

These roll up into the `RunResult.metrics` JSON and are surfaced in the UI per stage and totaled per query.

## Security

- Workspace isolation enforced at the orchestrator
- API keys for third-party providers stored in workspace-scoped secrets manager (sealed at rest)
- Documents are private by default; share links signed and TTL-bounded

## Observability

- OpenTelemetry traces across orchestrator + runner
- Slow-query and high-cost-query alerts per workspace
- Eval-worker queue depth dashboard
