import type { BlockType, MemoryBlock, MemoryChunk } from "./types";

interface Rule {
  type: BlockType;
  patterns: RegExp[];
  base: number;
  /** Patterns whose match line is preferred as the block title. */
  titlePatterns?: RegExp[];
}

const RULES: Rule[] = [
  {
    type: "Feature",
    base: 0.55,
    patterns: [
      /\bfeature\b/i,
      /\b(user|the user)\s+can\b/i,
      /\bsupports?\b/i,
      /\ballows?\b/i,
      /\benables?\b/i,
    ],
    titlePatterns: [
      /^[-*]\s+.*\b(feature|user can|supports?|allows?|enables?)\b.*/im,
      /^#+\s+features?.*/im,
    ],
  },
  {
    type: "Decision",
    base: 0.6,
    patterns: [
      /\bdecided\b/i,
      /\bwe (use|chose|picked|will use|are using|decided)\b/i,
      /\bchosen\b/i,
      /\brationale\b/i,
      /\bbecause\b/i,
    ],
    titlePatterns: [
      /(?:^|\.)\s*([^.\n]*\b(decided|we use|we chose|chosen|rationale)[^.\n]*)\.?/i,
    ],
  },
  {
    type: "Risk",
    base: 0.65,
    patterns: [
      /\brisks?\b/i,
      /\bissues?\b/i,
      /\bproblems?\b/i,
      /\bunclear\b/i,
      /\bmissing\b/i,
      /\bblocker\b/i,
      /\bgotcha\b/i,
    ],
    titlePatterns: [
      /^[-*]\s+(?:risk|issue|problem|blocker|gotcha)[:.]?\s*.*/im,
    ],
  },
  {
    type: "Todo",
    base: 0.6,
    patterns: [
      /\btodo\b/i,
      /\bneed to\b/i,
      /\bmust\b/i,
      /\bshould\b/i,
      /\bfix\b/i,
      /\blater\b/i,
    ],
    titlePatterns: [
      /^[-*]\s+(?:todo|need to|must|should|fix)[:.]?\s*.*/im,
      /(?:^|\.)\s*([^.\n]*\b(todo|need to|should|must)\b[^.\n]*)\.?/i,
    ],
  },
];

const TITLE_MAX = 80;
const STOP_CONCEPTS = new Set([
  "project","projects","page","pages","user","users","app","apps","docs","doc","data",
  "file","files","note","notes","item","items","name","names","example","examples",
  "thing","things","stuff","work","works","case","cases","time","new","old","main","big",
  "small","real","fake","also","etc","into","also","one","two","three","etc","etc.",
  "this","that","these","those","content","contents","section","sections","kind","kinds",
  "list","lists","value","values","step","steps","line","lines","part","parts","type",
  "types","next","prev","previous","later","still","first","second","last","more","most",
]);

function clip(s: string, max: number = TITLE_MAX): string {
  let t = s.trim();
  // Drop trailing connectors so titles don't end on "because", ", a typed,", "and"
  t = t.replace(/[,;]\s*$/, "").replace(/\s+(because|and|or|but|so|as|if|when|while|that|which|where|in|on|to|of|for|with|by|a|an|the)\s*$/i, "");
  if (t.length <= max) return t;
  // Try to cut at sentence/clause boundary
  const cut = t.slice(0, max);
  const lastPunct = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastPunct > max * 0.6) return cut.slice(0, lastPunct + 1);
  const lastSpace = cut.lastIndexOf(" ");
  return lastSpace > max * 0.6 ? `${cut.slice(0, lastSpace)}…` : `${cut}…`;
}

function cleanLine(line: string): string {
  return line.replace(/^[-*#>\s]+/, "").replace(/\s+/g, " ").trim();
}

/**
 * Title = first matching titlePattern line, else fall back to first non-heading sentence
 * that contains a rule pattern, else first non-heading sentence.
 */
function pickTitle(text: string, rule: Rule): string {
  if (rule.titlePatterns) {
    for (const p of rule.titlePatterns) {
      const m = text.match(p);
      if (m) return clip(cleanLine(m[0]));
    }
  }
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (s.startsWith("#")) continue;
    for (const p of rule.patterns) if (p.test(s)) return clip(cleanLine(s));
  }
  const firstReal = sentences.find((s) => !s.startsWith("#"));
  return clip(cleanLine(firstReal ?? sentences[0] ?? ""));
}

function summary(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > 240 ? `${cleaned.slice(0, 237)}…` : cleaned;
}

function evidenceSnippet(text: string, pattern: RegExp): string {
  const m = text.match(pattern);
  if (!m) return text.slice(0, 120);
  const idx = text.indexOf(m[0]);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + m[0].length + 80);
  return `…${text.slice(start, end).trim()}…`;
}

function scoreRule(text: string, rule: Rule): { hits: number; evidence: string[] } {
  let hits = 0;
  const evidence: string[] = [];
  for (const p of rule.patterns) {
    if (p.test(text)) {
      hits += 1;
      evidence.push(evidenceSnippet(text, p));
    }
  }
  return { hits, evidence };
}

function blockId(chunkId: string, type: BlockType, index: number): string {
  return `block-${type.toLowerCase()}-${chunkId}-${index}`;
}

export function extractBlocks(chunks: MemoryChunk[]): MemoryBlock[] {
  const blocks: MemoryBlock[] = [];
  let i = 0;

  for (const chunk of chunks) {
    if (chunk.text.length < 40) continue;
    for (const rule of RULES) {
      const { hits, evidence } = scoreRule(chunk.text, rule);
      // require ≥1 hit for high-signal types, ≥2 for low-signal Feature
      if (hits === 0) continue;
      if (rule.type === "Feature" && hits < 2) continue;
      const confidence = Math.min(0.95, rule.base + hits * 0.08);
      blocks.push({
        id: blockId(chunk.id, rule.type, i++),
        type: rule.type,
        title: pickTitle(chunk.text, rule),
        summary: summary(chunk.text),
        sources: [chunk.sourceName],
        chunkIds: [chunk.id],
        confidence: round2(confidence),
        evidence: evidence.slice(0, 3),
      });
    }
  }

  blocks.push(...extractConcepts(chunks));
  return dedupeBlocks(blocks);
}

/**
 * Concept = noun-like term repeated across ≥2 sources AND ≥3 chunks.
 * Drops generic stopwords (project, file, page, etc).
 */
function extractConcepts(chunks: MemoryChunk[]): MemoryBlock[] {
  const idx = new Map<string, { count: number; chunks: Set<string>; sources: Set<string> }>();
  for (const c of chunks) {
    for (const k of c.keywords) {
      if (STOP_CONCEPTS.has(k) || k.length < 5) continue;
      const e = idx.get(k) ?? { count: 0, chunks: new Set(), sources: new Set() };
      e.count += 1;
      e.chunks.add(c.id);
      e.sources.add(c.sourceName);
      idx.set(k, e);
    }
  }

  const concepts: MemoryBlock[] = [];
  const sorted = Array.from(idx.entries())
    .filter(([, info]) => info.chunks.size >= 3 && info.sources.size >= 2)
    .sort((a, b) => b[1].chunks.size - a[1].chunks.size)
    .slice(0, 6);

  for (const [term, info] of sorted) {
    const sample = chunks.find((c) => c.keywords.includes(term))?.text ?? "";
    concepts.push({
      id: `block-concept-${term}`,
      type: "Concept",
      title: term,
      summary: `Term "${term}" appears in ${info.chunks.size} chunks across ${info.sources.size} sources.`,
      sources: Array.from(info.sources),
      chunkIds: Array.from(info.chunks),
      confidence: round2(Math.min(0.9, 0.45 + info.chunks.size * 0.06)),
      evidence: [evidenceForTerm(sample, term)],
    });
  }
  return concepts;
}

function evidenceForTerm(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return text.slice(0, 120);
  const start = Math.max(0, i - 40);
  const end = Math.min(text.length, i + term.length + 80);
  return `…${text.slice(start, end).trim()}…`;
}

/**
 * Merge by (type + lowercased title). Combine sources/chunks/evidence.
 */
function dedupeBlocks(blocks: MemoryBlock[]): MemoryBlock[] {
  const byKey = new Map<string, MemoryBlock>();
  for (const b of blocks) {
    const key = `${b.type}::${b.title.toLowerCase()}`;
    const ex = byKey.get(key);
    if (!ex) {
      byKey.set(key, b);
    } else {
      ex.sources = unique([...ex.sources, ...b.sources]);
      ex.chunkIds = unique([...ex.chunkIds, ...b.chunkIds]);
      ex.evidence = unique([...ex.evidence, ...b.evidence]).slice(0, 4);
      ex.confidence = round2(Math.min(0.97, Math.max(ex.confidence, b.confidence) + 0.04));
    }
  }
  return Array.from(byKey.values());
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
