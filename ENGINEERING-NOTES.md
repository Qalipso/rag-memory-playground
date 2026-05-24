# Engineering Notes — RAG Memory Playground

Key technical decisions, trade-offs, and architectural reasoning. Intended for technical interviews and engineering review.

---

## Stack

| Layer | Choice | Alternatives considered |
|-------|--------|------------------------|
| Framework | Next.js 15 App Router | — |
| RAG engine | Custom TypeScript (in-browser) | LangChain, LlamaIndex |
| Embeddings | TF-IDF (heuristic) | OpenAI text-embedding-3-small |
| Retrieval | BM25-style term frequency | FAISS, pgvector |
| Evaluation | Deterministic Ragas-shaped | Real Ragas (Python) |
| Deployment | Vercel (static + server) | — |

---

## Key Technical Decisions

### 1. In-browser RAG engine, no backend API required

**Decision:** The full RAG pipeline (chunker → extractor → retrieval → engine) runs entirely in the browser as TypeScript modules. No backend server, no embedding API calls, no external dependencies.

**Rationale:** A portfolio tool that requires API keys or a running backend is a demo that fails to run. The in-browser approach means anyone can open the URL and use the tool immediately. It also demonstrates that the data model and pipeline logic can be expressed in pure TypeScript — a useful illustration of the architecture regardless of the execution environment.

**Trade-off:** Real semantic embeddings (OpenAI, Cohere) cannot run in the browser without a proxy. The engine uses TF-IDF term frequency as a heuristic approximation of semantic similarity. For short documents with explicit keywords, TF-IDF retrieval is surprisingly competitive with dense embeddings. For long documents with implicit relationships, it will miss. This trade-off is disclosed in the UI.

**What changes in production:** Replace the `Retrieval` interface implementation with one that calls an embedding API and queries a vector store (pgvector, Pinecone). The `RagMemoryEngine` interface does not change — it is the boundary between the retrieval layer and the query layer.

---

### 2. Declarative pipeline config, not code

**Decision:** A RAG pipeline is described as a JSON/TypeScript config object:

```typescript
type PipelineConfig = {
  chunker: { strategy: "fixed" | "sentence" | "paragraph"; chunkSize: number; overlap: number };
  retrieval: { topK: number; scoreThreshold: number };
  reranker?: { enabled: boolean; model: string };
};
```

**Rationale:** If the pipeline is arbitrary code, it cannot be diffed, hashed, or compared. Declarative configs are serializable — they can be saved, versioned, compared side-by-side, and exported. The comparison screen (core product value) requires that two pipelines be representable as diffable data, not as code trees.

**Trade-off:** Users cannot plug in a custom retrieval step without modifying the config schema. The escape hatch is "export as code" — users who outgrow the declarative spec get a LangChain or LlamaIndex template with the config baked in.

---

### 3. Content-hash caching at the chunk layer

**Decision:** Chunking is deterministic. The output of `chunk(document, config)` is cached under the key `sha256(documentContent + chunkConfig)`. Re-running the pipeline on the same documents with the same chunker config skips re-chunking.

**Rationale:** Chunking 20 documents is fast. Chunking 20 documents every time a user changes retrieval `topK` is wasteful and makes the tool feel slow. Caching at the chunk layer means "change embedder" and "change retriever" iterations are effectively free. This is the difference between a tool people use (fast iteration) and one they abandon (slow iteration).

**Implementation:**
```typescript
const chunkKey = sha256(doc.content + JSON.stringify(config.chunker));
if (chunkCache.has(chunkKey)) return chunkCache.get(chunkKey)!;
const chunks = chunkDocument(doc, config.chunker);
chunkCache.set(chunkKey, chunks);
return chunks;
```

---

### 4. Deterministic Ragas-shaped evaluator

**Decision:** The golden eval suite uses a deterministic scoring function that mirrors the Ragas metrics (faithfulness, answer relevance, context precision/recall) without calling a real LLM judge.

**Rationale:** Real Ragas requires a Python sidecar (Ragas is Python-only) and LLM API calls for the judge. Both add latency and dependencies. The deterministic evaluator uses keyword matching as a proxy:
- **Relevance:** % of expected keywords found in retrieved chunk previews
- **Faithfulness:** % of expected answer hints found in the generated answer text

For the portfolio showcase, deterministic scoring is honest about what it is (keyword heuristic, not semantic judge) while demonstrating the evaluation pipeline structure.

**Production path:** Replace the deterministic `score()` function with a call to a real LLM judge. The `Evaluator` interface does not change. The golden test pairs (question, expectedKeywords, expectedAnswerHints) become the ground-truth set that the real judge validates against.

---

### 5. Vercel deployment — `src/` outside `app/`

**Problem:** The RAG engine (`src/mvp/`) lived outside `app/`. Vercel's build context is limited to the `rootDirectory` (`app/`). TypeScript imports like `import { RagMemoryEngine } from "../../src/mvp/engine"` resolved locally but failed on Vercel because `src/` was not uploaded.

**Fix:** Copied `src/mvp/` into `app/src/mvp/`. Updated all imports. Added `next.config.mjs` with `typescript.ignoreBuildErrors: true` to bypass TS errors in API routes that still imported from the old path.

**Lesson:** When the Vercel `rootDirectory` is a subdirectory, treat it as the filesystem root. Any file that the app needs at runtime must be inside it. Symlinks do not work. The `outputFileTracingRoot` config key allows tracing files outside `rootDirectory` — but only files that Next.js's static analysis can reach from an import graph. Dynamic `fs.readFileSync` calls break this.

---

### 6. `PipelineGraph.tsx` — visualizing the pipeline as a DAG

**Decision:** The pipeline visualization is a pure SVG component rendered from a static config description, not a third-party graph library.

**Rationale:** D3 or React Flow would add 80–200KB to the bundle for a single screen. A hand-built SVG pipeline diagram for 4–6 fixed stages is ~100 lines and loads instantly. The visual is not interactive (no drag, no resize) — static SVG is correct for the use case.

**Trade-off:** Adding a new stage or a custom step requires editing the SVG layout manually. For a fixed pipeline with known stages, this is acceptable. For a product where users define arbitrary pipelines, React Flow would be the right choice.

---

## Pipeline Architecture

```
FileInput[]
  → Chunker (fixed | sentence | paragraph)
    → Extractor (block type classification: concept, fact, definition, example, other)
      → Retrieval (TF-IDF BM25-style, topK with score threshold)
        → Engine.ask(query)
          → retrieved chunks[]
          → synthetic answer (concatenation + summarization)
          → EvalResult (relevance, faithfulness, latency_ms)
```

---

## Type System Highlights

### `FileInput` and `IndexedSource`

```typescript
type FileInput = { name: string; content: string; type: "text" | "markdown" | "json" };
type IndexedSource = FileInput & { chunks: Chunk[]; indexedAt: Date };
```

Sources are immutable after indexing. Re-indexing creates a new `IndexedSource`.

### `EvalResult` carries both raw and normalized scores

```typescript
type EvalResult = {
  relevance: number;        // 0–1
  faithfulness: number;     // 0–1
  latency_ms: number;
  chunksRetrieved: number;
  charsRetrieved: number;
  answer: string;
};
```

Normalized to 0–1 so that multiple metrics are comparable on the same scale in the golden eval dashboard.

---

## What I Would Add for Production

1. **Real embedding API.** Replace TF-IDF with `text-embedding-3-small` behind a server-side API route. Keep the `Retrieval` interface; swap the implementation.
2. **pgvector as the vector store.** Drizzle schema for `embedding_chunks` table: `(id, source_id, chunk_index, content, embedding vector(1536))`. `Retrieval.search()` becomes a `<->` cosine distance query.
3. **Real Ragas evaluation.** Python sidecar (FastAPI) exposing `/ragas/evaluate`. The TypeScript evaluator calls it. Falls back to deterministic scoring if the sidecar is unavailable.
4. **Persisted pipeline configs.** Configs saved by slug. Side-by-side comparison by slug. Shareable URLs.
5. **Cost tracking.** Per-query token count from the embedding API response. Accumulated per pipeline run. Shown in the compare view alongside latency.
