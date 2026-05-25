/**
 * Client-side embedder for the RAG Memory Playground.
 *
 * Calls /api/embed (server-side, IP-rate-limited) instead of calling OpenAI directly,
 * so the API key never touches the browser.
 *
 * Caches embeddings by SHA-256 content hash to avoid re-embedding unchanged text.
 * Session limit: 100 API calls (each call may batch multiple texts).
 */

import type { MemoryChunk } from "./types";

// In-memory content-hash cache: hash → embedding vector.
const embeddingCache = new Map<string, number[]>();
let sessionCallCount = 0;
const SESSION_CALL_LIMIT = 100;

/** Compute a short hash to use as cache key. Uses SubtleCrypto when available. */
async function hashText(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 32);
  }
  // Fallback: simple djb2 hash (browser without SubtleCrypto)
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return String(h);
}

export interface EmbedBatchResult {
  embeddings: number[][];
  cost_usd: number;
  cached_count: number;
  api_calls: number;
}

/**
 * Embed multiple texts, using cache where possible.
 * Returns embeddings in the same order as input texts.
 */
export async function embedTexts(texts: string[]): Promise<EmbedBatchResult> {
  const hashes = await Promise.all(texts.map((t) => hashText(t)));

  // Separate cached vs uncached
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (!embeddingCache.has(hashes[i]!)) {
      uncachedIndices.push(i);
      uncachedTexts.push(texts[i]!);
    }
  }

  let cost_usd = 0;
  let api_calls = 0;

  if (uncachedTexts.length > 0) {
    if (sessionCallCount >= SESSION_CALL_LIMIT) {
      throw new Error(`Session embed limit reached (${SESSION_CALL_LIMIT} API calls). Reload to reset.`);
    }

    const response = await fetch("/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: uncachedTexts }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error((err as { error?: string }).error ?? `Embed API error ${response.status}`);
    }

    const data = (await response.json()) as {
      embeddings: number[][];
      cost_usd: number;
    };

    // Store in cache
    for (let j = 0; j < uncachedTexts.length; j++) {
      const hash = hashes[uncachedIndices[j]!]!;
      embeddingCache.set(hash, data.embeddings[j]!);
    }

    cost_usd = data.cost_usd;
    api_calls = 1;
    sessionCallCount += 1;
  }

  // Assemble result in original order
  const embeddings = texts.map((_, i) => embeddingCache.get(hashes[i]!)!);
  return { embeddings, cost_usd, cached_count: texts.length - uncachedTexts.length, api_calls };
}

/** Cosine similarity between two vectors. Returns value in [-1, 1]. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface EmbeddedChunk {
  chunk: MemoryChunk;
  score: number;
}

/**
 * Retrieve top-K chunks by cosine similarity to query embedding.
 * Chunks without embeddings are skipped.
 */
export function retrieveByEmbedding(
  queryEmbedding: number[],
  chunks: MemoryChunk[],
  topK = 5,
): EmbeddedChunk[] {
  return chunks
    .filter((c) => c.embedding !== undefined)
    .map((c) => ({ chunk: c, score: cosine(queryEmbedding, c.embedding!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Wipe all cached embeddings (e.g. after file re-index). */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}

/** How many session API calls have been made. */
export function getSessionCallCount(): number {
  return sessionCallCount;
}
