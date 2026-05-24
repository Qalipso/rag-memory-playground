import { NextRequest, NextResponse } from "next/server";

// Stub memories for portfolio demo — no backend required.
const STUB_MEMORIES = [
  { id: "mem-1", type: "semantic", content: "RAG pipeline chunks docs into 800-char segments with 80-char overlap", score: 0.91, reason: "Extracted from architecture.md" },
  { id: "mem-2", type: "semantic", content: "Block types: Feature, Decision, Risk, Todo, Concept", score: 0.88, reason: "Extracted from extractor.ts" },
  { id: "mem-3", type: "episodic", content: "User loaded architecture.md and asked about storage decisions", score: 0.82, reason: "Session event" },
  { id: "mem-4", type: "episodic", content: "User ran Golden Eval Suite — 4/5 pairs passed", score: 0.79, reason: "Eval session event" },
  { id: "mem-5", type: "procedural", content: "To retrieve: tokenize → expand stems → score chunks by TF + keyword boost", score: 0.87, reason: "Inferred from retrieval.ts" },
  { id: "mem-6", type: "procedural", content: "Confidence levels: low (<1.0 top score), medium, high (≥3.0 or ≥4 hits)", score: 0.83, reason: "Inferred from retrieval.ts" },
  { id: "mem-7", type: "working", content: "Active question: What file types can be uploaded?", score: 0.95, reason: "Current session context" },
  { id: "mem-8", type: "working", content: "Last retrieved sources: README.md, architecture.md", score: 0.93, reason: "Current session context" },
  { id: "mem-9", type: "semantic", content: "Storage is fully in-browser — no backend, no server DB", score: 0.9, reason: "Extracted from rag-settings.md" },
  { id: "mem-10", type: "semantic", content: "PromptOps stores versioned prompt assets linked to memory blocks", score: 0.85, reason: "Extracted from promptops-notes.md" },
];

export function GET(req: NextRequest) {
  const userId = new URL(req.url).searchParams.get("userId") ?? "demo-user";
  return NextResponse.json({
    userId,
    provider: {
      name: "stub-store",
      framework: "in-memory",
      mode: "stub",
      reason: "Portfolio demo — no backend required",
    },
    memories: STUB_MEMORIES,
    count: STUB_MEMORIES.length,
  });
}

export function POST() {
  return NextResponse.json({ error: "Write not available in portfolio demo" }, { status: 501 });
}
