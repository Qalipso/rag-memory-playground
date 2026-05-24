# Case Study — RAG Memory Playground

A portfolio-grade walkthrough of how this product was scoped, the decisions behind it, and what success would look like in production.

---

## Problem

The conversation I kept overhearing across AI teams in 2025:

> "We changed the embedder from `text-embedding-3-small` to `bge-large-en-v1.5` and turned on a reranker. Some answers feel better. The cost went up. Latency went up. I can't tell if we made a real improvement or just made it slower and more expensive."

Three failure modes were always behind it:

1. **No comparison harness.** Engineers compared configurations by running them in notebooks and reading outputs. There was no permalinked side-by-side. Discussion happened in Slack screenshots.
2. **No ground truth.** "Better" meant "I read 6 answers and they seemed better." The eval signal was sample-of-six.
3. **Cost was invisible until the bill.** A pipeline with a reranker pass + GPT-4o generation could be 20× the cost of a leaner one. Teams shipped and then panicked at the end-of-month invoice.

The structural problem: RAG is a multi-stage system with high-dimensional configuration and weak feedback signal. Solving any one of those problems with a point tool (a metrics library, a notebook UI, a vector DB console) doesn't close the loop.

## Solution

A single product that closes the loop:

1. **Declarative pipelines.** A RAG pipeline is a JSON config with named stages (chunker → embedder → retriever → reranker → generator). This makes pipelines diffable, hashable, and exportable.
2. **Comparison-first UI.** The primary screen is a side-by-side view of multiple pipelines on the same queries. Not buried, not optional.
3. **First-class ground-truth sets.** Versioned, like the rest of the system. Built-in metrics (faithfulness, answer relevance, context precision/recall) plus configurable LLM-as-judge.
4. **Cost and latency always visible.** Per query, per stage, totaled per run. No invisible spend.
5. **Export-as-code.** When the user picks a winning config, they leave the tool with a LangChain or LlamaIndex template. They are not locked in.

## User Flow

A typical week through Sara (Applied AI Engineer):

1. **Monday.** Sara uploads 12 PDFs of product documentation. She builds her first pipeline (`v1`) with reasonable defaults and runs 30 free-form queries to feel it out.
2. **Tuesday.** She creates a ground-truth set (`support-qa v1.0.0`) with 25 (question, ideal_answer, source_doc_ids) tuples. She runs `v1` against it. Faithfulness 0.78, context recall 0.62.
3. **Wednesday.** She builds `v2` with chunk size 600 (was 1200), reranker enabled. Runs against the same GT set. Faithfulness 0.86, context recall 0.81. Cost is 1.4× `v1`. Latency is 1.2× `v1`.
4. **Thursday.** Her PM Idris opens the permalinked comparison. The Pareto chart highlights `v2` as "best value." They agree to ship `v2`.
5. **Friday.** Sara clicks "Export as code → LangChain Python." She copies the file into the product repo, opens a PR. Done.

Without the Playground that flow would have taken her two weeks of notebook scaffolding and resulted in a less defensible decision.

## System Logic

### Why declarative pipelines instead of code

The temptation was to support arbitrary Python pipelines, because users will eventually want some exotic step the tool doesn't ship with. Resisting this is what unlocks the rest of the product:

- Diff between configs becomes trivial (it's just JSON diff)
- Content-hash identity makes runs reproducible
- Export-as-code becomes a *generator* problem, not a transpiler problem
- Visual builder UI is feasible

The escape hatch is export-as-code — when users outgrow the declarative spec, they leave the tool with their work intact.

### Why ground truth is first-class

Most teams' eval signal is "I read 5 answers and felt good." That is unreliable. The product nudges users into authoring ground-truth sets because that is the only path to real measurement. Ground-truth authoring is hard, so Phase 2 includes question-generation helpers from documents (LLM proposes candidates, human accepts/rejects).

### Why caching is at the chunk + embedding layer

Chunking and embedding are deterministic. Caching them per `(doc_id, chunker_hash)` and `(chunk_id, embedder_hash)` means rerunning a pipeline against the same documents is mostly free. This is the difference between "iteration takes 10 minutes" and "iteration takes 10 seconds" — which is the difference between an experimentation tool people use and one they abandon.

### Why a Python runner and a Node orchestrator

Most RAG ecosystem libraries are Python-native (langchain, llamaindex, embedders, rerankers). Forcing the runner to Node would mean wrapping or rewriting these. The orchestrator stays in Node because tRPC + the Next.js UI live there. Two languages, one schema, clean boundary.

## Product Decisions

| Decision | Alternative considered | Why I chose this |
|----------|------------------------|-------------------|
| Declarative pipelines, not code | Code-first pipelines | Diff, hash, comparison, export-as-code all need declarative |
| Comparison-first UI | Single-pipeline-first UI | Comparison is the core user job; everything else is in service of it |
| Ground-truth sets versioned | Free-form test queries | Versioning is what allows "did this change help?" to be a real question |
| Cost surfaced everywhere | Cost on a separate page | Hiding cost is how teams ship expensive configs |
| pgvector default, pluggable retriever | Pinecone-first | pgvector keeps the local dev story simple; pluggable preserves choice |
| Export-as-code in Phase 3 | Vendor lock-in | The user's winning config must outlive the tool |
| LLM-judge sampling, not full | Judge every row | Judge cost dominates otherwise |

## Metrics

| Metric | Baseline (typical workflow) | Target |
|--------|----------------------------|--------|
| Time from "I want to try a change" → "I have a defensible answer" | 1–3 days | <30 minutes |
| Decisions backed by ground-truth scores (vs intuition) | <10% | ≥ 80% |
| Cost-quality awareness at decision time | rarely surfaced | always surfaced |
| Pipeline configs tried per project before launch | 2–4 | 8–15 |
| Users who ship config exported from the tool | n/a | ≥ 60% of paying users |

## What I Learned

- **The hardest product decision is what to leave out.** Saying no to arbitrary-code pipelines is what enables 80% of the rest of the product to work.
- **Comparison must be the primary surface.** It is what users actually need. Burying it behind a "single pipeline" view would turn the product into a flashier notebook.
- **Cost-aware UI is a product decision.** Most AI tools hide cost. Showing it changes user behavior — they ship leaner pipelines and feel better about it.
- **Ground-truth authoring is the moat.** A team that invests in a ground-truth set gets compounding value from every future change. Teams that don't are stuck at intuition forever.
- **Reversibility matters.** Export-as-code is the feature that lets users *trust* the tool. Without it, the tool is a trap.
