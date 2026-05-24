/**
 * Demo seed data. Shared between local adapters (LocalRag, LocalMemory)
 * so the debug page always shows realistic, project-specific content.
 */

export interface SeedDoc {
  id: string;
  title: string;
  source: string;
  content: string;
}

export const seedDocuments: SeedDoc[] = [
  {
    id: "doc_rag_1",
    title: "RAG Memory: Builder's Guide",
    source: "GUIDE.md",
    content:
      "RAG retrieves from a curated knowledge base. Memory retrieves from agent history. Production systems blend both via a hybrid router that picks RAG, Long Context, or Memory per query.",
  },
  {
    id: "doc_rag_2",
    title: "RAG Memory: Builder's Guide",
    source: "GUIDE.md",
    content:
      "RAG Memory adds three capabilities on top of plain RAG: write, consolidate, forget. Capture observations, store with importance, retrieve on demand, consolidate via reflection, forget via decay or invalidation.",
  },
  {
    id: "doc_arch_1",
    title: "RagMemoryEngine Architecture",
    source: "ARCHITECTURE.md",
    content:
      "Engine-first design: the core returns answer plus full process trace. Trace is the source of truth for UI. Every visualizable thing must first exist as structured trace events.",
  },
  {
    id: "doc_arch_2",
    title: "RagMemoryEngine Architecture",
    source: "ARCHITECTURE.md",
    content:
      "Pipeline: classify intent, decide route, retrieve documents, retrieve memories, score and rerank, build context, generate answer, decide memory writes, evaluate quality, return answer plus trace.",
  },
  {
    id: "doc_shadow",
    title: "Shadow project intent",
    source: "product-brief.md",
    content:
      "Shadow is intended as a personal life analytics and AI second brain. RAG Memory is the engine layer. UI is a separate concern and renders the engine trace once the engine contract is stable.",
  },
  {
    id: "doc_eval",
    title: "Evaluation harness",
    source: "GUIDE.md",
    content:
      "Evaluation covers four planes: retrieval (Recall@k, nDCG@k), generation (faithfulness, answer relevance, context relevance), memory (multi-session probes), and cost (tokens, latency).",
  },
  {
    id: "doc_failures",
    title: "Failure modes",
    source: "GUIDE.md",
    content:
      "Common failure modes: garbage retrieval, lost in the middle, hallucination despite retrieval, stale memory, reflection drift, privacy and forgetting, cost explosion.",
  },
];

export interface SeedMemory {
  id: string;
  type: "semantic" | "episodic" | "procedural" | "working";
  content: string;
}

export const seedMemories: SeedMemory[] = [
  {
    id: "mem_seed_1",
    type: "semantic",
    content: "User wants Shadow to become an AI second brain and personal operating system.",
  },
  {
    id: "mem_seed_2",
    type: "semantic",
    content: "User prefers visual, product-oriented explanations over academic theory dumps.",
  },
  {
    id: "mem_seed_3",
    type: "semantic",
    content: "User is building this RAG Memory work as a portfolio project, not throwaway code.",
  },
  {
    id: "mem_seed_4",
    type: "episodic",
    content: "User said the academic theory document felt overwhelming and paper-heavy.",
  },
  {
    id: "mem_seed_5",
    type: "episodic",
    content: "User mentioned feeling stuck around Shadow's packaging and project framing, not the idea itself.",
  },
  {
    id: "mem_seed_6",
    type: "semantic",
    content: "User wants engine-first, UI-second implementation. The engine must return a trace.",
  },
  {
    id: "mem_seed_7",
    type: "procedural",
    content: "When explaining technical material, give a plain-English layer first, then practical architecture, then research appendix.",
  },
];
