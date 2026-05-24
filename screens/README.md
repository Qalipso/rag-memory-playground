# Screen Specs — RAG Memory Playground

---

## 1. Comparison View (primary)

**Purpose:** The first thing a user sees. Where decisions are made.

**Key elements:**
- Header: GT set, query count, pipelines being compared
- Metric grid: rows = metrics (faithfulness, answer relevance, context recall, llm-judge, cost, latency); columns = pipelines
- Verdict badges per pipeline (cheapest acceptable / best value / diminishing returns)
- Per-query drill-down table

**Primary action:** Promote a pipeline ("Make this the default for this project").

See `../ui/index.html` for the static mock.

---

## 2. Pipeline Builder

**Purpose:** Compose a declarative pipeline.

**Key elements:**
- Visual stages: Chunker → Embedder → Retriever → Reranker (optional) → Generator
- Each stage shows current selection + estimated cost contribution
- JSON view toggle for power users
- "Validate" button: runs a 3-query smoke test before save

**Primary action:** Save as new pipeline version.

---

## 3. Ground-Truth Editor

**Purpose:** Author and version ground-truth sets.

**Key elements:**
- Table of rows: question, ideal_answer, source_doc_ids, notes
- "Suggest from documents" (Phase 2+): LLM proposes Q-A pairs from uploaded docs; human accepts/edits
- Versioning controls: bump semver on save

**Primary action:** Save and run against pipelines.

---

## 4. Trace View

**Purpose:** Understand one query result deeply.

**Key elements:**
- Query + answer
- Retrieved chunks (with retrieval scores + reranker scores)
- Final context (with token count + cost)
- Generator prompt (full text, copyable)
- Per-stage latency + cost
- Annotation field (Phase 5)

**Primary action:** Annotate a failure mode.

---

## 5. Document Set

**Purpose:** Manage the underlying corpus.

**Key elements:**
- Documents list: name, type, page/word count, last reused at
- Upload zone
- "Reindex" button per chunking config (forces cache invalidation if needed)

---

## 6. Sweep Configurator (Phase 4)

**Purpose:** Configure an automated parameter sweep.

**Key elements:**
- Base pipeline
- Parameters to vary (e.g., chunker.size in [400, 600, 800, 1200, 1600])
- Estimated total cost + time
- Confirm + launch

**Primary action:** Launch sweep.

---

## 7. Pareto View (Phase 4)

**Purpose:** Visualize the trade-off curve.

**Key elements:**
- Scatter plot: x = cost, y = quality (configurable axis)
- Points = saved pipelines
- Pareto frontier highlighted
- Hover for pipeline details

**Primary action:** Pick a Pareto-frontier point and promote.

---

## 8. Export-as-Code Modal

**Purpose:** Leave with your config.

**Key elements:**
- Target framework: LangChain (Python or TS), LlamaIndex
- Generated code preview
- Download button + copy button
- Notes: "this template assumes you have OPENAI_API_KEY set"
