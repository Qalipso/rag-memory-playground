import { createHash } from "node:crypto";
import type { EmbedderPort } from "../ports/embedder.port.js";

/**
 * Deterministic embedder for tests and offline demo.
 * Maps text → fixed-dim unit vector via per-token hash bucketing.
 * Same text always produces the same vector across runs.
 *
 * Not a real semantic embedder. Good enough for ranking similar lexical content
 * and for keeping Phase 1 simulator path green without API keys.
 */
export class FakeEmbedder implements EmbedderPort {
  readonly dimensions: number;

  constructor(dimensions = 128) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return Promise.resolve(this.embedSync(text));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.embedSync(t)));
  }

  private embedSync(text: string): number[] {
    const vec = new Array<number>(this.dimensions).fill(0);
    const tokens = tokenize(text);
    if (tokens.length === 0) return vec;

    for (const token of tokens) {
      const idx = stableHashToIndex(token, this.dimensions);
      vec[idx] = (vec[idx] ?? 0) + 1;
      // Add bigram-style spread to nearby buckets for graceful similarity.
      const next = (idx + 1) % this.dimensions;
      vec[next] = (vec[next] ?? 0) + 0.5;
    }

    return normalize(vec);
  }
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function stableHashToIndex(token: string, dim: number): number {
  const hash = createHash("sha256").update(token).digest();
  // Take first 4 bytes as uint32, modulo dim.
  const n =
    ((hash[0] ?? 0) << 24) |
    ((hash[1] ?? 0) << 16) |
    ((hash[2] ?? 0) << 8) |
    (hash[3] ?? 0);
  return Math.abs(n) % dim;
}

function normalize(vec: number[]): number[] {
  let sumSquares = 0;
  for (const v of vec) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  // Vectors are pre-normalized by FakeEmbedder.normalize, so dot == cosine.
  // Clamp for floating-point safety.
  if (dot < -1) return -1;
  if (dot > 1) return 1;
  return dot;
}
