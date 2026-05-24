"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { RagMemoryEngine, type FileInput } from "../../src/mvp/engine";
import { SAMPLE_FILES } from "../../src/mvp/sample-files";
import type { AskResult } from "../../src/mvp/types";

// ── Pipeline configs ───────────────────────────────────────────────────────

interface PipelineConfig {
  id: string;
  label: string;
  description: string;
  filter: (files: FileInput[]) => FileInput[];
  topK: number;
  color: string;
}

const CONFIGS: PipelineConfig[] = [
  {
    id: "full-corpus",
    label: "Full corpus",
    description: "All files indexed · topK 5 · keyword + block retrieval",
    filter: (files) => files,
    topK: 5,
    color: "#58a6ff",
  },
  {
    id: "docs-only",
    label: "Docs only",
    description: "Markdown + text only · topK 5 · excludes code & config",
    filter: (files) => files.filter((f) => f.name.endsWith(".md") || f.name.endsWith(".txt")),
    topK: 5,
    color: "#3fb950",
  },
  {
    id: "code-only",
    label: "Code + config",
    description: "TypeScript + JSON only · topK 5 · excludes prose docs",
    filter: (files) =>
      files.filter(
        (f) =>
          f.name.endsWith(".ts") ||
          f.name.endsWith(".tsx") ||
          f.name.endsWith(".js") ||
          f.name.endsWith(".json"),
      ),
    topK: 5,
    color: "#d2a8ff",
  },
  {
    id: "hybrid-broad",
    label: "Hybrid broad",
    description: "All files indexed · topK 8 · wider retrieval window",
    filter: (files) => files,
    topK: 8,
    color: "#ffa657",
  },
];

// ── Engine runner ──────────────────────────────────────────────────────────

interface RunResult {
  config: PipelineConfig;
  result: AskResult;
  filesIndexed: number;
  chunksIndexed: number;
  blocksIndexed: number;
  latencyMs: number;
}

function runPipeline(config: PipelineConfig, question: string): RunResult {
  const filtered = config.filter(SAMPLE_FILES);
  const engine = new RagMemoryEngine();
  const t0 = performance.now();
  const summary = engine.ingestFiles(filtered);
  const result = engine.ask(question);
  const latencyMs = Math.round(performance.now() - t0);

  return {
    config,
    result,
    filesIndexed: summary.indexed,
    chunksIndexed: summary.chunks,
    blocksIndexed: summary.blocks,
    latencyMs,
  };
}

// ── Score bar ──────────────────────────────────────────────────────────────

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: "#21262d", borderRadius: 3, height: 4, width: "100%" }}>
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 3,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ── Pipeline column ────────────────────────────────────────────────────────

function PipelineColumn({ run, maxScore }: { run: RunResult; maxScore: number }) {
  const { config, result, filesIndexed, chunksIndexed, blocksIndexed, latencyMs } = run;
  const topChunks = result.trace.retrievedChunks.slice(0, config.topK);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        border: `1px solid ${config.color}33`,
        borderRadius: 8,
        background: "#161b22",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${config.color}33`,
          background: `${config.color}11`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: config.color,
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 14, color: config.color }}>
            {config.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#8b949e" }}>{config.description}</div>
      </div>

      {/* Metrics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
          borderBottom: "1px solid #21262d",
        }}
      >
        {[
          { label: "files", value: filesIndexed },
          { label: "chunks", value: chunksIndexed },
          { label: "blocks", value: blocksIndexed },
          { label: "ms", value: latencyMs },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{ padding: "8px 12px", textAlign: "center", borderRight: "1px solid #21262d" }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: "#e6edf3" }}>{value}</div>
            <div style={{ fontSize: 10, color: "#8b949e", textTransform: "uppercase" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Answer */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #21262d" }}>
        <div
          style={{
            fontSize: 10,
            color: "#8b949e",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 6,
          }}
        >
          Answer
        </div>
        <p
          style={{
            fontSize: 13,
            color: "#e6edf3",
            lineHeight: 1.6,
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {result.answer || <span style={{ color: "#8b949e" }}>No answer generated.</span>}
        </p>
      </div>

      {/* Retrieved chunks */}
      <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto" }}>
        <div
          style={{
            fontSize: 10,
            color: "#8b949e",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          Retrieved ({topChunks.length})
        </div>
        {topChunks.length === 0 ? (
          <p style={{ fontSize: 12, color: "#8b949e" }}>No chunks retrieved.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topChunks.map((chunk, i) => (
              <div
                key={chunk.chunkId}
                style={{
                  background: "#0d1117",
                  border: "1px solid #21262d",
                  borderRadius: 6,
                  padding: "10px 12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace" }}>
                    #{i + 1} · {chunk.sourceName}
                  </span>
                  <span style={{ fontSize: 11, color: config.color, fontWeight: 600 }}>
                    {chunk.score.toFixed(2)}
                  </span>
                </div>
                <ScoreBar value={chunk.score} max={maxScore} color={config.color} />
                <p
                  style={{
                    fontSize: 12,
                    color: "#c9d1d9",
                    margin: "8px 0 0",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {chunk.preview}
                </p>
                {chunk.matchedTerms.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {chunk.matchedTerms.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: `${config.color}22`,
                          color: config.color,
                          fontFamily: "monospace",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What is this project about?",
  "What are the main risks?",
  "What features does the playground support?",
  "How does retrieval work?",
  "What decisions were made in the architecture?",
];

export default function ComparePage() {
  const [configA, setConfigA] = useState<string>("full-corpus");
  const [configB, setConfigB] = useState<string>("docs-only");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<[RunResult, RunResult] | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    setRunning(true);
    // defer to next tick so React renders the loading state
    setTimeout(() => {
      const cfgA = CONFIGS.find((c) => c.id === configA)!;
      const cfgB = CONFIGS.find((c) => c.id === configB)!;
      const rA = runPipeline(cfgA, q);
      const rB = runPipeline(cfgB, q);
      setResults([rA, rB]);
      setRunning(false);
    }, 0);
  }, [query, configA, configB]);

  const maxScore =
    results
      ? Math.max(
          ...results[0].result.trace.retrievedChunks.map((c) => c.score),
          ...results[1].result.trace.retrievedChunks.map((c) => c.score),
          1,
        )
      : 1;

  const S = styles;

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <span style={S.navBrand}>RAG Memory Playground</span>
        <div style={S.navLinks}>
          {[
            { href: "/", label: "Home" },
            { href: "/playground", label: "Playground" },
            { href: "/compare", label: "Compare" },
            { href: "/rag-memory-playground", label: "Memory Graph" },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={S.navLink}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div style={S.container}>
        {/* Header */}
        <header style={{ marginBottom: 28 }}>
          <h1 style={S.h1}>Pipeline Comparison</h1>
          <p style={S.sub}>
            Run the same query through two pipeline configurations side-by-side. Compare retrieval
            scores, chunk coverage, and answer quality.
          </p>
        </header>

        {/* Config selectors */}
        <div style={S.configRow}>
          {(["A", "B"] as const).map((side) => {
            const value = side === "A" ? configA : configB;
            const setValue = side === "A" ? setConfigA : setConfigB;
            const cfg = CONFIGS.find((c) => c.id === value)!;
            return (
              <div key={side} style={{ flex: 1 }}>
                <div style={S.configLabel}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: cfg.color,
                      marginRight: 6,
                    }}
                  />
                  Pipeline {side}
                </div>
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  style={S.select}
                >
                  {CONFIGS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} — {c.description}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* Query input */}
        <div style={S.queryRow}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Ask a question about the sample project..."
            style={S.input}
          />
          <button onClick={run} disabled={!query.trim() || running} style={S.runBtn}>
            {running ? "Running…" : "Run"}
          </button>
        </div>

        {/* Suggestions */}
        <div style={S.suggestions}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setQuery(s)}
              style={S.chip}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Results */}
        {results ? (
          <div style={S.columns}>
            <PipelineColumn run={results[0]} maxScore={maxScore} />
            <PipelineColumn run={results[1]} maxScore={maxScore} />
          </div>
        ) : (
          <div style={S.empty}>
            Pick two pipeline configs and run a query to see side-by-side retrieval results.
          </div>
        )}

        {/* About */}
        <div style={S.about}>
          <strong>How this works:</strong> Each pipeline indexes the same{" "}
          {SAMPLE_FILES.length}-file sample project using a heuristic chunker and block
          extractor. The corpus filter (docs-only, code-only, etc.) controls what each pipeline
          sees. Retrieval scores are keyword-based with term-frequency weighting — no LLM, no
          embeddings, all in-browser.
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily:
      '-apple-system, "Segoe UI", system-ui, sans-serif',
  } as React.CSSProperties,

  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    borderBottom: "1px solid #21262d",
    background: "#161b22",
  } as React.CSSProperties,

  navBrand: {
    fontSize: 14,
    fontWeight: 600,
    color: "#58a6ff",
  } as React.CSSProperties,

  navLinks: {
    display: "flex",
    gap: 20,
  } as React.CSSProperties,

  navLink: {
    fontSize: 13,
    color: "#8b949e",
    textDecoration: "none",
  } as React.CSSProperties,

  container: {
    maxWidth: 1300,
    margin: "0 auto",
    padding: "32px 24px",
  } as React.CSSProperties,

  h1: {
    fontSize: 24,
    fontWeight: 600,
    margin: "0 0 6px",
    color: "#e6edf3",
  } as React.CSSProperties,

  sub: {
    fontSize: 14,
    color: "#8b949e",
    margin: 0,
    lineHeight: 1.5,
  } as React.CSSProperties,

  configRow: {
    display: "flex",
    gap: 16,
    marginBottom: 16,
  } as React.CSSProperties,

  configLabel: {
    fontSize: 11,
    color: "#8b949e",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 6,
  } as React.CSSProperties,

  select: {
    width: "100%",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
    color: "#e6edf3",
    cursor: "pointer",
    outline: "none",
  } as React.CSSProperties,

  queryRow: {
    display: "flex",
    gap: 10,
    marginBottom: 12,
  } as React.CSSProperties,

  input: {
    flex: 1,
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 14,
    color: "#e6edf3",
    outline: "none",
  } as React.CSSProperties,

  runBtn: {
    padding: "10px 22px",
    background: "#238636",
    border: "none",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    color: "#fff",
    cursor: "pointer",
    flexShrink: 0,
    opacity: 1,
  } as React.CSSProperties,

  suggestions: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 6,
    marginBottom: 28,
  } as React.CSSProperties,

  chip: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 20,
    padding: "4px 12px",
    fontSize: 12,
    color: "#8b949e",
    cursor: "pointer",
  } as React.CSSProperties,

  columns: {
    display: "flex",
    gap: 16,
    alignItems: "flex-start",
    minHeight: 500,
  } as React.CSSProperties,

  empty: {
    textAlign: "center" as const,
    padding: "60px 20px",
    color: "#8b949e",
    fontSize: 14,
    border: "1px dashed #30363d",
    borderRadius: 8,
  } as React.CSSProperties,

  about: {
    marginTop: 28,
    padding: "12px 16px",
    background: "#161b22",
    border: "1px solid #21262d",
    borderRadius: 6,
    fontSize: 12,
    color: "#8b949e",
    lineHeight: 1.6,
  } as React.CSSProperties,
} as const;
