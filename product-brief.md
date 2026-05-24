# Product Brief — RAG Memory Playground

## Vision

Make RAG decisions defensible. Replace gut-feel pipeline tuning with side-by-side, measured, cost-aware experimentation.

## Problem Statement

Every team building a RAG feature hits the same wall:

> We changed the chunk size and the embedder. Some answers got better. Some got worse. We are not sure which.

There are three structural reasons:

1. **No experimentation substrate.** Teams iterate by editing code, re-running a notebook, and reading outputs. Two-config comparison requires opening two browser tabs and squinting.
2. **No ground truth.** Most teams have a handful of test queries in their head. They are not a stable basis for "this change helped."
3. **Cost is invisible until the bill arrives.** A pipeline with a reranker pass + GPT-4o generation can be 20× the cost of a leaner one. Teams discover this in production, not in development.

The Playground gives a small team in a week what it would take them three months to build internally.

## Personas

### Sara — Applied AI Engineer
- Owns the docs Q&A feature at a B2B SaaS company
- Iterates on the pipeline 5–10 times a day
- Pain: she runs configs in a notebook, screenshots outputs, pastes into Slack to discuss with her PM
- Win: a permalinked side-by-side that her PM can open without her in the loop

### Idris — AI PM
- Owns the AI roadmap for a developer-facing product
- Needs to decide: bigger embedder vs reranker vs better chunking, given a fixed budget
- Pain: cannot defend his decisions to engineering or finance without numbers
- Win: a Pareto chart showing the trade-off curve across saved configs

### Lin — Founder
- Building a vertical AI product solo
- Has no in-house eval expertise
- Pain: cannot tell which off-the-shelf RAG approach to start from
- Win: a guided "playbook" mode that picks reasonable defaults and shows him what better looks like

## Jobs to Be Done

| When… | I want to… | So I can… |
|-------|-----------|-----------|
| I tweak the chunker | run the same 20 queries against old vs new | know if I helped or hurt |
| I'm deciding between models | see cost + quality together on one chart | pick the right point on the curve |
| I need to defend a decision | share a permalinked comparison | end the argument |
| I want to ship the winning config | export it as code | not be locked in |
| I'm onboarding a new engineer | show them what we tried and why | save them a week of guessing |

## Differentiation

| Tool | Strength | Where the Playground differs |
|------|----------|------------------------------|
| LangChain / LlamaIndex | Components, glue code | They are libraries; we are an evaluation + comparison harness on top |
| Ragas / TruLens | Eval metrics | We are eval-first *plus* a pipeline runner and side-by-side comparator |
| Braintrust | Strong general eval platform | We are specifically opinionated for RAG; pipeline structure is first-class |
| Pinecone / Weaviate consoles | Vector DB inspection | We span the full pipeline, not just the retriever |
| Jupyter notebooks | Maximum flexibility | We are write-once-and-compare, not write-and-forget |

## Success Metrics

| Metric | Target (90 days post-launch) |
|--------|------------------------------|
| Pipeline configs created per user per week | ≥ 15 |
| Side-by-side comparisons run per user per week | ≥ 8 |
| Ground-truth sets per active workspace | ≥ 2 |
| Users who "exported as code" at least once | ≥ 60% |
| Self-reported decision confidence (survey) | ≥ 8/10 |

## Non-Goals

- **Not** a vector DB. Integrates with pgvector, Pinecone, Weaviate, Qdrant.
- **Not** a model host. Uses third-party APIs via LiteLLM.
- **Not** a production-serving runtime. Export-as-code is the path to production.
- **Not** an annotation platform.

## Risks & Open Questions

- **Pipeline declarative-vs-code tension.** Some users will want arbitrary Python steps. Resist this in v1; provide an "escape hatch" only via export-as-code.
- **LLM-as-judge cost can dominate.** Need budget guardrails per workspace.
- **Ground-truth creation is the real moat.** A user with no ground truth still gets value but a fraction of the potential. The product should make ground-truth authoring the easiest possible path.
