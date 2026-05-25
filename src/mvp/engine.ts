import { buildChunks } from "./chunker";
import { extractBlocks } from "./extractor";
import { evaluate } from "./evaluator";
import { retrieve } from "./retrieval";
import {
  clearEmbeddingCache,
  embedTexts,
  retrieveByEmbedding,
} from "./embedder";
import type {
  AskResult,
  EvalResult,
  FileKind,
  MemoryBlock,
  MemoryChunk,
  RetrievalTrace,
  RetrievedChunk,
  SourceFile,
  SourceStatus,
} from "./types";

const SKIP_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /(^|\/)node_modules(\/|$)/, reason: "node_modules" },
  { pattern: /(^|\/)\.next(\/|$)/, reason: ".next build output" },
  { pattern: /(^|\/)dist(\/|$)/, reason: "dist build output" },
  { pattern: /(^|\/)build(\/|$)/, reason: "build output" },
  { pattern: /(^|\/)\.env(\.|$)/, reason: "secret file" },
  { pattern: /\.env\.local$/, reason: "secret file" },
  { pattern: /package-lock\.json$/, reason: "lockfile" },
  { pattern: /pnpm-lock\.yaml$/, reason: "lockfile" },
  { pattern: /yarn\.lock$/, reason: "lockfile" },
  { pattern: /bun\.lockb?$/, reason: "lockfile" },
];

const ALLOWED_EXT = new Set(["md", "txt", "json", "ts", "tsx", "js", "jsx"]);

export interface FileInput {
  name: string;
  path?: string;
  content: string;
}

export interface IngestSummary {
  total: number;
  indexed: number;
  skipped: number;
  chunks: number;
  blocks: number;
}

export class RagMemoryEngine {
  private sources: SourceFile[] = [];
  private chunks: MemoryChunk[] = [];
  private blocks: MemoryBlock[] = [];
  private lastTrace: RetrievalTrace | null = null;
  private idCounter = 0;

  ingestFiles(files: FileInput[]): IngestSummary {
    this.sources = [];
    this.chunks = [];
    this.blocks = [];
    this.idCounter = 0;

    for (const f of files) {
      const source = this.ingestOne(f);
      this.sources.push(source);
    }

    this.blocks = extractBlocks(this.chunks);

    return {
      total: files.length,
      indexed: this.sources.filter((s) => s.status === "indexed").length,
      skipped: this.sources.filter((s) => s.status === "skipped").length,
      chunks: this.chunks.length,
      blocks: this.blocks.length,
    };
  }

  private ingestOne(file: FileInput): SourceFile {
    const id = this.nextId("src");
    const path = file.path ?? file.name;
    const kind = detectFileKind(file.name);
    const { status, reason } = classify(path, kind, file.content);

    if (status === "skipped") {
      return {
        id,
        name: file.name,
        path,
        type: kind,
        content: file.content,
        status,
        chunkCount: 0,
        summary: reason ?? "skipped",
        skipReason: reason,
      };
    }

    const chunkIdPrefix = `${id}-c`;
    const chunks = buildChunks(id, file.name, kind, file.content, chunkIdPrefix);
    this.chunks.push(...chunks);

    return {
      id,
      name: file.name,
      path,
      type: kind,
      content: file.content,
      status: "indexed",
      chunkCount: chunks.length,
      summary: summarize(file.content, kind),
    };
  }

  getSources(): SourceFile[] {
    return this.sources;
  }

  getChunks(): MemoryChunk[] {
    return this.chunks;
  }

  getMemoryBlocks(): MemoryBlock[] {
    return this.blocks;
  }

  ask(question: string): AskResult {
    const result = retrieve({
      question,
      chunks: this.chunks,
      blocks: this.blocks,
      sourcesCount: this.sources.filter((s) => s.status === "indexed").length,
    });
    this.lastTrace = result.trace;

    // Ragas-shaped deterministic evaluation.
    const chunkTexts = result.chunks.map((rc) => {
      const chunk = this.chunks.find((c) => c.id === rc.chunkId);
      return chunk?.text ?? rc.preview;
    });
    const evalResult = evaluate({
      question,
      answer: result.answer,
      queryTerms: result.trace.queryTerms,
      retrievedChunks: result.chunks,
      chunkTexts,
    });

    return { ...result, eval: evalResult };
  }

  getLastTrace(): RetrievalTrace | null {
    return this.lastTrace;
  }

  /**
   * Embed all indexed chunks via /api/embed.
   * Returns cost + count. Idempotent — cached chunks are not re-embedded.
   */
  async embedChunks(): Promise<{ cost_usd: number; total: number; cached: number }> {
    const indexed = this.chunks;
    if (indexed.length === 0) return { cost_usd: 0, total: 0, cached: 0 };

    const texts = indexed.map((c) => c.text);
    const result = await embedTexts(texts);

    // Attach embeddings to chunk objects in place
    for (let i = 0; i < indexed.length; i++) {
      indexed[i]!.embedding = result.embeddings[i];
    }

    return {
      cost_usd: result.cost_usd,
      total: indexed.length,
      cached: result.cached_count,
    };
  }

  /**
   * Ask a question using embedding-based retrieval.
   * Requires embedChunks() to have been called first (or embedChunks will be called inline).
   */
  async askByEmbedding(question: string, topK = 5): Promise<AskResult & { embed_cost_usd: number }> {
    // Embed query
    const queryResult = await embedTexts([question]);
    const queryEmbedding = queryResult.embeddings[0]!;

    const embedded = retrieveByEmbedding(queryEmbedding, this.chunks, topK);

    const retrieved: RetrievedChunk[] = embedded.map((e) => ({
      chunkId: e.chunk.id,
      sourceName: e.chunk.sourceName,
      preview: e.chunk.text.slice(0, 200).replace(/\s+/g, " "),
      score: Math.round(e.score * 100) / 100,
      matchedTerms: [],
    }));

    const finalSources = unique(retrieved.map((r) => r.sourceName));
    const topScore = embedded[0]?.score ?? 0;
    const confidence: "low" | "medium" | "high" =
      topScore > 0.75 ? "high" : topScore > 0.55 ? "medium" : "low";

    const warnings: string[] = [];
    if (retrieved.length === 0) warnings.push("No chunks with embeddings found. Run 'Embed corpus' first.");
    if (confidence === "low") warnings.push("Low similarity — query may not match the indexed corpus.");

    const answer = composeEmbedAnswer(retrieved, embedded, confidence);

    const trace: RetrievalTrace = {
      question,
      queryTerms: [],
      searchedSourcesCount: this.sources.filter((s) => s.status === "indexed").length,
      searchedChunksCount: this.chunks.filter((c) => c.embedding !== undefined).length,
      retrievedChunks: retrieved,
      matchedBlocks: [],
      finalSources,
      confidence,
      warnings,
    };
    this.lastTrace = trace;

    const chunkTexts = embedded.map((e) => e.chunk.text);
    const evalResult: EvalResult = evaluate({
      question,
      answer,
      queryTerms: [],
      retrievedChunks: retrieved,
      chunkTexts,
    });

    return {
      answer,
      sources: finalSources,
      chunks: retrieved,
      blocks: [],
      confidence,
      trace,
      eval: evalResult,
      embed_cost_usd: queryResult.cost_usd,
    };
  }

  reset(): void {
    this.sources = [];
    this.chunks = [];
    this.blocks = [];
    this.lastTrace = null;
    this.idCounter = 0;
    clearEmbeddingCache();
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }
}

function detectFileKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "md") return "md";
  if (ext === "txt") return "txt";
  if (ext === "json") return "json";
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "code";
  return "unknown";
}

function classify(path: string, kind: FileKind, content: string): { status: SourceStatus; reason?: string } {
  for (const { pattern, reason } of SKIP_PATTERNS) {
    if (pattern.test(path)) return { status: "skipped", reason };
  }
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(ext)) return { status: "skipped", reason: `unsupported extension .${ext || "?"}` };
  if (kind === "unknown") return { status: "skipped", reason: "unknown file kind" };
  if (!content || content.length < 5) return { status: "skipped", reason: "empty content" };
  if (looksBinary(content)) return { status: "skipped", reason: "binary content" };
  return { status: "indexed" };
}

function looksBinary(content: string): boolean {
  // crude binary check: many non-printable chars in first 500 bytes
  const head = content.slice(0, 500);
  let nonPrintable = 0;
  for (let i = 0; i < head.length; i++) {
    const code = head.charCodeAt(i);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) nonPrintable += 1;
  }
  return nonPrintable / Math.max(1, head.length) > 0.1;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function composeEmbedAnswer(
  retrieved: RetrievedChunk[],
  embedded: Array<{ chunk: MemoryChunk; score: number }>,
  confidence: "low" | "medium" | "high",
): string {
  if (retrieved.length === 0) {
    return "No relevant content found. Ensure files are indexed and corpus is embedded before querying.";
  }

  const lines: string[] = [];
  const top = embedded.slice(0, 2);

  for (let i = 0; i < top.length; i++) {
    const chunk = top[i]!.chunk;
    const excerpt = chunk.text.slice(0, 280).replace(/\s+/g, " ").trim();
    lines.push(i === 0 ? excerpt : `\nAdditional context: ${excerpt}`);
  }

  const sources = unique(retrieved.map((r) => r.sourceName));
  lines.push(`\nSources: ${sources.join(", ")}.`);

  if (confidence === "low") {
    lines.push("\nConfidence: low — cosine similarity below threshold.");
  }

  return lines.join("\n");
}

function summarize(content: string, kind: FileKind): string {
  const trimmed = content.trim();
  if (kind === "md") {
    const lines = trimmed.split("\n");
    const firstHeading = lines.find((l) => l.startsWith("#"));
    const firstPara = lines.find((l) => l && !l.startsWith("#"));
    const text = `${firstHeading ? firstHeading.replace(/^#+\s+/, "") + " — " : ""}${firstPara ?? ""}`.trim();
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  }
  if (kind === "code") {
    const exportMatch = trimmed.match(/export\s+(default\s+)?(function|class|const|interface|type)\s+(\w+)/);
    if (exportMatch) return `exports ${exportMatch[3]}`;
    return `${trimmed.split("\n").length} lines of code`;
  }
  if (kind === "json") {
    return `${trimmed.split("\n").length} lines of JSON`;
  }
  return trimmed.slice(0, 160).replace(/\s+/g, " ");
}
