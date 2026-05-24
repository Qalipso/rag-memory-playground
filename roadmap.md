# Roadmap — RAG Memory Playground

## Phase 0 — Foundations (this repo)
**Outcome:** Product is legible on paper.

- [x] Pipeline JSON spec
- [x] Data model
- [x] System diagram
- [x] UI mock of comparison view
- [x] Mock data: pipelines, ground-truth, runs
- [x] Case study + acceptance criteria

## Phase 1 — Single-pipeline runner (4 weeks)
**Outcome:** A user can build a pipeline, upload docs, run a query, see the answer + trace.

- Workspace + auth
- Document upload (PDF, MD, HTML)
- Pipeline builder UI with declarative JSON spec
- Python runner executes: chunk → embed → retrieve → generate (no reranker yet)
- Per-query trace view: chunks, context, prompt, output
- Cost + latency per query

**Exit criteria:** Solo user can run 20 queries through a saved pipeline and see all results in <30 minutes setup.

## Phase 2 — Side-by-side + ground truth (4 weeks)
**Outcome:** Users can make defensible decisions.

- Side-by-side comparison runner (2–4 pipelines on the same queries)
- Ground-truth set authoring + versioning
- Built-in RAG metrics: faithfulness, answer relevance, context precision, context recall
- Comparison permalinks

**Exit criteria:** A user makes a documented pipeline decision based on a side-by-side comparison in the tool.

## Phase 3 — LLM-judge + export (3 weeks)
**Outcome:** Users escape the tool when they need to.

- LLM-as-judge scorer (configurable judge model + rubric)
- Reranker stage in pipelines (Cohere, BGE)
- Export-as-code: LangChain template generation
- Trace view: per-stage cost + latency breakdown

**Exit criteria:** ≥ 60% of paying users export at least one config to code.

## Phase 4 — Auto-search (4 weeks)
**Outcome:** Users find better configs without manually sweeping.

- Sweep job: vary one or more parameters across configurable grid
- Pareto front view (quality × cost × latency)
- Suggested next-best config based on current Pareto front

**Exit criteria:** Sweep results lead to a saved config that beats user's previous best on at least one axis in ≥ 70% of sweeps.

## Phase 5 — Failure-mode tagging (3 weeks)
**Outcome:** Users can describe what is failing and not just measure it.

- Per-query annotation UI in the trace view
- Cluster annotations via embeddings (similar to AI Eval Wiki)
- Failure-mode dashboard per pipeline version

## Phase 6 — Production trace ingestion (4 weeks)
**Outcome:** Reality-grounded experimentation.

- Endpoint to ingest production query traces (queries, retrieved docs, outputs)
- Replay prod queries through new candidate pipelines offline
- Compare prod vs candidate on retrieval and quality

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Users want arbitrary Python steps | Hold the line; offer export-as-code as the escape hatch |
| LLM-judge cost spikes | Per-workspace monthly cap + judge sampling (judge a subsample, not all rows) |
| Ground-truth creation is hard | Provide question-generation helpers from documents in Phase 2 |
| Vector DB lock-in concerns | pgvector first; pluggable retriever in Phase 3 |
