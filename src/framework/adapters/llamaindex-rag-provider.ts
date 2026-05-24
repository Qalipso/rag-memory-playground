import type {
  RagProvider,
  RagSearchInput,
} from "../ports/rag-provider.port.js";
import type { RetrievedDocument } from "../types.js";
import { seedDocuments } from "../data/seed.js";

/**
 * LlamaIndex.TS RAG adapter.
 *
 * Lazy-imports `llamaindex` so the package works without the heavy dep tree
 * loaded at boot. Uses VectorStoreIndex.fromDocuments() with an in-memory
 * vector store. Embedding model defaults to OpenAI text-embedding-3-small;
 * override via OPENAI_EMBEDDING_MODEL env var.
 *
 * If LlamaIndex fails to initialize (missing API key, network error),
 * caller should fall back to LocalRagProvider.
 */
export interface LlamaIndexRagOptions {
  embeddingModel?: string;
}

export class LlamaIndexRagProvider implements RagProvider {
  readonly name = "llamaindex.ts";
  readonly framework = "LlamaIndex.TS";
  readonly mode = "real" as const;
  readonly version = "0.8.x";
  readonly requiredEnvVars: string[] = ["OPENAI_API_KEY"];

  private readonly opts: LlamaIndexRagOptions;
  private indexPromise: Promise<unknown> | null = null;
  private retrievePromise: Promise<RetrieveFn> | null = null;

  constructor(opts: LlamaIndexRagOptions = {}) {
    this.opts = opts;
  }

  isConfigured(): boolean {
    return Boolean(process.env["OPENAI_API_KEY"]);
  }

  async search(input: RagSearchInput): Promise<RetrievedDocument[]> {
    const retrieve = await this.getRetriever();
    const nodes = await retrieve(input.query, input.topK);

    return nodes.map<RetrievedDocument>((node, i) => {
      const titleMeta = (node.metadata?.["title"] as string) ?? "Document";
      const sourceMeta = (node.metadata?.["source"] as string) ?? "unknown";
      return {
        id: node.id ?? `doc_${i}`,
        title: titleMeta,
        content: node.text,
        source: sourceMeta,
        score: node.score ?? 0,
        reason: "llamaindex_vector_similarity",
        metadata: { provider: this.name, ...(node.metadata ?? {}) },
      };
    });
  }

  private async getRetriever(): Promise<RetrieveFn> {
    if (this.retrievePromise) return this.retrievePromise;

    this.retrievePromise = (async () => {
      const li = (await import("llamaindex")) as LlamaIndexLike;

      // Build documents from seed.
      const docs = seedDocuments.map(
        (d) =>
          new li.Document({
            text: `${d.title}\n\n${d.content}`,
            metadata: { title: d.title, source: d.source, docId: d.id },
          })
      );

      // Build in-memory VectorStoreIndex with default OpenAI embedder.
      const index = await li.VectorStoreIndex.fromDocuments(docs);
      const retriever = index.asRetriever({ similarityTopK: 10 });

      return async (query: string, topK: number) => {
        const results = (await retriever.retrieve({ query })) as LlamaIndexRetrievedNode[];
        return results.slice(0, topK).map((r) => ({
          id: r.node?.id_ ?? r.id_ ?? undefined,
          text: r.node?.getContent?.("ALL") ?? r.node?.text ?? "",
          score: r.score,
          metadata: r.node?.metadata,
        }));
      };
    })();

    return this.retrievePromise;
  }
}

type RetrieveFn = (
  query: string,
  topK: number
) => Promise<
  Array<{
    id?: string | undefined;
    text: string;
    score?: number | undefined;
    metadata?: Record<string, unknown> | undefined;
  }>
>;

interface LlamaIndexLike {
  Document: new (init: { text: string; metadata?: Record<string, unknown> }) => unknown;
  VectorStoreIndex: {
    fromDocuments(docs: unknown[]): Promise<{
      asRetriever(opts: { similarityTopK: number }): {
        retrieve(args: { query: string }): Promise<unknown>;
      };
    }>;
  };
}

interface LlamaIndexRetrievedNode {
  id_?: string;
  score?: number;
  node?: {
    id_?: string;
    text?: string;
    metadata?: Record<string, unknown>;
    getContent?: (mode: string) => string;
  };
}
