/**
 * Memory extractor — the "Classify + Extract entities + Split into blocks" stage.
 *
 * Real mode: OpenAI chat completion with JSON response, when OPENAI_API_KEY is
 * set and FRAMEWORK_MODE=real. Stub mode: deterministic heuristics so the demo
 * runs offline with zero keys. Both produce the same ExtractionOutput shape.
 */

import type { ProviderMode } from "../types.js";
import type { EntityKind, ExtractionOutput, MemoryLevel } from "./types.js";

export interface MemoryExtractor {
  readonly name: string;
  readonly mode: ProviderMode;
  extract(text: string): Promise<ExtractionOutput>;
}

const SYSTEM_PROMPT = [
  "You are a memory-formation engine for an AI assistant.",
  "Given a user's raw note, produce structured long-term memory.",
  "Split the note into MULTIPLE memory blocks across four levels:",
  "- semantic: durable facts/knowledge about the user or world.",
  "- episodic: a dated event ('on this day the user realized X').",
  "- procedural: how-to / intent / a thing the user wants to do.",
  "- working: an immediate actionable task or open question.",
  "Extract entities (people, projects, concepts, actions, places).",
  "Return STRICT JSON only, matching the requested schema. No prose.",
].join(" ");

function buildUserPrompt(text: string): string {
  return [
    "Note:",
    text,
    "",
    "Return JSON with keys: language (ISO code), summary (one sentence),",
    "topics (string[]), entities ({name, kind}[] where kind is one of",
    "person|project|concept|action|place|other), blocks ({level, content,",
    "importance}[] where level is one of semantic|episodic|procedural|working",
    "and importance is 0..1). Produce 2-5 blocks spanning multiple levels.",
  ].join("\n");
}

/** Real OpenAI extractor. Lazy-imports the SDK so stub mode has no cost. */
export class OpenAIMemoryExtractor implements MemoryExtractor {
  readonly name = "openai-extractor";
  readonly mode = "real" as const;
  private readonly model: string;

  constructor(model?: string) {
    this.model = model ?? process.env["OPENAI_LLM_MODEL"] ?? "gpt-4o-mini";
  }

  async extract(text: string): Promise<ExtractionOutput> {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });

    const completion = await client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(text) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ExtractionOutput>;
    return normalizeExtraction(parsed, text);
  }
}

/** Deterministic, offline extractor. */
export class StubMemoryExtractor implements MemoryExtractor {
  readonly name = "deterministic-extractor";
  readonly mode = "stub" as const;

  async extract(text: string): Promise<ExtractionOutput> {
    return heuristicExtract(text);
  }
}

const VALID_LEVELS: MemoryLevel[] = ["semantic", "episodic", "procedural", "working"];
const VALID_KINDS: EntityKind[] = [
  "person",
  "project",
  "concept",
  "action",
  "place",
  "other",
];

function normalizeExtraction(
  parsed: Partial<ExtractionOutput>,
  fallbackText: string
): ExtractionOutput {
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const cleanBlocks = blocks
    .filter((b) => b && typeof b.content === "string" && b.content.trim())
    .map((b) => ({
      level: VALID_LEVELS.includes(b.level as MemoryLevel)
        ? (b.level as MemoryLevel)
        : "semantic",
      content: b.content.trim(),
      importance: clamp01(typeof b.importance === "number" ? b.importance : 0.5),
    }));

  const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
  const cleanEntities = entities
    .filter((e) => e && typeof e.name === "string" && e.name.trim())
    .map((e) => ({
      name: e.name.trim(),
      kind: VALID_KINDS.includes(e.kind as EntityKind)
        ? (e.kind as EntityKind)
        : "other",
    }));

  return {
    language: typeof parsed.language === "string" ? parsed.language : "und",
    summary:
      typeof parsed.summary === "string" && parsed.summary.trim()
        ? parsed.summary.trim()
        : fallbackText.slice(0, 120),
    topics: Array.isArray(parsed.topics)
      ? parsed.topics.filter((t): t is string => typeof t === "string")
      : [],
    entities: cleanEntities,
    blocks: cleanBlocks.length > 0 ? cleanBlocks : heuristicExtract(fallbackText).blocks,
  };
}

// ---------- heuristic stub ----------

const INTENT_SIGNALS = [
  "надо",
  "нужно",
  "сделать",
  "todo",
  "need to",
  "should",
  "want to",
  "build",
  "create",
  "хочу",
];
const REALIZATION_SIGNALS = [
  "понял",
  "поняла",
  "осознал",
  "realized",
  "noticed",
  "сегодня",
  "today",
  "заметил",
];
const KNOWN_PROJECTS = ["shadow", "promptops", "graphify", "edo"];

function heuristicExtract(text: string): ExtractionOutput {
  const language = /[а-яё]/i.test(text) ? "ru" : "en";
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks: ExtractionOutput["blocks"] = [];
  const lower = text.toLowerCase();

  for (const s of sentences) {
    const sl = s.toLowerCase();
    const isIntent = INTENT_SIGNALS.some((k) => sl.includes(k));
    const isRealization = REALIZATION_SIGNALS.some((k) => sl.includes(k));

    if (isRealization) {
      blocks.push({ level: "episodic", content: s, importance: 0.6 });
      blocks.push({
        level: "semantic",
        content: stripDate(s),
        importance: 0.7,
      });
    }
    if (isIntent) {
      blocks.push({ level: "procedural", content: s, importance: 0.75 });
      blocks.push({ level: "working", content: `Open task: ${s}`, importance: 0.85 });
    }
    if (!isIntent && !isRealization && s.length > 20) {
      blocks.push({ level: "semantic", content: s, importance: 0.4 });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ level: "semantic", content: text.trim(), importance: 0.5 });
  }

  // Entities: known projects + capitalized tokens.
  const entityMap = new Map<string, EntityKind>();
  for (const proj of KNOWN_PROJECTS) {
    if (lower.includes(proj)) {
      entityMap.set(capitalize(proj), "project");
    }
  }
  const capTokens = text.match(/\b[A-ZА-ЯЁ][a-zа-яё]{2,}\b/g) ?? [];
  for (const tok of capTokens) {
    if (!entityMap.has(tok)) entityMap.set(tok, "concept");
  }
  // Action verbs from intent sentences as "action" entities.
  if (INTENT_SIGNALS.some((k) => lower.includes(k))) {
    if (lower.includes("трекер") || lower.includes("tracker")) {
      entityMap.set("expense tracker", "action");
    }
  }

  const entities = Array.from(entityMap.entries()).map(([name, kind]) => ({ name, kind }));

  const topics: string[] = [];
  if (lower.includes("кофе") || lower.includes("coffee")) topics.push("spending");
  if (KNOWN_PROJECTS.some((p) => lower.includes(p))) topics.push("product");

  return {
    language,
    summary: sentences[0] ?? text.slice(0, 120),
    topics,
    entities,
    blocks: dedupeBlocks(blocks),
  };
}

function dedupeBlocks(blocks: ExtractionOutput["blocks"]): ExtractionOutput["blocks"] {
  const seen = new Set<string>();
  const out: ExtractionOutput["blocks"] = [];
  for (const b of blocks) {
    const key = `${b.level}::${b.content.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function stripDate(s: string): string {
  return s
    .replace(/^сегодня[, ]*/i, "")
    .replace(/^today[, ]*/i, "")
    .replace(/^я\s+/i, "I ")
    .trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Picks the extractor based on env, mirroring the framework container contract.
 */
export function pickMemoryExtractor(): MemoryExtractor {
  const wantsReal =
    (process.env["FRAMEWORK_MODE"] ?? "local") === "real" &&
    Boolean(process.env["OPENAI_API_KEY"]);
  return wantsReal ? new OpenAIMemoryExtractor() : new StubMemoryExtractor();
}
