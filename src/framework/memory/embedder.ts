/**
 * Block embedder for memory formation.
 *
 * Real: OpenAI text-embedding-3-small (lazy import). Stub: deterministic
 * bag-of-words hashing vector so graph linking works offline. Both return
 * comparable vectors via cosine similarity.
 */

import type { ProviderMode } from "../types.js";

export interface BlockEmbedder {
  readonly name: string;
  readonly mode: ProviderMode;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

const STUB_DIM = 64;

export class StubBlockEmbedder implements BlockEmbedder {
  readonly name = "deterministic-embedder";
  readonly mode = "stub" as const;
  readonly dimensions = STUB_DIM;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => hashEmbed(t, STUB_DIM));
  }
}

export class OpenAIBlockEmbedder implements BlockEmbedder {
  readonly name = "openai-embedder";
  readonly mode = "real" as const;
  readonly dimensions = 1536;
  private readonly model: string;

  constructor(model?: string) {
    this.model = model ?? process.env["OPENAI_EMBEDDING_MODEL"] ?? "text-embedding-3-small";
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
    const res = await client.embeddings.create({ model: this.model, input: texts });
    return res.data.map((d) => d.embedding);
  }
}

function hashEmbed(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const tok of tokens) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) {
      h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    }
    vec[h % dim] += 1;
  }
  // L2 normalize.
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export function pickBlockEmbedder(): BlockEmbedder {
  const wantsReal =
    (process.env["FRAMEWORK_MODE"] ?? "local") === "real" &&
    Boolean(process.env["OPENAI_API_KEY"]);
  return wantsReal ? new OpenAIBlockEmbedder() : new StubBlockEmbedder();
}
