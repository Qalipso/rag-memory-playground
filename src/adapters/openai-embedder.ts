import type { EmbedderPort } from "../ports/embedder.port.js";

/**
 * OpenAI embeddings adapter. Lazy-imports the OpenAI SDK so the package
 * works without `openai` installed if you never call `embed()`.
 *
 * Default model: text-embedding-3-small (1536 dims).
 * Requires OPENAI_API_KEY in env.
 */
export interface OpenAIEmbedderOptions {
  model?: string;
  apiKey?: string;
}

export class OpenAIEmbedder implements EmbedderPort {
  readonly dimensions: number;
  private readonly model: string;
  private readonly apiKey: string;
  private clientPromise: Promise<OpenAILike> | null = null;

  constructor(opts: OpenAIEmbedderOptions = {}) {
    this.model = opts.model ?? "text-embedding-3-small";
    const apiKey = opts.apiKey ?? process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "OpenAIEmbedder requires OPENAI_API_KEY. Pass apiKey or set the env var."
      );
    }
    this.apiKey = apiKey;

    // text-embedding-3-small: 1536, text-embedding-3-large: 3072.
    this.dimensions = this.model.includes("large") ? 3072 : 1536;
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (!vec) throw new Error("OpenAI embedding returned no vector.");
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const client = await this.getClient();
    const res = await client.embeddings.create({
      model: this.model,
      input: texts,
    });
    return res.data.map((d) => d.embedding);
  }

  private async getClient(): Promise<OpenAILike> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = (await import("openai")) as { default: new (opts: { apiKey: string }) => OpenAILike };
        return new mod.default({ apiKey: this.apiKey });
      })();
    }
    return this.clientPromise;
  }
}

interface OpenAILike {
  embeddings: {
    create(args: { model: string; input: string[] }): Promise<{
      data: { embedding: number[] }[];
    }>;
  };
}
