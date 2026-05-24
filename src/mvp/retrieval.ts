import type { AskResult, BlockType, MemoryBlock, MemoryChunk, RetrievalTrace, RetrievedChunk } from "./types";

const STOPWORDS = new Set([
  "what","is","are","this","that","the","a","an","and","or","of","in","on","to","for","with",
  "do","does","did","be","been","being","i","you","we","they","it","its","my","your","our",
  "how","why","where","when","which","who","whom","whose","can","could","should","would","will",
  "from","by","at","as","if","so","not","no","yes","than","then","there","here",
]);

const STEMS: Record<string, string[]> = {
  risk: ["risk", "risks", "issue", "issues", "problem", "problems", "blocker", "gotcha"],
  feature: ["feature", "features", "functionality", "supports", "allows"],
  decision: ["decision", "decisions", "decided", "rationale", "chose"],
  todo: ["todo", "todos", "fix", "missing"],
  doc: ["doc", "docs", "documentation"],
  build: ["build", "built", "implement", "implementation"],
  memory: ["memory", "memories", "remember", "recall"],
  setting: ["setting", "settings", "config", "configuration"],
  overview: ["about", "overview", "summary", "purpose", "describe", "described", "project"],
};

function expandTerms(terms: string[]): string[] {
  const expanded = new Set<string>(terms);
  for (const t of terms) {
    for (const stems of Object.values(STEMS)) {
      if (stems.includes(t)) for (const s of stems) expanded.add(s);
    }
  }
  return Array.from(expanded);
}

export function tokenizeQuery(question: string): string[] {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return expandTerms(Array.from(new Set(tokens)));
}

function scoreChunk(chunk: MemoryChunk, terms: string[]): { score: number; matched: string[] } {
  const text = chunk.text.toLowerCase();
  const keywords = new Set(chunk.keywords);
  let score = 0;
  const matched: string[] = [];
  for (const t of terms) {
    const occurrences = countOccurrences(text, t);
    if (occurrences > 0) {
      // base + log-scaled term frequency
      score += 1 + Math.log2(1 + occurrences);
      if (keywords.has(t)) score += 0.6;
      matched.push(t);
    }
  }
  // Normalize against chunk length to avoid huge chunks dominating
  const lengthPenalty = Math.max(1, chunk.charCount / 800);
  return { score: score / Math.sqrt(lengthPenalty), matched };
}

function countOccurrences(text: string, term: string): number {
  if (!term) return 0;
  let count = 0;
  let idx = text.indexOf(term);
  while (idx !== -1) {
    count += 1;
    idx = text.indexOf(term, idx + term.length);
  }
  return count;
}

function preview(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  for (const t of terms) {
    const idx = lower.indexOf(t);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(text.length, idx + 140);
      const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
      return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`;
    }
  }
  return text.slice(0, 160).replace(/\s+/g, " ").trim();
}

function classifyConfidence(topScore: number, hits: number): "low" | "medium" | "high" {
  if (hits === 0 || topScore < 1) return "low";
  if (topScore >= 3 || hits >= 4) return "high";
  return "medium";
}

function blockMatches(block: MemoryBlock, terms: string[]): { score: number } {
  const haystack = `${block.title} ${block.summary}`.toLowerCase();
  let score = 0;
  for (const t of terms) if (haystack.includes(t)) score += 1;
  const typeBoost: Partial<Record<BlockType, string[]>> = {
    Risk: ["risk", "issue", "problem", "blocker", "gotcha"],
    Todo: ["todo", "next", "fix", "missing", "later"],
    Feature: ["feature", "supports", "allows"],
    Decision: ["decision", "decided", "rationale"],
  };
  for (const [type, signals] of Object.entries(typeBoost) as Array<[BlockType, string[]]>) {
    if (block.type === type && terms.some((t) => signals.includes(t))) score += 1.5;
  }
  return { score };
}

interface RetrievalArgs {
  question: string;
  chunks: MemoryChunk[];
  blocks: MemoryBlock[];
  sourcesCount: number;
  topK?: number;
}

export function retrieve(args: RetrievalArgs): AskResult {
  const { question, chunks, blocks, sourcesCount, topK = 5 } = args;
  const terms = tokenizeQuery(question);

  const scoredChunks = chunks
    .map((c) => {
      const { score, matched } = scoreChunk(c, terms);
      return { chunk: c, score, matched };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const retrieved: RetrievedChunk[] = scoredChunks.map((s) => ({
    chunkId: s.chunk.id,
    sourceName: s.chunk.sourceName,
    preview: preview(s.chunk.text, s.matched),
    score: round2(s.score),
    matchedTerms: s.matched,
  }));

  const scoredBlocks = blocks
    .map((b) => ({ block: b, score: blockMatches(b, terms).score }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const finalSources = unique(retrieved.map((r) => r.sourceName));
  const topScore = scoredChunks[0]?.score ?? 0;
  const confidence = classifyConfidence(topScore, retrieved.length);

  const warnings: string[] = [];
  if (retrieved.length === 0) warnings.push("No relevant chunks found. Answer is grounded in nothing.");
  if (confidence === "low" && retrieved.length > 0) warnings.push("Low confidence — query weakly matched the corpus.");
  if (terms.length === 0) warnings.push("Query has no usable terms after stop-word filtering.");

  const answer = composeAnswer({
    question,
    terms,
    retrieved,
    retrievedFull: scoredChunks.map((s) => s.chunk),
    blocks: scoredBlocks.map((s) => s.block),
    confidence,
  });

  const trace: RetrievalTrace = {
    question,
    queryTerms: terms,
    searchedSourcesCount: sourcesCount,
    searchedChunksCount: chunks.length,
    retrievedChunks: retrieved,
    matchedBlocks: scoredBlocks.map((s) => ({
      id: s.block.id,
      type: s.block.type,
      title: s.block.title,
      score: round2(s.score),
    })),
    finalSources,
    confidence,
    warnings,
  };

  return {
    answer,
    sources: finalSources,
    chunks: retrieved,
    blocks: scoredBlocks.map((s) => s.block),
    confidence,
    trace,
  };
}

interface ComposeArgs {
  question: string;
  terms: string[];
  retrieved: RetrievedChunk[];
  retrievedFull: MemoryChunk[];
  blocks: MemoryBlock[];
  confidence: "low" | "medium" | "high";
}

type Intent = BlockType | "Overview" | "Generic";

/**
 * Extractive answer composition.
 *
 * Detects intent (Risk/Todo/Feature/Decision/Overview/Generic), picks the
 * matching block type, and writes a short prose answer using each block's
 * title verbatim. Never fabricates content.
 */
function composeAnswer(args: ComposeArgs): string {
  const { question, terms, retrieved, retrievedFull, blocks, confidence } = args;
  void question;

  if (retrieved.length === 0 && blocks.length === 0) {
    return "Not enough information in the indexed sources to answer this question. Try loading more files or rephrasing.";
  }

  const intent = detectIntent(terms);

  if (intent === "Overview") return composeOverview(blocks, retrieved, retrievedFull, confidence);
  if (intent !== "Generic") return composeTyped(intent, blocks, retrieved, confidence);
  return composeGeneric(blocks, retrieved, confidence);
}

function composeOverview(
  blocks: MemoryBlock[],
  retrieved: RetrievedChunk[],
  retrievedFull: MemoryChunk[],
  confidence: "low" | "medium" | "high",
): string {
  const lines: string[] = [];
  const features = pickByType(blocks, "Feature", 4);
  const decisions = pickByType(blocks, "Decision", 3);
  const concepts = pickByType(blocks, "Concept", 5);
  const sources = unique(retrieved.map((r) => r.sourceName));

  // Lead with project description from README or first doc chunk
  const lead = extractLead(retrievedFull);
  if (lead) {
    lines.push(lead);
    lines.push("");
  }

  if (sources.length > 0) {
    lines.push(`Indexed sources (${sources.length}): ${sources.join(", ")}.`);
  }
  if (features.length > 0) {
    lines.push("");
    lines.push("Described features:");
    for (const b of features) lines.push(`- ${b.title}`);
  }
  if (decisions.length > 0) {
    lines.push("");
    lines.push("Documented decisions:");
    for (const b of decisions) lines.push(`- ${b.title}`);
  }
  if (concepts.length > 0) {
    lines.push("");
    lines.push(`Recurring concepts: ${concepts.map((c) => c.title).join(", ")}.`);
  }
  if (!lead && features.length === 0 && decisions.length === 0 && concepts.length === 0) {
    return composeGeneric(blocks, retrieved, confidence);
  }
  appendConfidence(lines, confidence);
  return lines.join("\n");
}

/**
 * Extract the lead paragraph from the top doc chunk.
 *
 * Prefers README.md if present in retrieved set, otherwise highest-scoring chunk.
 * Returns the first non-heading paragraph from the full chunk text, clipped to ~320 chars.
 */
function extractLead(chunks: MemoryChunk[]): string {
  if (chunks.length === 0) return "";
  const readme = chunks.find((c) => /^readme\b/i.test(c.sourceName));
  const target = readme ?? chunks[0];
  if (!target) return "";
  // Split by blank line into paragraphs; pick first non-heading paragraph.
  const paragraphs = target.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  for (const p of paragraphs) {
    const firstLine = p.split("\n")[0]?.trim() ?? "";
    if (firstLine.startsWith("#")) {
      // Heading paragraph — skip the heading but keep the rest if any
      const rest = p.split("\n").slice(1).join(" ").trim();
      if (rest.length > 30) return clipLead(rest);
      continue;
    }
    if (p.length > 30) return clipLead(p.replace(/\n/g, " "));
  }
  return "";
}

function clipLead(s: string): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > 320 ? `${clean.slice(0, 317)}…` : clean;
}

function composeTyped(
  intent: BlockType,
  blocks: MemoryBlock[],
  retrieved: RetrievedChunk[],
  confidence: "low" | "medium" | "high",
): string {
  const relevant = pickByType(blocks, intent, 5);
  const lines: string[] = [];

  if (relevant.length === 0) {
    // Fall back to chunk excerpts
    for (let i = 0; i < Math.min(2, retrieved.length); i++) {
      if (i > 0) lines.push("");
      lines.push(retrieved[i]!.preview);
    }
    if (lines.length === 0) lines.push(`No ${intent.toLowerCase()} information found in the indexed sources.`);
    appendConfidence(lines, confidence);
    return lines.join("\n");
  }

  // Lead with best block summary (most natural sentence)
  lines.push(relevant[0].summary);

  // List additional items concisely
  if (relevant.length > 1) {
    lines.push("");
    lines.push(`Other ${intent.toLowerCase()} items:`);
    for (const b of relevant.slice(1)) {
      const src = b.sources.length > 0 ? ` (${b.sources[0]})` : "";
      lines.push(`- ${b.title}${src}`);
    }
  }

  appendConfidence(lines, confidence);
  return lines.join("\n");
}

function composeGeneric(
  blocks: MemoryBlock[],
  retrieved: RetrievedChunk[],
  confidence: "low" | "medium" | "high",
): string {
  const lines: string[] = [];

  // Lead with verbatim excerpts from top retrieved chunks
  for (let i = 0; i < Math.min(2, retrieved.length); i++) {
    if (i > 0) lines.push("");
    lines.push(retrieved[i].preview);
  }

  // Supplement with block context — use summary (natural sentence), filter junk titles
  const useful = blocks
    .filter((b) => b.title.replace(/[^a-zA-Z]/g, "").length >= 5 && b.summary.length > 10)
    .slice(0, 3);
  if (useful.length > 0) {
    lines.push("");
    for (const b of useful) {
      lines.push(`${b.type}: ${b.summary}`);
    }
  }

  appendConfidence(lines, confidence);
  return lines.join("\n");
}

function pickByType(blocks: MemoryBlock[], type: BlockType, limit: number): MemoryBlock[] {
  // Dedup by lowercased title to avoid 4× "RAG Memory Playground"
  const seen = new Set<string>();
  const out: MemoryBlock[] = [];
  for (const b of blocks) {
    if (b.type !== type) continue;
    const key = b.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}

function appendConfidence(lines: string[], confidence: "low" | "medium" | "high"): void {
  if (confidence === "low") {
    lines.push("");
    lines.push("Confidence: low — corpus weakly matches this query.");
  }
}

function detectIntent(terms: string[]): Intent {
  if (terms.some((t) => ["risk", "risks", "issue", "issues", "problem", "blocker", "gotcha"].includes(t))) return "Risk";
  if (terms.some((t) => ["todo", "todos", "fix", "missing", "next", "build", "implement"].includes(t))) return "Todo";
  if (terms.some((t) => ["feature", "features", "supports", "allows", "functionality"].includes(t))) return "Feature";
  if (terms.some((t) => ["decision", "decided", "rationale", "architecture", "backend", "browser", "store", "stores", "database", "storage"].includes(t))) return "Decision";
  if (terms.some((t) => ["about", "overview", "summary", "purpose", "describe", "described", "project"].includes(t))) return "Overview";
  return "Generic";
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
