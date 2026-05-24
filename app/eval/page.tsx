"use client";

import { useState } from "react";
import Link from "next/link";
import { RagMemoryEngine, type FileInput } from "../../src/mvp/engine";
import { SAMPLE_FILES } from "../../src/mvp/sample-files";

// ── Golden Q/A pairs ─────────────────────────────────────────────────────────

interface GoldenPair {
  id: string;
  question: string;
  expectedKeywords: string[]; // keywords that must appear in retrieved chunks
  expectedAnswerHints: string[]; // keywords expected in the answer text
  description: string;
}

const GOLDEN_PAIRS: GoldenPair[] = [
  {
    id: "q1",
    question: "Where does the app store its data — backend or browser?",
    expectedKeywords: ["browser", "backend", "in-browser"],
    expectedAnswerHints: ["browser", "in-browser", "no backend"],
    description: "Architecture decision retrieval",
  },
  {
    id: "q2",
    question: "What file types can be uploaded and indexed?",
    expectedKeywords: ["markdown", "json", "typescript", "text"],
    expectedAnswerHints: ["markdown", "json", "typescript"],
    description: "Feature coverage retrieval",
  },
  {
    id: "q3",
    question: "What is PromptOps and how does it relate to memory blocks?",
    expectedKeywords: ["promptops", "memory block", "prompt asset", "versioned"],
    expectedAnswerHints: ["promptops", "prompt", "memory"],
    description: "Concept linkage retrieval",
  },
  {
    id: "q4",
    question: "What are the planned roadmap features after the MVP?",
    expectedKeywords: ["roadmap", "semantic", "vector", "embedding"],
    expectedAnswerHints: ["roadmap", "next", "semantic"],
    description: "Roadmap / future plans retrieval",
  },
  {
    id: "q5",
    question: "What block types does the heuristic extractor produce?",
    expectedKeywords: ["feature", "decision", "risk", "todo", "concept"],
    expectedAnswerHints: ["feature", "decision", "risk"],
    description: "Block type enumeration retrieval",
  },
];

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scoreRelevance(chunks: string[], expected: string[]): number {
  const joined = chunks.join(" ").toLowerCase();
  const hits = expected.filter((kw) => joined.includes(kw.toLowerCase()));
  return hits.length / expected.length;
}

function scoreFaithfulness(answer: string, expected: string[]): number {
  const lower = answer.toLowerCase();
  const hits = expected.filter((kw) => lower.includes(kw.toLowerCase()));
  return hits.length / expected.length;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function tone(score: number) {
  if (score >= 0.7) return "#3fb950";
  if (score >= 0.4) return "#d29922";
  return "#f85149";
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalResult {
  pair: GoldenPair;
  answer: string;
  retrievedChunks: string[];
  relevanceScore: number;
  faithfulnessScore: number;
  overallScore: number;
  latencyMs: number;
  charsRetrieved: number;
  pass: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EvalPage() {
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filterExt, setFilterExt] = useState<string>("all");

  async function runEval() {
    setRunning(true);
    setResults([]);
    setProgress(0);

    const filterFn = (files: FileInput[]): FileInput[] => {
      if (filterExt === "all") return files;
      if (filterExt === "docs") return files.filter((f) => f.name.endsWith(".md") || f.name.endsWith(".txt"));
      if (filterExt === "code") return files.filter((f) => f.name.endsWith(".ts") || f.name.endsWith(".json"));
      return files;
    };

    const evalResults: EvalResult[] = [];

    for (let i = 0; i < GOLDEN_PAIRS.length; i++) {
      const pair = GOLDEN_PAIRS[i];
      if (!pair) continue;

      const engine = new RagMemoryEngine();
      const filtered = filterFn(SAMPLE_FILES);
      engine.ingestFiles(filtered);

      const t0 = performance.now();
      const result = engine.ask(pair.question);
      const latencyMs = Math.round(performance.now() - t0);

      const chunkTexts = result.chunks.map((c) => c.preview);
      const charsRetrieved = chunkTexts.reduce((s, t) => s + t.length, 0);
      const relevance = scoreRelevance(chunkTexts, pair.expectedKeywords);
      const faithfulness = scoreFaithfulness(result.answer, pair.expectedAnswerHints);
      const overall = (relevance + faithfulness) / 2;

      evalResults.push({
        pair,
        answer: result.answer,
        retrievedChunks: chunkTexts,
        relevanceScore: relevance,
        faithfulnessScore: faithfulness,
        overallScore: overall,
        latencyMs,
        charsRetrieved,
        pass: overall >= 0.4,
      });

      setProgress(i + 1);
      // Let React render between iterations
      await new Promise((r) => setTimeout(r, 0));
    }

    setResults(evalResults);
    setRunning(false);
  }

  const passing = results.filter((r) => r.pass).length;
  const avgRelevance = results.length > 0 ? results.reduce((s, r) => s + r.relevanceScore, 0) / results.length : 0;
  const avgFaithfulness = results.length > 0 ? results.reduce((s, r) => s + r.faithfulnessScore, 0) / results.length : 0;
  const avgLatency = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length) : 0;
  const totalChars = results.reduce((s, r) => s + r.charsRetrieved, 0);

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
            { href: "/eval", label: "Eval" },
            { href: "/rag-memory-playground", label: "Memory Graph" },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={href === "/eval" ? { ...S.navLink, color: "#e6edf3", borderBottom: "1px solid #58a6ff" } : S.navLink}>
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div style={S.container}>
        <h1 style={S.h1}>Golden Eval Suite</h1>
        <p style={S.sub}>
          {GOLDEN_PAIRS.length} Q/A pairs scored on relevance + faithfulness.
          Heuristic-only — no LLM. Pass threshold: ≥40% overall.
        </p>

        {/* Config */}
        <div style={S.configBar}>
          <label style={S.label}>
            Corpus
            <select
              value={filterExt}
              onChange={(e) => setFilterExt(e.target.value)}
              style={S.select}
            >
              <option value="all">All files ({SAMPLE_FILES.length})</option>
              <option value="docs">Docs only (.md/.txt)</option>
              <option value="code">Code only (.ts/.json)</option>
            </select>
          </label>

          <button
            onClick={runEval}
            disabled={running}
            style={{
              ...S.runBtn,
              background: running ? "#21262d" : "#238636",
              color: running ? "#8b949e" : "white",
              cursor: running ? "default" : "pointer",
            }}
          >
            {running ? `Running… ${progress}/${GOLDEN_PAIRS.length}` : "Run Eval"}
          </button>
        </div>

        {/* Progress bar */}
        {running && (
          <div style={S.progressTrack}>
            <div
              style={{
                ...S.progressFill,
                width: `${(progress / GOLDEN_PAIRS.length) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Aggregate summary */}
        {results.length > 0 && (
          <div style={S.summary}>
            <div style={S.summaryGrid}>
              <Metric label="Pass rate" value={`${passing}/${GOLDEN_PAIRS.length}`} tone={passing === GOLDEN_PAIRS.length ? "#3fb950" : passing >= 3 ? "#d29922" : "#f85149"} />
              <Metric label="Avg relevance" value={pct(avgRelevance)} tone={tone(avgRelevance)} />
              <Metric label="Avg faithfulness" value={pct(avgFaithfulness)} tone={tone(avgFaithfulness)} />
              <Metric label="Avg latency" value={`${avgLatency}ms`} tone="#8b949e" />
              <Metric label="Chars retrieved" value={totalChars.toLocaleString()} tone="#8b949e" />
            </div>
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div style={S.resultsSection}>
            {results.map((r) => (
              <EvalRow key={r.pair.id} result={r} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !running && (
          <div style={S.emptyState}>
            Configure and click Run Eval to score all {GOLDEN_PAIRS.length} golden Q/A pairs.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Metric({ label, value, tone: color }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function EvalRow({ result: r }: { result: EvalResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: `1px solid ${r.pass ? "#238636" : "#f8514933"}`,
        borderRadius: 8,
        marginBottom: 12,
        background: "#161b22",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 18, color: r.pass ? "#3fb950" : "#f85149" }}>
          {r.pass ? "✓" : "✗"}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#e6edf3", fontWeight: 500, marginBottom: 2 }}>
            {r.pair.question}
          </div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>{r.pair.description}</div>
        </div>

        <div style={{ display: "flex", gap: 16, flexShrink: 0, fontSize: 12 }}>
          <ScorePill label="rel" score={r.relevanceScore} />
          <ScorePill label="faith" score={r.faithfulnessScore} />
          <span style={{ color: "#8b949e", minWidth: 50, textAlign: "right" }}>
            {r.latencyMs}ms
          </span>
          <span style={{ color: "#8b949e", minWidth: 20, textAlign: "right" }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #21262d" }}>
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Answer
            </div>
            <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.6, background: "#0d1117", borderRadius: 6, padding: "10px 14px", marginBottom: 12 }}>
              {r.answer}
            </div>

            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Retrieved chunks ({r.retrievedChunks.length}) · {r.charsRetrieved} chars
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {r.retrievedChunks.slice(0, 3).map((chunk, i) => (
                <div
                  key={i}
                  style={{ fontSize: 12, color: "#8b949e", background: "#0d1117", borderRadius: 4, padding: "6px 10px", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {chunk.slice(0, 200)}{chunk.length > 200 ? "…" : ""}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 11, color: "#8b949e" }}>
              <span>
                Expected keywords:{" "}
                {r.pair.expectedKeywords.map((kw) => {
                  const found = r.retrievedChunks.join(" ").toLowerCase().includes(kw.toLowerCase());
                  return (
                    <span key={kw} style={{ color: found ? "#3fb950" : "#f85149", marginRight: 6 }}>
                      {kw}
                    </span>
                  );
                })}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  return (
    <span style={{ color: tone(score), minWidth: 65, textAlign: "right" }}>
      {label}: {pct(score)}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "#0d1117",
    minHeight: "100vh",
    color: "#c9d1d9",
  } as const,
  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    borderBottom: "1px solid #21262d",
    background: "#161b22",
  } as const,
  navBrand: { fontSize: 14, fontWeight: 600, color: "#e6edf3" } as const,
  navLinks: { display: "flex", gap: 20 } as const,
  navLink: {
    fontSize: 13,
    color: "#8b949e",
    textDecoration: "none",
    paddingBottom: 2,
  } as const,
  container: { maxWidth: 900, margin: "0 auto", padding: "32px 24px" } as const,
  h1: { fontSize: 22, fontWeight: 700, color: "#e6edf3", marginBottom: 6 } as const,
  sub: { fontSize: 13, color: "#8b949e", marginBottom: 24, lineHeight: 1.6 } as const,
  configBar: {
    display: "flex",
    alignItems: "flex-end",
    gap: 20,
    marginBottom: 20,
    flexWrap: "wrap" as const,
  } as const,
  label: { fontSize: 12, color: "#8b949e", display: "flex", flexDirection: "column" as const, gap: 4 } as const,
  select: {
    background: "#161b22",
    border: "1px solid #30363d",
    color: "#c9d1d9",
    padding: "6px 10px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
  } as const,
  runBtn: {
    padding: "8px 20px",
    borderRadius: 4,
    border: "none",
    fontSize: 13,
    fontWeight: 600,
    transition: "background 0.2s",
  } as const,
  progressTrack: {
    height: 3,
    background: "#21262d",
    borderRadius: 2,
    marginBottom: 20,
  } as const,
  progressFill: {
    height: "100%",
    background: "#238636",
    borderRadius: 2,
    transition: "width 0.3s ease",
  } as const,
  summary: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "20px 24px",
    marginBottom: 24,
  } as const,
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 16,
  } as const,
  resultsSection: { display: "flex", flexDirection: "column" as const } as const,
  emptyState: {
    color: "#8b949e",
    fontSize: 13,
    textAlign: "center" as const,
    padding: "60px 0",
    border: "1px dashed #30363d",
    borderRadius: 8,
  } as const,
};
