import type { MemoryRecord } from "../core/types.js";

/**
 * Deterministic in-memory memory store seeded for the demo user.
 * Replace with real Postgres + pgvector backed store in Phase 2.
 */
const NOW = new Date();

function daysAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export const fakeMemories: MemoryRecord[] = [
  {
    id: "mem_001",
    userId: "demo-user",
    type: "semantic",
    content:
      "User wants Shadow to become an AI second brain and personal operating system.",
    importance: 0.9,
    tags: ["goal", "shadow", "second-brain"],
    source: "chat",
    createdAt: daysAgo(30),
    lastAccessedAt: daysAgo(2),
    status: "active",
    metadata: { confidence: 0.9 },
  },
  {
    id: "mem_002",
    userId: "demo-user",
    type: "semantic",
    content:
      "User prefers visual, product-oriented explanations over academic theory dumps.",
    importance: 0.8,
    tags: ["preference", "communication", "visual"],
    source: "chat",
    createdAt: daysAgo(20),
    lastAccessedAt: daysAgo(1),
    status: "active",
    metadata: { confidence: 0.85 },
  },
  {
    id: "mem_003",
    userId: "demo-user",
    type: "episodic",
    content:
      "User said the academic theory document felt overwhelming and paper-heavy.",
    importance: 0.7,
    tags: ["pattern", "overwhelm", "theory"],
    source: "chat",
    createdAt: daysAgo(15),
    lastAccessedAt: daysAgo(5),
    status: "active",
    metadata: { confidence: 0.8 },
  },
  {
    id: "mem_004",
    userId: "demo-user",
    type: "semantic",
    content:
      "User wants engine-first, UI-second implementation. The engine must return a trace.",
    importance: 0.95,
    tags: ["principle", "architecture", "engine-first"],
    source: "chat",
    createdAt: daysAgo(10),
    lastAccessedAt: daysAgo(0),
    status: "active",
    metadata: { confidence: 0.95 },
  },
  {
    id: "mem_005",
    userId: "demo-user",
    type: "semantic",
    content: "User wants portfolio-quality architecture, not throwaway prototype code.",
    importance: 0.85,
    tags: ["preference", "quality", "portfolio"],
    source: "chat",
    createdAt: daysAgo(12),
    lastAccessedAt: daysAgo(3),
    status: "active",
    metadata: { confidence: 0.9 },
  },
  {
    id: "mem_006",
    userId: "demo-user",
    type: "episodic",
    content:
      "User mentioned feeling stuck around Shadow's packaging and project framing, not the idea itself.",
    importance: 0.75,
    tags: ["pattern", "stuck", "packaging"],
    source: "chat",
    createdAt: daysAgo(8),
    lastAccessedAt: daysAgo(0),
    status: "active",
    metadata: { confidence: 0.78 },
  },
  {
    id: "mem_007",
    userId: "demo-user",
    type: "procedural",
    content:
      "When explaining new technical material, give a plain-English level first, then practical architecture, then research appendix.",
    importance: 0.7,
    tags: ["workflow", "explanation", "docs"],
    source: "reflection",
    createdAt: daysAgo(5),
    lastAccessedAt: daysAgo(1),
    status: "active",
    metadata: { confidence: 0.82 },
  },
  {
    id: "mem_008",
    userId: "demo-user",
    type: "episodic",
    content:
      "User asked for a hybrid router that decides between RAG, Memory, and Long Context at runtime.",
    importance: 0.8,
    tags: ["routing", "hybrid"],
    source: "chat",
    createdAt: daysAgo(3),
    lastAccessedAt: daysAgo(0),
    status: "active",
    metadata: { confidence: 0.88 },
  },
  {
    id: "mem_009",
    userId: "demo-user",
    type: "semantic",
    content:
      "Project uses Postgres + pgvector for the real implementation, deterministic simulator first.",
    importance: 0.6,
    tags: ["stack", "postgres", "pgvector"],
    source: "manual",
    createdAt: daysAgo(2),
    lastAccessedAt: daysAgo(0),
    status: "active",
    metadata: { confidence: 0.9 },
  },
  {
    id: "mem_010",
    userId: "demo-user",
    type: "episodic",
    content:
      "Stale: previously assumed UI-first build. Invalidated by engine-first directive.",
    importance: 0.3,
    tags: ["invalidated"],
    source: "chat",
    createdAt: daysAgo(40),
    lastAccessedAt: daysAgo(40),
    status: "invalidated",
    metadata: {
      confidence: 0.4,
      reason: "Superseded by mem_004",
      invalidatesMemoryId: undefined,
    },
  },
];
