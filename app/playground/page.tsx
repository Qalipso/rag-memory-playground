/**
 * /playground — RAG Memory Playground.
 *
 * 2-tab layout:
 *   Setup  — load files, see indexed sources
 *   Explore — chunks, memory blocks, ask, trace, memory graph
 *
 * Files are synced to both the client-side MVP engine (heuristic pipeline)
 * and the server KnowledgeStore so the Memory Graph shows uploaded sources.
 */
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { RagMemoryEngine, type FileInput } from "../src/mvp/engine";
import { SAMPLE_FILES } from "../src/mvp/sample-files";
import type {
  AskResult,
  BlockType,
  ChunkType,
  EvalResult,
  MemoryBlock,
  MemoryChunk,
  RetrievalMode,
  RetrievalTrace,
  SourceFile,
} from "../src/mvp/types";

// Lazy: only bundled when Graph sub-tab is rendered.
const PipelineGraph = dynamic(() => import("./PipelineGraph"), {
  ssr: false,
  loading: () => <p style={S.empty}>Loading graph…</p>,
});

type TopTab = "setup" | "explore";
type ExploreTab = "chunks" | "blocks" | "ask" | "trace" | "graph";

const SUGGESTIONS = [
  "What is this project about?",
  "What features are described?",
  "What risks exist?",
  "What is missing in the docs?",
  "What should I build next?",
  "Where is RAG memory described?",
];

const BLOCK_COLORS: Record<BlockType, { bg: string; fg: string }> = {
  Feature:  { bg: "#1f6feb22", fg: "#79c0ff" },
  Decision: { bg: "#a371f722", fg: "#d2a8ff" },
  Risk:     { bg: "#da363322", fg: "#ff7b72" },
  Todo:     { bg: "#bf870022", fg: "#ffd479" },
  Concept:  { bg: "#1a7f3722", fg: "#7ee787" },
};

const CHUNK_TYPE_COLORS: Record<ChunkType, string> = {
  docs:    "#7ee787",
  code:    "#79c0ff",
  config:  "#ffd479",
  unknown: "#8b949e",
};

const ALLOWED_EXT = /\.(md|txt|json|ts|tsx|js|jsx)$/i;
const SKIP_PATH =
  /(^|\/)(node_modules|\.next|\.git|dist|build|out|coverage)(\/|$)|\.env(\.|$)|package-lock\.json$|pnpm-lock\.yaml$|yarn\.lock$|bun\.lockb?$/;
const MAX_BYTES = 512 * 1024;
const MAX_FILES = 1000;

export default function PlaygroundPage() {
  const [engine] = useState(() => new RagMemoryEngine());
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [chunks, setChunks] = useState<MemoryChunk[]>([]);
  const [blocks, setBlocks] = useState<MemoryBlock[]>([]);
  const [trace, setTrace] = useState<RetrievalTrace | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);

  const [topTab, setTopTab] = useState<TopTab>("setup");
  const [exploreTab, setExploreTab] = useState<ExploreTab>("chunks");
  const [syncing, setSyncing] = useState(false);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("keyword");
  const [embedStatus, setEmbedStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [embedCost, setEmbedCost] = useState(0);
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [llmFaith, setLlmFaith] = useState<{ score: number; rationale: string } | null>(null);
  const [llmFaithLoading, setLlmFaithLoading] = useState(false);

  // Chunks sub-tab filters
  const [chunkFilterSource, setChunkFilterSource] = useState<string>("all");
  const [chunkFilterType, setChunkFilterType] = useState<ChunkType | "all">("all");
  const [chunkSearch, setChunkSearch] = useState("");

  // Blocks sub-tab filter
  const [blockFilter, setBlockFilter] = useState<BlockType | "all">("all");

  const ingest = useCallback(
    (files: FileInput[]) => {
      engine.ingestFiles(files);
      setSources(engine.getSources());
      setChunks(engine.getChunks());
      setBlocks(engine.getMemoryBlocks());
      setResult(null);
      setTrace(null);
    },
    [engine],
  );

  /**
   * Upload files to the server KnowledgeStore so MemoryGraph can display them.
   * Non-fatal if server is unavailable — MVP heuristics still work.
   */
  async function syncToServer(fd: FormData): Promise<void> {
    setSyncing(true);
    try {
      await fetch("/api/rag-memory/sources/upload", { method: "POST", body: fd });
    } catch {
      // non-fatal
    } finally {
      setSyncing(false);
    }
  }

  const clearAll = useCallback(async () => {
    // Reset client-side engine.
    engine.reset();
    setSources([]);
    setChunks([]);
    setBlocks([]);
    setResult(null);
    setTrace(null);
    setTopTab("setup");
    // Reset server-side KnowledgeStore.
    try {
      await fetch("/api/rag-memory/sources", { method: "DELETE" });
    } catch {
      // non-fatal
    }
  }, [engine]);

  const loadSample = useCallback(() => {
    ingest(SAMPLE_FILES);
    // Build FormData from SAMPLE_FILES content and sync to server
    const fd = new FormData();
    let si = 0;
    for (const f of SAMPLE_FILES) {
      const key = `file_${si++}`;
      const blob = new Blob([f.content], { type: "text/plain" });
      fd.append(key, new File([blob], f.name));
      fd.append(`relativePath_${key}`, f.path ?? f.name);
    }
    void syncToServer(fd);
  }, [ingest]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const arr = Array.from(fileList);
      const filtered = arr
        .filter((f) => {
          const path =
            (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
          return ALLOWED_EXT.test(f.name) && !SKIP_PATH.test(path) && f.size <= MAX_BYTES;
        })
        .slice(0, MAX_FILES);

      const inputs: FileInput[] = await Promise.all(
        filtered.map(async (f) => ({
          name: f.name,
          path:
            (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
          content: await f.text(),
        })),
      );
      ingest(inputs);

      // Sync original File objects (no re-read needed) to server
      const fd = new FormData();
      let fi = 0;
      for (const f of filtered) {
        const key = `file_${fi++}`;
        fd.append(key, f);
        fd.append(
          `relativePath_${key}`,
          (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
        );
      }
      void syncToServer(fd);
    },
    [ingest],
  );

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setLlmFaith(null);
    try {
      if (retrievalMode === "embedding") {
        const r = await engine.askByEmbedding(q);
        setResult(r);
        setTrace(r.trace);
      } else {
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            const r = engine.ask(q);
            setResult(r);
            setTrace(r.trace);
            resolve();
          }, 50);
        });
      }
    } catch (err) {
      console.error("ask error", err);
    } finally {
      setAsking(false);
    }
  }, [engine, question, retrievalMode]);

  const askSuggestion = useCallback(
    async (q: string) => {
      setQuestion(q);
      setLlmFaith(null);
      if (retrievalMode === "embedding") {
        const r = await engine.askByEmbedding(q);
        setResult(r);
        setTrace(r.trace);
      } else {
        const r = engine.ask(q);
        setResult(r);
        setTrace(r.trace);
      }
      setTopTab("explore");
      setExploreTab("ask");
    },
    [engine, retrievalMode],
  );

  const embedCorpus = useCallback(async () => {
    setEmbedStatus("running");
    setEmbedError(null);
    try {
      const res = await engine.embedChunks();
      setEmbedCost((prev) => prev + res.cost_usd);
      setEmbedStatus("done");
    } catch (err) {
      setEmbedError(err instanceof Error ? err.message : "Embedding failed");
      setEmbedStatus("error");
    }
  }, [engine]);

  const runLLMFaithfulness = useCallback(async () => {
    if (!result) return;
    setLlmFaithLoading(true);
    try {
      const contexts = result.chunks.map((c) => c.preview);
      const res = await fetch("/api/faithfulness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: result.answer, contexts }),
      });
      const data = await res.json() as { score?: number; rationale?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Faithfulness API error");
      setLlmFaith({ score: data.score ?? 0, rationale: data.rationale ?? "" });
    } catch (err) {
      setLlmFaith({ score: -1, rationale: err instanceof Error ? err.message : "Error" });
    } finally {
      setLlmFaithLoading(false);
    }
  }, [result]);

  const goExplore = useCallback(() => {
    setTopTab("explore");
    setExploreTab("chunks");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const indexedCount = sources.filter((s) => s.status === "indexed").length;
  const skippedCount = sources.length - indexedCount;
  const hasData = sources.length > 0;

  const filteredChunks = useMemo(() => {
    const q = chunkSearch.trim().toLowerCase();
    return chunks.filter((c) => {
      if (chunkFilterSource !== "all" && c.sourceId !== chunkFilterSource) return false;
      if (chunkFilterType !== "all" && c.type !== chunkFilterType) return false;
      if (q && !c.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [chunks, chunkFilterSource, chunkFilterType, chunkSearch]);

  const filteredBlocks = useMemo(
    () => (blockFilter === "all" ? blocks : blocks.filter((b) => b.type === blockFilter)),
    [blocks, blockFilter],
  );

  return (
    <main style={S.main}>
      <header style={S.header}>
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <Link href="/" style={S.backLink}>← Home</Link>
        </div>
        <h1 style={S.h1}>RAG Memory Playground</h1>
        <p style={S.sub}>
          Files → chunks → memory blocks → ask with sources → graph. Client-side heuristic
          pipeline synced to server KnowledgeStore for the memory graph.
        </p>
      </header>

      {/* Top-level tab bar */}
      <nav style={S.topTabBar}>
        <button
          style={topTab === "setup" ? S.topTabActive : S.topTabInactive}
          onClick={() => setTopTab("setup")}
        >
          Setup{hasData ? ` · ${indexedCount} sources` : ""}
        </button>
        <button
          style={topTab === "explore" ? S.topTabActive : S.topTabInactive}
          onClick={() => setTopTab("explore")}
        >
          Explore{hasData ? ` · ${chunks.length} chunks · ${blocks.length} blocks` : ""}
        </button>
        {syncing && <span style={S.syncBadge}>syncing to graph…</span>}
      </nav>

      {/* ── Setup tab ─────────────────────────────────────────── */}
      {topTab === "setup" && (
        <SourcesPanel
          sources={sources}
          hasData={hasData}
          onLoadSample={loadSample}
          onUpload={handleFiles}
          onExplore={goExplore}
          onClear={clearAll}
        />
      )}

      {/* ── Explore tab ───────────────────────────────────────── */}
      {topTab === "explore" && (
        <div>
          {/* Sticky pipeline + sub-tab bar */}
          <div style={S.stickyBar}>
            <Pipeline
              indexed={indexedCount}
              skipped={skippedCount}
              chunks={chunks.length}
              blocks={blocks.length}
              lastChunks={result?.chunks.length ?? null}
            />
            <nav style={S.subTabBar}>
              {(["chunks", "blocks", "ask", "trace", "graph"] as const).map((t) => (
                <button
                  key={t}
                  style={exploreTab === t ? S.subTabActive : S.subTabInactive}
                  onClick={() => {
                    setExploreTab(t);
                    if (typeof window !== "undefined")
                      window.scrollTo({ top: 0, behavior: "auto" });
                  }}
                >
                  {exploreLabel(t, chunks.length, blocks.length, result?.chunks.length)}
                </button>
              ))}
            </nav>
          </div>

          {exploreTab === "chunks" && (
            <ChunksPanel
              chunks={filteredChunks}
              allChunks={chunks}
              sources={sources}
              filterSource={chunkFilterSource}
              filterType={chunkFilterType}
              search={chunkSearch}
              onFilterSource={setChunkFilterSource}
              onFilterType={setChunkFilterType}
              onSearch={setChunkSearch}
            />
          )}
          {exploreTab === "blocks" && (
            <BlocksPanel
              blocks={filteredBlocks}
              all={blocks}
              filter={blockFilter}
              onFilter={setBlockFilter}
            />
          )}
          {exploreTab === "ask" && (
            <AskPanel
              question={question}
              asking={asking}
              result={result}
              hasData={hasData}
              onQuestion={setQuestion}
              onAsk={ask}
              onSuggest={askSuggestion}
              retrievalMode={retrievalMode}
              onModeChange={(m) => { setRetrievalMode(m); setLlmFaith(null); }}
              embedStatus={embedStatus}
              embedCost={embedCost}
              embedError={embedError}
              onEmbedCorpus={embedCorpus}
              llmFaith={llmFaith}
              llmFaithLoading={llmFaithLoading}
              onLLMFaithfulness={runLLMFaithfulness}
            />
          )}
          {exploreTab === "trace" && <TracePanel trace={trace} />}
          {exploreTab === "graph" && (
            <section style={S.section}>
              <PipelineGraph sources={sources} blocks={blocks} chunks={chunks} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function exploreLabel(
  t: ExploreTab,
  c: number,
  b: number,
  last?: number | null,
): string {
  switch (t) {
    case "chunks":  return `Chunks (${c})`;
    case "blocks":  return `Blocks (${b})`;
    case "ask":     return "Ask";
    case "trace":   return last != null ? `Trace (${last})` : "Trace";
    case "graph":   return "Graph";
  }
}

// ---------- Pipeline header ----------

function Pipeline(props: {
  indexed: number;
  skipped: number;
  chunks: number;
  blocks: number;
  lastChunks: number | null;
}) {
  const items = [
    {
      label: "Sources",
      value: `${props.indexed}${props.skipped ? ` (${props.skipped} skipped)` : ""}`,
    },
    { label: "Chunks", value: String(props.chunks) },
    { label: "Blocks", value: String(props.blocks) },
    {
      label: "Last ask",
      value: props.lastChunks != null ? `${props.lastChunks} chunks` : "—",
    },
  ];
  return (
    <div style={S.pipeline}>
      {items.map((it, i) => (
        <div key={it.label} style={S.pipeStep}>
          <div style={S.pipeLabel}>{it.label}</div>
          <div style={S.pipeValue}>{it.value}</div>
          {i < items.length - 1 && <span style={S.pipeArrow}>→</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- Sources (Setup) ----------

function SourcesPanel(props: {
  sources: SourceFile[];
  hasData: boolean;
  onLoadSample: () => void;
  onUpload: (files: FileList | null) => void;
  onExplore: () => void;
  onClear: () => void;
}) {
  return (
    <section style={S.section}>
      <div style={S.row}>
        <button style={S.primaryButton} onClick={props.onLoadSample}>
          Load sample project
        </button>
        <label style={S.uploadLabel}>
          Upload files
          <input
            type="file"
            multiple
            accept=".md,.txt,.json,.ts,.tsx,.js,.jsx"
            style={{ display: "none" }}
            onChange={(e) => {
              props.onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label style={S.uploadLabel}>
          Upload folder
          <input
            type="file"
            // @ts-expect-error webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              props.onUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {props.hasData && (
          <button style={S.exploreButton} onClick={props.onExplore}>
            Explore results →
          </button>
        )}
        {props.hasData && (
          <button style={S.clearButton} onClick={props.onClear}>
            Clear all
          </button>
        )}
        <span style={S.muted}>
          .md .txt .json .ts .tsx .js .jsx · node_modules, .env, lockfiles, build output skipped
        </span>
      </div>

      {!props.hasData && (
        <p style={S.empty}>
          No files loaded. Click <strong>Load sample project</strong> for a quick demo, or
          upload your own files.
        </p>
      )}

      {props.hasData && (
        <div style={S.cardList}>
          {props.sources.map((src) => (
            <div key={src.id} style={S.sourceCard}>
              <div style={S.sourceHead}>
                <div>
                  <div style={S.sourceName}>{src.name}</div>
                  <div style={S.sourcePath}>{src.path}</div>
                </div>
                <div style={S.sourceMeta}>
                  <span style={S.tag}>{src.type}</span>
                  <span style={src.status === "indexed" ? S.statusOk : S.statusSkip}>
                    {src.status}
                  </span>
                  <span style={S.muted}>
                    {src.status === "indexed"
                      ? `${src.chunkCount} chunks`
                      : (src.skipReason ?? "")}
                  </span>
                </div>
              </div>
              {src.status === "indexed" && src.summary && (
                <div style={S.sourceSummary}>{src.summary}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Chunks ----------

function ChunksPanel(props: {
  chunks: MemoryChunk[];
  allChunks: MemoryChunk[];
  sources: SourceFile[];
  filterSource: string;
  filterType: ChunkType | "all";
  search: string;
  onFilterSource: (v: string) => void;
  onFilterType: (v: ChunkType | "all") => void;
  onSearch: (v: string) => void;
}) {
  if (props.allChunks.length === 0) {
    return (
      <section style={S.section}>
        <p style={S.empty}>No chunks yet. Load files in Setup first.</p>
      </section>
    );
  }
  const indexedSources = props.sources.filter((s) => s.status === "indexed");
  return (
    <section style={S.section}>
      <div style={S.filterRow}>
        <label style={S.filterLabel}>
          Source
          <select
            style={S.input}
            value={props.filterSource}
            onChange={(e) => props.onFilterSource(e.target.value)}
          >
            <option value="all">all</option>
            {indexedSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={S.filterLabel}>
          Type
          <select
            style={S.input}
            value={props.filterType}
            onChange={(e) => props.onFilterType(e.target.value as ChunkType | "all")}
          >
            <option value="all">all</option>
            <option value="docs">docs</option>
            <option value="code">code</option>
            <option value="config">config</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
        <label style={{ ...S.filterLabel, flex: 1 }}>
          Search
          <input
            style={S.input}
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="search in chunk text…"
          />
        </label>
        <div style={S.countBadge}>
          {props.chunks.length} / {props.allChunks.length}
        </div>
      </div>

      <div style={S.cardList}>
        {props.chunks.map((c) => (
          <div key={c.id} style={S.chunkCard}>
            <div style={S.chunkHead}>
              <code style={S.chunkId}>{c.id}</code>
              <span style={S.muted}>· {c.sourceName}</span>
              <span style={{ ...S.tag, color: CHUNK_TYPE_COLORS[c.type] }}>{c.type}</span>
              <span style={S.muted}>
                {c.charCount} chars · ~{Math.round(c.charCount / 4)} tokens
              </span>
            </div>
            <pre style={S.chunkText}>{truncate(c.text, 480)}</pre>
            {c.keywords.length > 0 && (
              <div style={S.keywordRow}>
                {c.keywords.slice(0, 8).map((k) => (
                  <span key={k} style={S.keywordChip}>
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Memory Blocks ----------

function BlocksPanel(props: {
  blocks: MemoryBlock[];
  all: MemoryBlock[];
  filter: BlockType | "all";
  onFilter: (v: BlockType | "all") => void;
}) {
  if (props.all.length === 0) {
    return (
      <section style={S.section}>
        <p style={S.empty}>No memory blocks yet. Load files in Setup first.</p>
      </section>
    );
  }
  const counts = countByType(props.all);
  return (
    <section style={S.section}>
      <div style={S.filterChips}>
        <button
          style={props.filter === "all" ? S.chipActive : S.chip}
          onClick={() => props.onFilter("all")}
        >
          all ({props.all.length})
        </button>
        {(["Feature", "Decision", "Risk", "Todo", "Concept"] as const).map((t) => (
          <button
            key={t}
            style={
              props.filter === t
                ? { ...S.chipActive, ...colorChip(t) }
                : { ...S.chip, ...colorChip(t) }
            }
            onClick={() => props.onFilter(t)}
          >
            {t} ({counts[t] ?? 0})
          </button>
        ))}
      </div>

      <div style={S.cardList}>
        {props.blocks.map((b) => (
          <div key={b.id} style={S.blockCard}>
            <div style={S.blockHead}>
              <span style={S.blockBadge(b.type)}>{b.type}</span>
              <strong style={S.blockTitle}>{b.title}</strong>
              <span style={S.confidence(b.confidence)}>conf {b.confidence.toFixed(2)}</span>
            </div>
            <div style={S.blockSummary}>{b.summary}</div>
            {b.evidence.length > 0 && (
              <div style={S.evidenceBox}>
                {b.evidence.map((e, i) => (
                  <div key={i} style={S.evidence}>
                    "{e}"
                  </div>
                ))}
              </div>
            )}
            <div style={S.blockMeta}>
              <span style={S.muted}>sources:</span>
              {b.sources.map((s) => (
                <span key={s} style={S.tag}>
                  {s}
                </span>
              ))}
              <span style={S.muted}>· chunks:</span>
              {b.chunkIds.map((c) => (
                <code key={c} style={S.chunkId}>
                  {c}
                </code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Ask ----------

function AskPanel(props: {
  question: string;
  asking: boolean;
  result: AskResult | null;
  hasData: boolean;
  onQuestion: (v: string) => void;
  onAsk: () => void;
  onSuggest: (q: string) => void;
  retrievalMode: RetrievalMode;
  onModeChange: (m: RetrievalMode) => void;
  embedStatus: "idle" | "running" | "done" | "error";
  embedCost: number;
  embedError: string | null;
  onEmbedCorpus: () => void;
  llmFaith: { score: number; rationale: string } | null;
  llmFaithLoading: boolean;
  onLLMFaithfulness: () => void;
}) {
  const isEmbedMode = props.retrievalMode === "embedding";
  const corpusReady = props.embedStatus === "done";

  return (
    <section style={S.section}>
      {!props.hasData && (
        <p style={S.empty}>No data loaded. Go to Setup and load files first.</p>
      )}

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#8b949e" }}>Retrieval:</span>
        {(["keyword", "embedding"] as RetrievalMode[]).map((m) => (
          <button
            key={m}
            style={{
              padding: "4px 12px",
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${props.retrievalMode === m ? "#58a6ff" : "#30363d"}`,
              background: props.retrievalMode === m ? "#1f6feb33" : "transparent",
              color: props.retrievalMode === m ? "#58a6ff" : "#8b949e",
              cursor: "pointer",
            }}
            onClick={() => props.onModeChange(m)}
          >
            {m}
          </button>
        ))}
        {isEmbedMode && (
          <button
            style={{
              padding: "4px 12px",
              fontSize: 12,
              borderRadius: 4,
              border: `1px solid ${corpusReady ? "#3fb950" : "#f0883e"}`,
              background: corpusReady ? "#1a7f3722" : "#bf870022",
              color: corpusReady ? "#3fb950" : "#f0883e",
              cursor: props.embedStatus === "running" ? "not-allowed" : "pointer",
            }}
            disabled={!props.hasData || props.embedStatus === "running"}
            onClick={props.onEmbedCorpus}
          >
            {props.embedStatus === "running"
              ? "Embedding…"
              : corpusReady
              ? `Corpus embedded${props.embedCost > 0 ? ` ($${props.embedCost.toFixed(5)})` : ""}`
              : "Embed corpus"}
          </button>
        )}
        {isEmbedMode && props.embedError && (
          <span style={{ fontSize: 11, color: "#ff7b72" }}>{props.embedError}</span>
        )}
        {isEmbedMode && !corpusReady && props.embedStatus !== "running" && props.embedStatus !== "error" && (
          <span style={{ fontSize: 11, color: "#8b949e" }}>← embed before querying</span>
        )}
      </div>

      <div style={S.askRow}>
        <input
          style={{ ...S.input, flex: 1 }}
          value={props.question}
          onChange={(e) => props.onQuestion(e.target.value)}
          placeholder={
            isEmbedMode
              ? "Ask a question (embedding retrieval)…"
              : "Ask a question about the loaded sources…"
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onAsk();
          }}
          disabled={!props.hasData || props.asking || (isEmbedMode && !corpusReady)}
        />
        <button
          style={S.primaryButton}
          onClick={props.onAsk}
          disabled={
            !props.hasData ||
            props.asking ||
            !props.question.trim() ||
            (isEmbedMode && !corpusReady)
          }
        >
          {props.asking ? (isEmbedMode ? "Embedding query…" : "Searching…") : "Ask"}
        </button>
      </div>

      {!isEmbedMode && (
        <div style={S.suggestRow}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              style={S.chip}
              disabled={!props.hasData}
              onClick={() => props.onSuggest(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {props.result && (
        <div style={S.answerBox}>
          <div style={S.answerHead}>
            <strong>Answer</strong>
            <span style={{ fontSize: 11, color: "#8b949e", marginLeft: 8 }}>
              [{isEmbedMode ? "embedding" : "keyword"}]
            </span>
            <span style={S.confidenceTag(props.result.confidence)}>
              confidence: {props.result.confidence}
            </span>
          </div>
          <pre style={S.answerText}>{props.result.answer}</pre>

          {props.result.sources.length > 0 && (
            <div style={S.sourcesBox}>
              <div style={S.muted}>Sources used:</div>
              <div style={S.tagRow}>
                {props.result.sources.map((s) => (
                  <span key={s} style={S.tag}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {props.result.blocks.length > 0 && (
            <div style={S.sourcesBox}>
              <div style={S.muted}>Memory blocks matched:</div>
              <div style={S.tagRow}>
                {props.result.blocks.map((b) => (
                  <span key={b.id} style={S.blockBadge(b.type)}>
                    {b.type}: {b.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {props.result.eval && (
            <div style={S.sourcesBox}>
              <EvalScorecard ev={props.result.eval} />
            </div>
          )}

          {/* LLM Faithfulness judge */}
          <div style={{ marginTop: 12 }}>
            <button
              style={{
                padding: "4px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid #30363d",
                background: "transparent",
                color: "#8b949e",
                cursor: props.llmFaithLoading ? "not-allowed" : "pointer",
              }}
              disabled={props.llmFaithLoading}
              onClick={props.onLLMFaithfulness}
            >
              {props.llmFaithLoading ? "Scoring…" : "Score faithfulness with real LLM"}
            </button>

            {props.llmFaith && props.llmFaith.score >= 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: "10px 14px",
                  background: "#161b22",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#8b949e", fontWeight: 600 }}>
                    LLM FAITHFULNESS (GPT-4o-mini)
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        props.llmFaith.score >= 0.7
                          ? "#3fb950"
                          : props.llmFaith.score >= 0.4
                          ? "#f0883e"
                          : "#ff7b72",
                    }}
                  >
                    {props.llmFaith.score.toFixed(2)}
                  </span>
                </div>
                <div style={{ color: "#8b949e", fontSize: 12 }}>{props.llmFaith.rationale}</div>
              </div>
            )}

            {props.llmFaith && props.llmFaith.score < 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#ff7b72" }}>
                {props.llmFaith.rationale}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- Trace ----------

function TracePanel(props: { trace: RetrievalTrace | null }) {
  if (!props.trace) {
    return (
      <section style={S.section}>
        <p style={S.empty}>No retrieval yet. Ask a question first.</p>
      </section>
    );
  }
  const t = props.trace;
  return (
    <section style={S.section}>
      <div style={S.traceRow}>
        <div style={S.muted}>Question</div>
        <div style={S.traceValue}>"{t.question}"</div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Query terms ({t.queryTerms.length})</div>
        <div style={S.tagRow}>
          {t.queryTerms.length === 0 && (
            <span style={S.muted}>(none after filtering)</span>
          )}
          {t.queryTerms.map((term) => (
            <code key={term} style={S.code}>
              {term}
            </code>
          ))}
        </div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Searched</div>
        <div style={S.mono}>
          {t.searchedSourcesCount} sources · {t.searchedChunksCount} chunks
        </div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Top retrieved chunks ({t.retrievedChunks.length})</div>
        <div>
          {t.retrievedChunks.length === 0 && (
            <span style={S.muted}>(no chunks matched)</span>
          )}
          {t.retrievedChunks.map((r) => (
            <div key={r.chunkId} style={S.traceChunk}>
              <div>
                <code style={S.chunkId}>{r.chunkId}</code>
                <span style={S.muted}> · {r.sourceName} · </span>
                <span style={S.score}>{r.score.toFixed(2)}</span>
                <span style={S.muted}> · matched: </span>
                {r.matchedTerms.map((m) => (
                  <code key={m} style={S.code}>
                    {m}
                  </code>
                ))}
              </div>
              <div style={S.snippet}>{r.preview}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Matched blocks ({t.matchedBlocks.length})</div>
        <div style={S.tagRow}>
          {t.matchedBlocks.length === 0 && (
            <span style={S.muted}>(no blocks matched)</span>
          )}
          {t.matchedBlocks.map((b) => (
            <span key={b.id} style={S.blockBadge(b.type)}>
              {b.type}: {b.title} ({b.score.toFixed(1)})
            </span>
          ))}
        </div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Final sources</div>
        <div style={S.tagRow}>
          {t.finalSources.length === 0 && <span style={S.muted}>(none)</span>}
          {t.finalSources.map((s) => (
            <span key={s} style={S.tag}>
              {s}
            </span>
          ))}
        </div>
      </div>
      <div style={S.traceRow}>
        <div style={S.muted}>Confidence</div>
        <div style={S.confidenceTag(t.confidence)}>{t.confidence}</div>
      </div>
      {t.warnings.length > 0 && (
        <div style={S.warnBox}>
          <div style={S.muted}>Warnings</div>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {t.warnings.map((w, i) => (
              <li key={i} style={{ color: "#ffd479" }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- Eval Scorecard ----------

const EVAL_METRICS: Array<{ key: keyof EvalResult; label: string; tip: string }> = [
  { key: "faithfulness",      label: "Faithfulness",       tip: "Answer grounded in retrieved context" },
  { key: "answerRelevancy",   label: "Answer Relevancy",   tip: "Answer addresses the question" },
  { key: "contextPrecision",  label: "Context Precision",  tip: "Retrieved chunks are on-topic" },
  { key: "contextRecall",     label: "Context Recall",     tip: "Context covers question's info need" },
];

function EvalScorecard({ ev }: { ev: EvalResult }) {
  return (
    <div style={S.evalCard}>
      <div style={S.evalHead}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#8b949e", letterSpacing: "0.04em" }}>
          RAGAS EVAL
        </span>
        <span style={S.evalOverall(ev.overall)}>
          overall {ev.overall.toFixed(2)}
        </span>
      </div>
      <div style={S.evalGrid}>
        {EVAL_METRICS.map((m) => {
          const val = ev[m.key] as number;
          return (
            <div key={m.key} style={S.evalRow}>
              <div style={S.evalLabel} title={m.tip}>{m.label}</div>
              <div style={S.evalBarTrack}>
                <div style={S.evalBar(val)} />
              </div>
              <div style={S.evalScore(val)}>{val.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Helpers ----------

function countByType(blocks: MemoryBlock[]): Record<BlockType, number> {
  const out: Record<BlockType, number> = {
    Feature: 0,
    Decision: 0,
    Risk: 0,
    Todo: 0,
    Concept: 0,
  };
  for (const b of blocks) out[b.type] += 1;
  return out;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function colorChip(t: BlockType): React.CSSProperties {
  return { color: BLOCK_COLORS[t].fg, border: `1px solid ${BLOCK_COLORS[t].fg}` };
}

// ---------- Styles ----------

const S = {
  main: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "transparent",
    color: "#e6edf3",
    padding: 0,
  } as const,
  header: { marginBottom: 16 } as const,
  backLink: {
    display: "inline-block",
    color: "#79c0ff",
    textDecoration: "none",
    fontSize: 12,
    marginBottom: 8,
  } as const,
  h1: { fontSize: 24, marginBottom: 4 } as const,
  sub: { color: "#8b949e", fontSize: 13, lineHeight: 1.5 } as const,

  // Top-level tabs
  topTabBar: {
    display: "flex",
    gap: 4,
    alignItems: "center",
    marginBottom: 16,
    borderBottom: "1px solid #30363d",
    paddingBottom: 0,
  } as const,
  topTabActive: {
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    borderBottom: "1px solid #161b22",
    padding: "10px 20px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    borderRadius: "6px 6px 0 0",
    marginBottom: -1,
    fontFamily: "inherit",
  } as const,
  topTabInactive: {
    background: "transparent",
    color: "#8b949e",
    border: "1px solid transparent",
    padding: "10px 20px",
    cursor: "pointer",
    fontSize: 14,
    borderRadius: "6px 6px 0 0",
    fontFamily: "inherit",
  } as const,
  syncBadge: {
    marginLeft: 8,
    color: "#ffd479",
    fontSize: 11,
    background: "#3a2814",
    padding: "2px 8px",
    borderRadius: 3,
  } as const,

  // Explore: sticky pipeline + sub-tabs
  stickyBar: {
    position: "sticky",
    top: 0,
    background: "#0d1117",
    paddingTop: 12,
    paddingBottom: 0,
    zIndex: 10,
    marginBottom: 14,
    borderBottom: "1px solid #30363d",
  } as const,
  pipeline: {
    display: "flex",
    gap: 8,
    alignItems: "stretch",
    marginBottom: 10,
    flexWrap: "wrap",
  } as const,
  pipeStep: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#161b22",
    border: "1px solid #30363d",
    padding: "10px 14px",
    borderRadius: 6,
  } as const,
  pipeLabel: { color: "#8b949e", fontSize: 11 } as const,
  pipeValue: { fontSize: 14, fontWeight: 600 } as const,
  pipeArrow: { color: "#30363d", marginLeft: 6 } as const,

  subTabBar: {
    display: "flex",
    gap: 4,
    marginBottom: 0,
  } as const,
  subTabActive: {
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    borderBottom: "1px solid #161b22",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: "6px 6px 0 0",
    marginBottom: -1,
    fontFamily: "inherit",
  } as const,
  subTabInactive: {
    background: "transparent",
    color: "#8b949e",
    border: "1px solid transparent",
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 13,
    borderRadius: "6px 6px 0 0",
    fontFamily: "inherit",
  } as const,

  section: {
    background: "#161b22",
    padding: 18,
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid #30363d",
  } as const,
  row: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
  } as const,
  empty: { color: "#8b949e", fontSize: 14, padding: "12px 0" } as const,

  primaryButton: {
    background: "#238636",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
  } as const,
  exploreButton: {
    background: "#1f6feb",
    color: "white",
    border: "none",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
    fontWeight: 600,
  } as const,
  clearButton: {
    background: "transparent",
    color: "#ff7b72",
    border: "1px solid #ff7b7244",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
  } as const,
  uploadLabel: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "8px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
  } as const,

  cardList: { display: "flex", flexDirection: "column", gap: 10 } as const,
  sourceCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  sourceHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } as const,
  sourceName: { fontSize: 14, fontWeight: 600 } as const,
  sourcePath: { fontSize: 11, color: "#8b949e", marginTop: 2 } as const,
  sourceMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  } as const,
  sourceSummary: { marginTop: 8, fontSize: 13, color: "#c9d1d9", lineHeight: 1.5 } as const,

  filterRow: {
    display: "flex",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
    alignItems: "flex-end",
  } as const,
  filterLabel: {
    display: "flex",
    flexDirection: "column",
    fontSize: 11,
    color: "#8b949e",
    gap: 4,
  } as const,
  countBadge: {
    color: "#8b949e",
    fontSize: 12,
    alignSelf: "flex-end",
    paddingBottom: 8,
  } as const,
  input: {
    background: "#0d1117",
    color: "#e6edf3",
    border: "1px solid #30363d",
    padding: "6px 10px",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 13,
  } as const,

  chunkCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  chunkHead: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 6,
    flexWrap: "wrap",
  } as const,
  chunkId: {
    background: "#21262d",
    color: "#79c0ff",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
  } as const,
  chunkText: {
    margin: 0,
    fontSize: 12,
    color: "#c9d1d9",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    maxHeight: 200,
    overflow: "auto",
  } as const,
  keywordRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 } as const,
  keywordChip: {
    background: "#21262d",
    color: "#8b949e",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 11,
  } as const,

  filterChips: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 } as const,
  chip: {
    background: "transparent",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "4px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  } as const,
  chipActive: {
    background: "#21262d",
    color: "#e6edf3",
    border: "1px solid #58a6ff",
    padding: "4px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  } as const,

  blockCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
  } as const,
  blockHead: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
  } as const,
  blockTitle: { fontSize: 14, flex: 1, minWidth: 200 } as const,
  blockBadge: (type: BlockType) =>
    ({
      background: BLOCK_COLORS[type].bg,
      color: BLOCK_COLORS[type].fg,
      border: `1px solid ${BLOCK_COLORS[type].fg}`,
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
    }) as const,
  blockSummary: { fontSize: 13, color: "#c9d1d9", lineHeight: 1.5, marginBottom: 10 } as const,
  evidenceBox: {
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } as const,
  evidence: {
    fontSize: 12,
    color: "#8b949e",
    fontStyle: "italic",
    lineHeight: 1.5,
  } as const,
  blockMeta: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap",
    fontSize: 11,
  } as const,
  confidence: (c: number) =>
    ({
      background: c >= 0.75 ? "#1a7f37" : c >= 0.55 ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "1px 8px",
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 600,
    }) as const,
  confidenceTag: (level: "low" | "medium" | "high") =>
    ({
      background:
        level === "high" ? "#1a7f37" : level === "medium" ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "2px 10px",
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 600,
    }) as const,

  askRow: { display: "flex", gap: 8, marginBottom: 12 } as const,
  suggestRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 16,
  } as const,
  answerBox: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
  } as const,
  answerHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  } as const,
  answerText: {
    margin: 0,
    fontSize: 13,
    color: "#e6edf3",
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    fontFamily: "inherit",
  } as const,
  sourcesBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: "1px solid #21262d",
  } as const,
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 } as const,

  traceRow: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 0",
    borderBottom: "1px solid #21262d",
  } as const,
  traceValue: { fontSize: 14 } as const,
  traceChunk: {
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  } as const,
  warnBox: {
    background: "#3a2814",
    padding: 10,
    borderRadius: 4,
    marginTop: 10,
  } as const,

  tag: {
    background: "#21262d",
    color: "#c9d1d9",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: 11,
  } as const,
  statusOk: {
    background: "#1a7f37",
    color: "white",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
  } as const,
  statusSkip: {
    background: "#6e7681",
    color: "white",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: 11,
  } as const,
  score: {
    background: "#1f6feb",
    color: "white",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
  } as const,
  code: {
    background: "#21262d",
    color: "#79c0ff",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
    marginRight: 4,
    display: "inline-block",
  } as const,
  mono: { fontFamily: "inherit", fontSize: 12, color: "#c9d1d9" } as const,
  muted: { color: "#8b949e", fontSize: 12 } as const,
  snippet: { color: "#c9d1d9", fontSize: 12, marginTop: 6, lineHeight: 1.5 } as const,

  // Eval scorecard
  evalCard: {
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 6,
    padding: 12,
  } as const,
  evalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  } as const,
  evalOverall: (v: number) =>
    ({
      background: v >= 0.7 ? "#1a7f37" : v >= 0.4 ? "#bf8700" : "#6e3630",
      color: "white",
      padding: "2px 10px",
      borderRadius: 3,
      fontSize: 12,
      fontWeight: 700,
    }) as React.CSSProperties,
  evalGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } as const,
  evalRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } as const,
  evalLabel: {
    width: 140,
    fontSize: 11,
    color: "#8b949e",
    flexShrink: 0,
    cursor: "help",
  } as const,
  evalBarTrack: {
    flex: 1,
    height: 6,
    background: "#21262d",
    borderRadius: 3,
    overflow: "hidden",
  } as const,
  evalBar: (v: number) =>
    ({
      width: `${Math.round(v * 100)}%`,
      height: "100%",
      background: v >= 0.7 ? "#238636" : v >= 0.4 ? "#d29922" : "#da3633",
      borderRadius: 3,
      transition: "width 0.3s ease",
    }) as React.CSSProperties,
  evalScore: (v: number) =>
    ({
      width: 34,
      fontSize: 11,
      fontWeight: 700,
      textAlign: "right",
      color: v >= 0.7 ? "#7ee787" : v >= 0.4 ? "#ffd479" : "#ff7b72",
      flexShrink: 0,
    }) as React.CSSProperties,
};
