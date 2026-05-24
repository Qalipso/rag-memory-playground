import type { DocumentChunk } from "../core/types.js";

/**
 * Deterministic in-memory document corpus for Phase 1.
 * Replace with real ingestion + vector store in Phase 2.
 */
export const fakeDocuments: DocumentChunk[] = [
  {
    id: "chunk_rag_001",
    documentId: "doc_guide",
    title: "RAG Memory: Builder's Guide",
    chunkIndex: 0,
    content:
      "RAG retrieves from a curated knowledge base. Memory retrieves from agent history. " +
      "Production systems typically combine both via a hybrid router that picks RAG, " +
      "long context, or memory per query.",
    metadata: { section: "Level 1", source: "GUIDE.md" },
  },
  {
    id: "chunk_rag_002",
    documentId: "doc_guide",
    title: "RAG Memory: Builder's Guide",
    chunkIndex: 1,
    content:
      "RAG Memory adds three capabilities on top of plain RAG: write, consolidate, forget. " +
      "Capture observations, store with importance and timestamps, retrieve on demand, " +
      "consolidate via reflection, and forget via decay or invalidation.",
    metadata: { section: "Memory lifecycle", source: "GUIDE.md" },
  },
  {
    id: "chunk_rag_003",
    documentId: "doc_guide",
    title: "RAG Memory: Builder's Guide",
    chunkIndex: 2,
    content:
      "Memory types map to cognitive taxonomy: episodic (what happened), semantic " +
      "(what is true), procedural (how to do X), working (held in context now). " +
      "Do not mix types in one store — episodic is high volume, semantic is high value.",
    metadata: { section: "Memory taxonomy", source: "GUIDE.md" },
  },
  {
    id: "chunk_rag_004",
    documentId: "doc_arch",
    title: "RagMemoryEngine Architecture",
    chunkIndex: 0,
    content:
      "Engine-first design: the core returns answer plus full process trace. " +
      "Trace is the source of truth for UI. Anything the UI wants to show must " +
      "first exist as structured trace events emitted by the engine.",
    metadata: { section: "Core principle", source: "ARCHITECTURE.md" },
  },
  {
    id: "chunk_rag_005",
    documentId: "doc_arch",
    title: "RagMemoryEngine Architecture",
    chunkIndex: 1,
    content:
      "Pipeline: classify intent, decide route, retrieve documents, retrieve memories, " +
      "score and rerank, build context, generate answer, decide memory writes, " +
      "evaluate quality, return answer plus trace.",
    metadata: { section: "Pipeline", source: "ARCHITECTURE.md" },
  },
  {
    id: "chunk_rag_006",
    documentId: "doc_arch",
    title: "RagMemoryEngine Architecture",
    chunkIndex: 2,
    content:
      "Three-factor memory scoring blends relevance, recency, and importance. " +
      "Recency uses exponential decay since last access. Importance is per-record. " +
      "Relevance is similarity between query and memory.",
    metadata: { section: "Scoring", source: "ARCHITECTURE.md" },
  },
  {
    id: "chunk_rag_007",
    documentId: "doc_eval",
    title: "Evaluation harness",
    chunkIndex: 0,
    content:
      "Evaluation covers four planes: retrieval (Recall@k, nDCG@k), generation " +
      "(faithfulness, answer relevance, context relevance), memory (multi-session " +
      "probes), and cost (tokens per query, p50 and p95 latency).",
    metadata: { section: "Evaluation", source: "GUIDE.md" },
  },
  {
    id: "chunk_rag_008",
    documentId: "doc_failures",
    title: "Failure modes",
    chunkIndex: 0,
    content:
      "Common failure modes: garbage retrieval, lost in the middle, hallucination " +
      "despite retrieval, stale memory, reflection drift, privacy and forgetting, " +
      "cost explosion. Each maps to a concrete fix in the architecture.",
    metadata: { section: "Failure modes", source: "GUIDE.md" },
  },
  {
    id: "chunk_rag_009",
    documentId: "doc_shadow",
    title: "Shadow project intent",
    chunkIndex: 0,
    content:
      "Shadow is intended as a personal life analytics and AI second brain. " +
      "RAG Memory is the engine layer. UI is a separate concern and renders the " +
      "engine trace once the engine contract is stable.",
    metadata: { section: "Project intent", source: "product-brief.md" },
  },
  {
    id: "chunk_rag_010",
    documentId: "doc_visual",
    title: "Visual learning preference",
    chunkIndex: 0,
    content:
      "Product-oriented visual explanations beat paper-heavy academic theory for " +
      "early product makers. Three-level documentation (plain English, practical " +
      "architecture, research appendix) keeps the material approachable without " +
      "losing rigor.",
    metadata: { section: "Docs strategy", source: "GUIDE.md" },
  },
];
