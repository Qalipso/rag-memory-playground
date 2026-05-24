# Acceptance Criteria — RAG Memory Playground

Gherkin-style. Phase tags map to `roadmap.md`.

---

## Feature: Document Upload [Phase 1]

```gherkin
Scenario: Upload a PDF and have it ingested
  Given I am in workspace "acme-docs"
  When I upload "product-manual.pdf" (12MB)
  Then a Document record is created
  And the file is stored in the object store
  And no chunking happens yet (lazy per pipeline config)

Scenario: Reject unsupported file types
  When I upload "video.mp4"
  Then upload fails with "unsupported type: only pdf, md, html, txt"
```

---

## Feature: Pipeline Builder [Phase 1]

```gherkin
Scenario: Save a valid pipeline
  Given I open the Pipeline Builder
  When I set:
    chunker: recursive_character size=800 overlap=120
    embedder: openai text-embedding-3-large
    retriever: k=12
    generator: openai gpt-4o temperature=0.1 prompt=default-qa-v3
  And click Save
  Then a Pipeline version 1.0.0 is created with a content hash
  And the pipeline appears in my workspace pipelines list

Scenario: Reject invalid pipeline
  Given my pipeline has no embedder
  When I click Save
  Then save fails with "embedder is required"

Scenario: Same content → same hash, no new version
  Given pipeline "v1" version 1.0.0 with content hash "abc"
  When I save a pipeline with identical content
  Then no new version is created
  And the UI shows "no change — pointing to existing version 1.0.0"
```

---

## Feature: Single-pipeline Run [Phase 1]

```gherkin
Scenario: Run a free-form query
  Given I have pipeline "v1" published
  When I run query "How do I reset my password?" against pipeline "v1"
  Then I see the answer
  And the trace shows: retrieved chunks (with scores), final context, generator prompt, output
  And total cost and latency are displayed

Scenario: Caching of chunking + embedding
  Given pipeline "v1" was run yesterday on document "manual.pdf"
  When I run pipeline "v1" again on the same document
  Then chunking and embedding stages are served from cache
  And cost for those stages is reported as $0.00
```

---

## Feature: Side-by-side Comparison [Phase 2]

```gherkin
Scenario: Compare 3 pipelines on the same query
  Given pipelines "v1", "v2", "v3" exist
  When I run "How do I reset my password?" against all three in comparison mode
  Then I see 3 columns: each shows answer, cost, latency, retrieved-chunk count
  And the URL preserves the comparison config so I can share it

Scenario: Cost-quality Pareto highlight
  Given a comparison shows pipelines A, B, C
  And A: quality=0.78 cost=$0.02
      B: quality=0.85 cost=$0.04
      C: quality=0.86 cost=$0.12
  Then A is highlighted as "cheapest acceptable"
  And B is highlighted as "best value"
  And C is shown but flagged as "diminishing returns"
```

---

## Feature: Ground-Truth Sets [Phase 2]

```gherkin
Scenario: Create a ground-truth row
  Given I am editing GT set "support-qa"
  When I add a row:
    question: "Can I cancel my subscription mid-month?"
    ideal_answer: "Yes — cancellation is effective immediately and prorated."
    source_doc_ids: ["doc_42"]
  Then the row is saved
  And GT set version 1.1.0 is created (semver bump from 1.0.0)

Scenario: Run pipeline against GT set
  Given GT set "support-qa" version 1.1.0 with 25 rows
  When I run pipeline "v2" against this GT set
  Then 25 RunResults are created
  And each is scored on faithfulness, answer relevance, context precision, context recall
  And the overall metrics roll up to the Run
```

---

## Feature: LLM-as-Judge [Phase 3]

```gherkin
Scenario: Configurable judge
  Given I am setting up an eval
  When I select judge model = claude-opus-4-7 with rubric "factual_correctness"
  Then runs produce a `llm_judge` score per query alongside built-in metrics

Scenario: Judge cost guardrail
  Given my workspace monthly judge budget is $20
  And $19.50 has been spent this month
  When I attempt to run a 50-query eval that would cost $5
  Then the run is blocked
  And the UI shows "judge budget exhausted — raise cap or wait until next month"
```

---

## Feature: Export as Code [Phase 3]

```gherkin
Scenario: Export to LangChain
  Given I have a saved Pipeline version
  When I click "Export as code → LangChain Python"
  Then a downloadable .py file is generated
  And it contains a runnable LangChain LCEL pipeline equivalent to the saved config
  And re-running it produces results within 0.5pp of the in-tool eval scores
```

---

## Feature: Auto-Search Sweep [Phase 4]

```gherkin
Scenario: One-axis sweep over chunk size
  Given a pipeline "v2"
  When I configure a sweep over chunker.size in {400, 600, 800, 1200, 1600}
  And run against GT set "support-qa"
  Then 5 RunResults are produced
  And the UI plots quality vs cost across the 5 points
  And the Pareto front is highlighted

Scenario: Bounded sweep
  Given a sweep estimate exceeds $30
  When I attempt to launch it
  Then I am warned and must confirm before proceeding
```

---

## Non-Functional Acceptance

- **Determinism:** Same pipeline + same query + same model snapshot must produce the same retrieval result (allowing for non-determinism in the generator only).
- **Performance:** Side-by-side comparison view loads in <800ms p95 with 4 pipelines × 50 queries.
- **Observability:** Every run has an OpenTelemetry trace; per-stage timing is always recorded.
- **Cost ceiling:** A sweep cannot exceed the workspace's daily eval budget; soft cap warning at 75%.
