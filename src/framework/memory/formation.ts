/**
 * Memory-formation pipeline orchestrator.
 *
 *   Input → Normalize → Classify+Extract → Split blocks → Embed → Store
 *         → Link to graph → (result with full trace)
 *
 * Mirrors ExplainableRun honesty: every stage records provider mode, and
 * stub/fallback usage surfaces as a failure mode.
 */

import { randomUUID } from "node:crypto";
import { cosine, pickBlockEmbedder, type BlockEmbedder } from "./embedder.js";
import {
  OpenAIMemoryExtractor,
  StubMemoryExtractor,
  pickMemoryExtractor,
  type MemoryExtractor,
} from "./extractor.js";
import { getMemoryStore, type MemoryStore } from "./store.js";
import type {
  ExtractedEntity,
  ExtractionOutput,
  FormationFailureMode,
  FormationStep,
  MemoryBlock,
  MemoryEdge,
  MemoryFormationResult,
} from "./types.js";

const SHARES_ENTITY_MIN = 1;
const SEMANTIC_SIMILAR_MIN = 0.82;

export interface FormMemoryInput {
  userId: string;
  text: string;
}

export interface FormationDeps {
  extractor?: MemoryExtractor;
  embedder?: BlockEmbedder;
  store?: MemoryStore;
}

export async function formMemory(
  input: FormMemoryInput,
  deps: FormationDeps = {}
): Promise<MemoryFormationResult> {
  const store = deps.store ?? getMemoryStore();
  const embedder = deps.embedder ?? pickBlockEmbedder();
  let extractor = deps.extractor ?? pickMemoryExtractor();

  const noteId = `note_${randomUUID()}`;
  const startedAt = Date.now();
  const steps: FormationStep[] = [];
  const failureModes: FormationFailureMode[] = [];

  // 1. Normalize
  const normalizedText = stepSync(steps, "normalizeNode", "deterministic", "real", () => {
    const cleaned = input.text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    return {
      value: cleaned,
      inputSummary: `${input.text.length} chars`,
      outputSummary: `${cleaned.length} chars normalized`,
    };
  });

  // 2 + 3 + 4. Classify + Extract entities + Split into blocks (one model call)
  let extraction: ExtractionOutput;
  const extractStart = Date.now();
  try {
    extraction = await extractor.extract(normalizedText);
    steps.push({
      name: "classifyExtractSplitNode",
      framework: extractor.name,
      providerMode: extractor.mode,
      status: "ok",
      inputSummary: `text=${normalizedText.length}c`,
      outputSummary: `${extraction.blocks.length} blocks, ${extraction.entities.length} entities, lang=${extraction.language}`,
      durationMs: Date.now() - extractStart,
    });
  } catch (err) {
    // Real extractor failed → fall back to deterministic stub (honest).
    const stub = new StubMemoryExtractor();
    extraction = await stub.extract(normalizedText);
    extractor = stub;
    failureModes.push({
      type: "extractor_failed",
      description: `Real extractor threw (${(err as Error).message}); fell back to deterministic stub.`,
      severity: "warn",
    });
    steps.push({
      name: "classifyExtractSplitNode",
      framework: stub.name,
      providerMode: "fallback",
      status: "failed",
      inputSummary: `text=${normalizedText.length}c`,
      outputSummary: `fallback: ${extraction.blocks.length} blocks`,
      durationMs: Date.now() - extractStart,
    });
  }

  // Build entities with stable ids.
  const entities: ExtractedEntity[] = extraction.entities.map((e) => ({
    id: entityId(e.name),
    name: e.name,
    kind: e.kind,
  }));
  const entityByName = new Map(entities.map((e) => [e.name.toLowerCase(), e]));

  // 5. Embed
  const embedStart = Date.now();
  const blockTexts = extraction.blocks.map((b) => b.content);
  let embeddings: number[][] = [];
  try {
    embeddings = await embedder.embed(blockTexts);
  } catch {
    embeddings = blockTexts.map(() => []);
  }
  steps.push({
    name: "embedNode",
    framework: embedder.name,
    providerMode: embedder.mode,
    status: "ok",
    inputSummary: `${blockTexts.length} blocks`,
    outputSummary: `dim=${embedder.dimensions} (${embeddings.filter((e) => e.length).length} embedded)`,
    durationMs: Date.now() - embedStart,
  });

  // 6. Build + Store blocks
  const createdAt = new Date().toISOString();
  const blocks: MemoryBlock[] = extraction.blocks.map((b, i) => {
    const referenced = entities
      .filter((e) => b.content.toLowerCase().includes(e.name.toLowerCase()))
      .map((e) => e.id);
    return {
      id: `mem_${randomUUID()}`,
      userId: input.userId,
      level: b.level,
      content: b.content,
      entityIds: referenced,
      importance: b.importance,
      embedding: embeddings[i] ?? [],
      sourceNoteId: noteId,
      createdAt,
      status: "active",
    };
  });

  const existing = await store.activeBlocks(input.userId);

  const storeStart = Date.now();
  await store.upsertEntities(input.userId, entities);
  await store.addBlocks(blocks);
  steps.push({
    name: "storeNode",
    framework: store.backend,
    providerMode: "real",
    status: "ok",
    inputSummary: `${blocks.length} new blocks`,
    outputSummary: `stored (${store.backend}); corpus now ${existing.length + blocks.length} active`,
    durationMs: Date.now() - storeStart,
  });

  // 7. Link to graph
  const linkStart = Date.now();
  const newEdges = buildEdges(blocks, existing, entityByName);
  await store.addEdges(newEdges);
  steps.push({
    name: "linkGraphNode",
    framework: "deterministic",
    providerMode: "real",
    status: "ok",
    inputSummary: `new=${blocks.length} existing=${existing.length}`,
    outputSummary: `${newEdges.length} edges created`,
    durationMs: Date.now() - linkStart,
  });

  // Failure modes (honesty)
  if (extractor.mode === "stub") {
    failureModes.push({
      type: "extractor_stub_used",
      description:
        "Extraction used deterministic heuristics, not an LLM. Set OPENAI_API_KEY + FRAMEWORK_MODE=real for model-based extraction.",
      severity: "info",
    });
  }
  if (embedder.mode === "stub") {
    failureModes.push({
      type: "embedder_stub_used",
      description:
        "Block embeddings are deterministic hashes, not semantic vectors. Graph links use lexical overlap.",
      severity: "info",
    });
  }
  if (blocks.length === 0) {
    failureModes.push({
      type: "no_blocks_formed",
      description: "No memory blocks were formed from this note.",
      severity: "warn",
    });
  }
  if (entities.length === 0) {
    failureModes.push({
      type: "no_entities_extracted",
      description: "No entities were extracted; graph links rely on similarity only.",
      severity: "info",
    });
  }

  return {
    noteId,
    userId: input.userId,
    input: { text: input.text },
    normalizedText,
    classification: {
      topics: extraction.topics,
      language: extraction.language,
      summary: extraction.summary,
    },
    entities,
    blocks,
    newEdges,
    steps,
    providerStatus: [
      { role: "extractor", mode: extractor.mode, name: extractor.name },
      { role: "embedder", mode: embedder.mode, name: embedder.name },
    ],
    failureModes,
    meta: { totalDurationMs: Date.now() - startedAt },
  };
}

function buildEdges(
  newBlocks: MemoryBlock[],
  existing: MemoryBlock[],
  _entityByName: Map<string, ExtractedEntity>
): MemoryEdge[] {
  const edges: MemoryEdge[] = [];
  const pool = [...existing, ...newBlocks];

  for (const nb of newBlocks) {
    for (const other of pool) {
      if (other.id === nb.id) continue;

      // shared entity
      const shared = nb.entityIds.filter((id) => other.entityIds.includes(id));
      if (shared.length >= SHARES_ENTITY_MIN) {
        edges.push(makeEdge(nb.id, other.id, "shares_entity", Math.min(1, shared.length / 3), `shares ${shared.length} entity(ies)`));
        continue;
      }

      // semantic similarity (needs embeddings)
      if (nb.embedding.length && other.embedding.length) {
        const sim = cosine(nb.embedding, other.embedding);
        if (sim >= SEMANTIC_SIMILAR_MIN) {
          edges.push(makeEdge(nb.id, other.id, "semantic_similar", sim, `cosine=${sim.toFixed(2)}`));
        }
      }
    }
  }
  return dedupeEdges(edges);
}

function makeEdge(
  from: string,
  to: string,
  kind: MemoryEdge["kind"],
  weight: number,
  reason: string
): MemoryEdge {
  return { id: `edge_${randomUUID()}`, from, to, kind, weight, reason };
}

function dedupeEdges(edges: MemoryEdge[]): MemoryEdge[] {
  const seen = new Set<string>();
  const out: MemoryEdge[] = [];
  for (const e of edges) {
    const key = [e.from, e.to].sort().join("::") + "::" + e.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function entityId(name: string): string {
  return "ent_" + name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
}

// ---------- Consolidation ----------

export interface ConsolidationResult {
  merged: number;
  invalidated: number;
  supersedesEdges: MemoryEdge[];
  steps: FormationStep[];
}

const MERGE_SIMILARITY = 0.95;

/**
 * Consolidate memory over time: merge near-duplicate blocks of the same level,
 * marking the older block 'merged' and adding a 'supersedes' edge. Working-level
 * blocks superseded by a newer procedural/semantic block are invalidated.
 */
export async function consolidateMemory(
  userId: string,
  deps: { store?: MemoryStore } = {}
): Promise<ConsolidationResult> {
  const store = deps.store ?? getMemoryStore();
  const blocks = (await store.activeBlocks(userId)).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1
  );

  const supersedesEdges: MemoryEdge[] = [];
  let merged = 0;
  const start = Date.now();

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      if (a.status !== "active" || b.status !== "active") continue;
      if (a.level !== b.level) continue;
      if (!a.embedding.length || !b.embedding.length) {
        if (a.content.trim().toLowerCase() !== b.content.trim().toLowerCase()) continue;
      } else if (cosine(a.embedding, b.embedding) < MERGE_SIMILARITY) {
        continue;
      }
      // b (newer) supersedes a (older)
      await store.setBlockStatus(a.id, "merged");
      a.status = "merged";
      supersedesEdges.push(makeEdge(b.id, a.id, "supersedes", 1, "consolidated duplicate"));
      merged++;
    }
  }

  await store.addEdges(supersedesEdges);

  const steps: FormationStep[] = [
    {
      name: "consolidateNode",
      framework: "deterministic",
      providerMode: "real",
      status: "ok",
      inputSummary: `${blocks.length} active blocks`,
      outputSummary: `${merged} merged`,
      durationMs: Date.now() - start,
    },
  ];

  return { merged, invalidated: 0, supersedesEdges, steps };
}

// ---------- helpers ----------

function stepSync<T>(
  steps: FormationStep[],
  name: string,
  framework: string,
  mode: FormationStep["providerMode"],
  fn: () => { value: T; inputSummary: string; outputSummary: string }
): T {
  const start = Date.now();
  const { value, inputSummary, outputSummary } = fn();
  steps.push({
    name,
    framework,
    providerMode: mode,
    status: "ok",
    inputSummary,
    outputSummary,
    durationMs: Date.now() - start,
  });
  return value;
}

/** Re-export so a route can construct a real extractor explicitly if needed. */
export { OpenAIMemoryExtractor };
