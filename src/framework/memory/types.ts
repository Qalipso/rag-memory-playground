/**
 * Memory-formation pipeline types.
 *
 * Turns a raw note into multi-level memory:
 *   Input → Normalize → Classify → Extract entities → Split into memory blocks
 *         → Embed → Store → Link to graph → (Retrieve / Answer) → Consolidate
 *
 * Honesty contract mirrors ExplainableRun: every stage reports whether it used
 * a real provider or a deterministic stub, and surfaces failure modes.
 */

import type { ProviderMode } from "../types.js";

export type MemoryLevel = "semantic" | "episodic" | "procedural" | "working";

export type EntityKind = "person" | "project" | "concept" | "action" | "place" | "other";

export interface ExtractedEntity {
  id: string;
  name: string;
  kind: EntityKind;
}

export interface MemoryBlock {
  id: string;
  userId: string;
  level: MemoryLevel;
  content: string;
  /** Entity ids referenced by this block. */
  entityIds: string[];
  /** 0..1 model/heuristic confidence the block is worth storing. */
  importance: number;
  /** Embedding vector (may be empty when embedder is a stub). */
  embedding: number[];
  sourceNoteId: string;
  createdAt: string;
  status: "active" | "merged" | "invalidated";
}

export type MemoryEdgeKind =
  | "shares_entity"
  | "semantic_similar"
  | "elaborates"
  | "supersedes";

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  kind: MemoryEdgeKind;
  weight: number;
  reason: string;
}

export interface FormationStep {
  name: string;
  providerMode: ProviderMode;
  framework: string;
  status: "ok" | "skipped" | "failed";
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
}

export interface FormationFailureMode {
  type:
    | "extractor_stub_used"
    | "embedder_stub_used"
    | "no_blocks_formed"
    | "no_entities_extracted"
    | "extractor_failed";
  description: string;
  severity: "info" | "warn" | "critical";
}

export interface MemoryFormationResult {
  noteId: string;
  userId: string;
  input: { text: string };
  normalizedText: string;
  classification: { topics: string[]; language: string; summary: string };
  entities: ExtractedEntity[];
  blocks: MemoryBlock[];
  newEdges: MemoryEdge[];
  steps: FormationStep[];
  providerStatus: Array<{ role: string; mode: ProviderMode; name: string }>;
  failureModes: FormationFailureMode[];
  meta: { totalDurationMs: number };
}

/** Structured output of the extraction stage (before embedding/storage). */
export interface ExtractionOutput {
  language: string;
  summary: string;
  topics: string[];
  entities: Array<{ name: string; kind: EntityKind }>;
  blocks: Array<{ level: MemoryLevel; content: string; importance: number }>;
}
