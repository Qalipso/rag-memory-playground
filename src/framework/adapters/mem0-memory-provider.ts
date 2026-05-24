import type {
  MemoryAddInput,
  MemoryListInput,
  MemoryProvider,
  MemorySearchInput,
} from "../ports/memory-provider.port.js";
import type { RetrievedMemory } from "../types.js";

/**
 * Mem0 cloud memory adapter.
 *
 * Lazy-imports `mem0ai`. Requires MEM0_API_KEY. If the key or the SDK is
 * unavailable, caller should fall back to LocalMemoryProvider.
 *
 * Notes:
 *   - mem0ai v2 SDK is the official JS client.
 *   - User isolation is handled via the `user_id` parameter.
 */
export interface Mem0ProviderOptions {
  apiKey?: string;
  orgId?: string;
  projectId?: string;
}

export class Mem0MemoryProvider implements MemoryProvider {
  readonly name = "mem0";
  readonly framework = "Mem0";
  readonly mode = "real" as const;
  readonly version = "2.x";
  readonly requiredEnvVars: string[] = ["MEM0_API_KEY"];

  private readonly apiKey: string;
  private readonly orgId: string | undefined;
  private readonly projectId: string | undefined;
  private clientPromise: Promise<Mem0Like> | null = null;

  constructor(opts: Mem0ProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env["MEM0_API_KEY"];
    if (!apiKey) {
      throw new Error("Mem0MemoryProvider requires MEM0_API_KEY.");
    }
    this.apiKey = apiKey;
    this.orgId = opts.orgId ?? process.env["MEM0_ORG_ID"];
    this.projectId = opts.projectId ?? process.env["MEM0_PROJECT_ID"];
  }

  isConfigured(): boolean {
    return Boolean(process.env["MEM0_API_KEY"]);
  }

  async search(input: MemorySearchInput): Promise<RetrievedMemory[]> {
    const client = await this.getClient();
    const res = await client.search(input.query, {
      user_id: input.userId,
      limit: input.topK,
    });

    const items = Array.isArray(res) ? res : (res?.results ?? []);
    return items.map<RetrievedMemory>((m) => ({
      id: m.id ?? "",
      type: (m.metadata?.["type"] as RetrievedMemory["type"]) ?? "episodic",
      content: m.memory ?? m.text ?? "",
      score: typeof m.score === "number" ? m.score : 0,
      reason: "mem0_vector_similarity",
      metadata: { provider: this.name, ...(m.metadata ?? {}) },
    }));
  }

  async add(input: MemoryAddInput): Promise<{ id: string }> {
    const client = await this.getClient();
    const res = await client.add(
      [{ role: "user", content: input.content }],
      {
        user_id: input.userId,
        metadata: { type: input.type, ...(input.metadata ?? {}) },
      }
    );
    const id = Array.isArray(res) ? (res[0]?.id ?? "") : (res?.id ?? "");
    return { id };
  }

  async listAll(input: MemoryListInput): Promise<RetrievedMemory[]> {
    const client = await this.getClient();
    if (!client.getAll) return [];
    const res = await client.getAll({
      user_id: input.userId,
      limit: input.limit ?? 200,
    });
    const items = Array.isArray(res) ? res : (res?.results ?? []);
    return items.map<RetrievedMemory>((m) => ({
      id: m.id ?? "",
      type: (m.metadata?.["type"] as RetrievedMemory["type"]) ?? "episodic",
      content: m.memory ?? m.text ?? "",
      score: 0,
      reason: "mem0_list",
      metadata: { provider: this.name, ...(m.metadata ?? {}) },
    }));
  }

  private async getClient(): Promise<Mem0Like> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const mod = (await import("mem0ai")) as { default: new (opts: Mem0ClientOptions) => Mem0Like };
        const opts: Mem0ClientOptions = { apiKey: this.apiKey };
        if (this.orgId) opts.orgId = this.orgId;
        if (this.projectId) opts.projectId = this.projectId;
        return new mod.default(opts);
      })();
    }
    return this.clientPromise;
  }
}

interface Mem0ClientOptions {
  apiKey: string;
  orgId?: string;
  projectId?: string;
}

interface Mem0Like {
  search(
    query: string,
    opts: { user_id: string; limit?: number }
  ): Promise<{ results?: Mem0Item[] } | Mem0Item[]>;
  add(
    messages: { role: string; content: string }[],
    opts: { user_id: string; metadata?: Record<string, unknown> }
  ): Promise<{ id?: string } | { id?: string }[]>;
  getAll?(opts: { user_id: string; limit?: number }): Promise<
    { results?: Mem0Item[] } | Mem0Item[]
  >;
}

interface Mem0Item {
  id?: string;
  memory?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}
