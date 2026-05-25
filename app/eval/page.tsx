"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { RagMemoryEngine, type FileInput } from "../src/mvp/engine";
import { SAMPLE_FILES } from "../src/mvp/sample-files";

// ── Golden Q/A pairs ─────────────────────────────────────────────────────────

interface GoldenPair {
  id: string;
  question: string;
  expectedKeywords: string[];
  expectedAnswerHints: string[];
  description: string;
}

const DEFAULT_PAIRS: GoldenPair[] = [
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

const LS_KEY = "rag-eval-golden-pairs";

function loadPairs(): GoldenPair[] {
  if (typeof window === "undefined") return DEFAULT_PAIRS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as GoldenPair[];
  } catch {}
  return DEFAULT_PAIRS;
}

function savePairs(pairs: GoldenPair[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(pairs)); } catch {}
}

function newPair(): GoldenPair {
  return {
    id: `q${Date.now()}`,
    question: "",
    expectedKeywords: [],
    expectedAnswerHints: [],
    description: "",
  };
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scoreRelevance(chunks: string[], expected: string[]): number {
  if (expected.length === 0) return 0;
  const joined = chunks.join(" ").toLowerCase();
  const hits = expected.filter((kw) => joined.includes(kw.toLowerCase()));
  return hits.length / expected.length;
}

function scoreFaithfulness(answer: string, expected: string[]): number {
  if (expected.length === 0) return 0;
  const lower = answer.toLowerCase();
  const hits = expected.filter((kw) => lower.includes(kw.toLowerCase()));
  return hits.length / expected.length;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function tone(score: number): string {
  if (score >= 0.7) return "#3fb950";
  if (score >= 0.4) return "#d29922";
  return "#f85149";
}

function fileExt(name: string): string {
  return name.split(".").pop() ?? "?";
}

function extColor(ext: string): string {
  if (ext === "md" || ext === "txt") return "#f78166";
  if (ext === "ts" || ext === "tsx") return "#79c0ff";
  if (ext === "json") return "#ffd479";
  return "#8b949e";
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
  const [pairs, setPairs] = useState<GoldenPair[]>(DEFAULT_PAIRS);
  const [editMode, setEditMode] = useState(false);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  // Load from localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    setPairs(loadPairs());
  }, []);

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    new Set(SAMPLE_FILES.map((f) => f.name)),
  );

  function toggleFile(name: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelectedFiles(new Set(SAMPLE_FILES.map((f) => f.name)));
  }

  function selectNone() {
    setSelectedFiles(new Set());
  }

  // ── Pair editing ────────────────────────────────────────────────────────────

  function updatePair(id: string, patch: Partial<GoldenPair>) {
    setPairs((prev) => {
      const next = prev.map((p) => p.id === id ? { ...p, ...patch } : p);
      savePairs(next);
      return next;
    });
  }

  function addPair() {
    setPairs((prev) => {
      const next = [...prev, newPair()];
      savePairs(next);
      return next;
    });
  }

  function deletePair(id: string) {
    setPairs((prev) => {
      const next = prev.filter((p) => p.id !== id);
      savePairs(next);
      return next;
    });
  }

  function resetToDefaults() {
    savePairs(DEFAULT_PAIRS);
    setPairs(DEFAULT_PAIRS);
  }

  // ── Run eval ────────────────────────────────────────────────────────────────

  async function runEval() {
    const validPairs = pairs.filter((p) => p.question.trim());
    if (selectedFiles.size === 0 || validPairs.length === 0) return;
    setRunning(true);
    setResults([]);
    setProgress(0);
    setEditMode(false);

    const corpus: FileInput[] = SAMPLE_FILES.filter((f) => selectedFiles.has(f.name));
    const evalResults: EvalResult[] = [];

    for (let i = 0; i < validPairs.length; i++) {
      const pair = validPairs[i];
      if (!pair) continue;

      const engine = new RagMemoryEngine();
      engine.ingestFiles(corpus);

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
      await new Promise((r) => setTimeout(r, 0));
    }

    setResults(evalResults);
    setRunning(false);
  }

  const validPairs = pairs.filter((p) => p.question.trim());
  const passing = results.filter((r) => r.pass).length;
  const avgRelevance = results.length > 0 ? results.reduce((s, r) => s + r.relevanceScore, 0) / results.length : 0;
  const avgFaithfulness = results.length > 0 ? results.reduce((s, r) => s + r.faithfulnessScore, 0) / results.length : 0;
  const avgLatency = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length) : 0;

  return (
    <div style={S.page}>
      {/* Nav */}
      <nav style={S.nav}>
        <span style={S.navBrand}>RAG Memory Playground</span>
        <div style={S.navLinks}>
          {[
            { href: "/", label: "Home" },
            { href: "/playground", label: "Playground" },
            { href: "/eval", label: "Eval" },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={href === "/eval" ? { ...S.navLink, color: "#e6edf3", borderBottom: "1px solid #58a6ff" } : S.navLink}
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>

      <div style={S.container}>
        <div style={S.pageHeader}>
          <div>
            <h1 style={S.h1}>Golden Eval Suite</h1>
            <p style={S.sub}>
              {validPairs.length} Q/A pairs · heuristic scoring · no LLM · pass ≥ 40% overall
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setEditMode((v) => !v)}
              style={{
                ...S.runBtn,
                background: editMode ? "#1f3d2e" : "#21262d",
                color: editMode ? "#3fb950" : "#8b949e",
                border: editMode ? "1px solid #2ea04344" : "1px solid #30363d",
                cursor: "pointer",
              }}
            >
              {editMode ? "Done editing" : "Edit pairs"}
            </button>
            <button
              onClick={runEval}
              disabled={running || selectedFiles.size === 0 || validPairs.length === 0}
              style={{
                ...S.runBtn,
                background: running || selectedFiles.size === 0 || validPairs.length === 0 ? "#21262d" : "#238636",
                color: running || selectedFiles.size === 0 || validPairs.length === 0 ? "#8b949e" : "white",
                cursor: running || selectedFiles.size === 0 || validPairs.length === 0 ? "default" : "pointer",
                border: "none",
              }}
            >
              {running ? `Running ${progress}/${validPairs.length}…` : "Run Eval"}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {running && (
          <div style={S.progressTrack}>
            <div style={{ ...S.progressFill, width: `${(progress / validPairs.length) * 100}%` }} />
          </div>
        )}

        <div style={S.layout}>
          {/* Left sidebar */}
          <aside style={S.sidebar}>
            <div style={S.sidebarHead}>
              <span style={S.sideLabel}>CORPUS</span>
              <div style={S.sideBtns}>
                <button style={S.tinyBtn} onClick={selectAll}>all</button>
                <button style={S.tinyBtn} onClick={selectNone}>none</button>
              </div>
            </div>
            <div style={S.fileList}>
              {SAMPLE_FILES.map((f) => {
                const ext = fileExt(f.name);
                const checked = selectedFiles.has(f.name);
                return (
                  <label key={f.name} style={{ ...S.fileRow, opacity: checked ? 1 : 0.45 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFile(f.name)}
                      style={{ accentColor: "#238636", flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, fontSize: 12, color: "#c9d1d9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.name}
                    </span>
                    <span style={{ ...S.extBadge, color: extColor(ext), borderColor: extColor(ext) + "55" }}>
                      {ext}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={S.fileCount}>{selectedFiles.size} / {SAMPLE_FILES.length} files selected</div>

            {/* Golden pairs list */}
            <div style={{ ...S.sidebarHead, marginTop: 20 }}>
              <span style={S.sideLabel}>GOLDEN PAIRS</span>
              <span style={{ fontSize: 11, color: "#8b949e" }}>{validPairs.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pairs.map((p, i) => {
                const res = results.find((r) => r.pair.id === p.id);
                const valid = p.question.trim().length > 0;
                return (
                  <div key={p.id} style={S.pairChip(res, valid)}>
                    <span style={S.pairNum}>{i + 1}</span>
                    <span style={{ fontSize: 11, color: valid ? "#c9d1d9" : "#8b949e", lineHeight: 1.4, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.description || p.question.slice(0, 30) || "empty"}
                    </span>
                    {res && (
                      <span style={{ fontSize: 11, color: tone(res.overallScore), marginLeft: "auto", flexShrink: 0 }}>
                        {pct(res.overallScore)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Right: edit mode or results */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {editMode ? (
              <EditPanel
                pairs={pairs}
                onUpdate={updatePair}
                onAdd={addPair}
                onDelete={deletePair}
                onReset={resetToDefaults}
              />
            ) : (
              <>
                {results.length > 0 && (
                  <div style={S.summary}>
                    <div style={S.summaryGrid}>
                      <Metric label="Pass rate" value={`${passing}/${validPairs.length}`} color={passing === validPairs.length ? "#3fb950" : passing >= 3 ? "#d29922" : "#f85149"} />
                      <Metric label="Avg relevance" value={pct(avgRelevance)} color={tone(avgRelevance)} />
                      <Metric label="Avg faithfulness" value={pct(avgFaithfulness)} color={tone(avgFaithfulness)} />
                      <Metric label="Avg latency" value={`${avgLatency}ms`} color="#8b949e" />
                    </div>
                  </div>
                )}

                {results.length > 0 && results.map((r) => (
                  <EvalRow key={r.pair.id} result={r} />
                ))}

                {results.length === 0 && !running && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <p style={{ fontSize: 12, color: "#8b949e", marginBottom: 4 }}>
                      Select corpus files and click <strong style={{ color: "#e6edf3" }}>Run Eval</strong> to score these {validPairs.length} pairs:
                    </p>
                    {pairs.map((p, i) => (
                      <div key={p.id} style={{ ...S.previewCard, opacity: p.question.trim() ? 1 : 0.45 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <span style={S.pairNum}>{i + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: "#e6edf3", marginBottom: 4 }}>
                              {p.question || <em style={{ color: "#8b949e" }}>no question yet</em>}
                            </div>
                            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6 }}>{p.description}</div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {p.expectedKeywords.map((kw) => (
                                <span key={kw} style={S.kwChip}>{kw}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ── Edit panel ────────────────────────────────────────────────────────────────

interface EditPanelProps {
  pairs: GoldenPair[];
  onUpdate: (id: string, patch: Partial<GoldenPair>) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReset: () => void;
}

function EditPanel({ pairs, onUpdate, onAdd, onDelete, onReset }: EditPanelProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 12, color: "#8b949e" }}>
          Edit pairs below. Changes save automatically to localStorage.
        </p>
        <button
          onClick={onReset}
          style={{ ...E.ghostBtn, color: "#f85149", borderColor: "#f8514933" }}
        >
          Reset to defaults
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pairs.map((p, i) => (
          <PairEditor key={p.id} pair={p} index={i} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>

      <button onClick={onAdd} style={{ ...E.addBtn, marginTop: 12 }}>
        + Add pair
      </button>
    </div>
  );
}

function PairEditor({
  pair, index, onUpdate, onDelete,
}: {
  pair: GoldenPair;
  index: number;
  onUpdate: (id: string, patch: Partial<GoldenPair>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div style={E.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8b949e" }}>PAIR {index + 1}</span>
        <button
          onClick={() => onDelete(pair.id)}
          style={{ ...E.ghostBtn, color: "#f85149", borderColor: "#f8514933", padding: "1px 8px" }}
        >
          delete
        </button>
      </div>

      <div style={E.field}>
        <label style={E.label}>Question</label>
        <textarea
          value={pair.question}
          onChange={(e) => onUpdate(pair.id, { question: e.target.value })}
          rows={2}
          placeholder="What does this project do?"
          style={E.textarea}
        />
      </div>

      <div style={E.field}>
        <label style={E.label}>Description (label)</label>
        <input
          value={pair.description}
          onChange={(e) => onUpdate(pair.id, { description: e.target.value })}
          placeholder="Architecture decision retrieval"
          style={E.input}
        />
      </div>

      <div style={E.twoCol}>
        <div style={E.field}>
          <label style={E.label}>Expected keywords <span style={E.hint}>(comma-separated, checked in chunks)</span></label>
          <input
            value={pair.expectedKeywords.join(", ")}
            onChange={(e) => onUpdate(pair.id, { expectedKeywords: splitTags(e.target.value) })}
            placeholder="browser, backend, in-browser"
            style={E.input}
          />
        </div>
        <div style={E.field}>
          <label style={E.label}>Answer hints <span style={E.hint}>(checked in answer text)</span></label>
          <input
            value={pair.expectedAnswerHints.join(", ")}
            onChange={(e) => onUpdate(pair.id, { expectedAnswerHints: splitTags(e.target.value) })}
            placeholder="browser, no backend"
            style={E.input}
          />
        </div>
      </div>
    </div>
  );
}

function splitTags(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function EvalRow({ result: r }: { result: EvalResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ border: `1px solid ${r.pass ? "#23863655" : "#f8514933"}`, borderRadius: 8, marginBottom: 10, background: "#161b22", overflow: "hidden" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 16, color: r.pass ? "#3fb950" : "#f85149", flexShrink: 0 }}>
          {r.pass ? "✓" : "✗"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#e6edf3", fontWeight: 500, marginBottom: 2 }}>{r.pair.question}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>{r.pair.description}</div>
        </div>
        <div style={{ display: "flex", gap: 14, flexShrink: 0, fontSize: 12, alignItems: "center" }}>
          <ScorePill label="rel" score={r.relevanceScore} />
          <ScorePill label="faith" score={r.faithfulnessScore} />
          <span style={{ color: "#8b949e", width: 44, textAlign: "right" }}>{r.latencyMs}ms</span>
          <span style={{ color: "#8b949e", width: 14 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #21262d" }}>
          <div style={{ paddingTop: 12 }}>
            <div style={S.subLabel}>Answer</div>
            <div style={S.answerBox}>{r.answer}</div>

            <div style={S.subLabel}>
              Retrieved chunks ({r.retrievedChunks.length}) · {r.charsRetrieved} chars
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {r.retrievedChunks.slice(0, 3).map((chunk, i) => (
                <pre key={i} style={S.chunkBox}>
                  {chunk.slice(0, 240)}{chunk.length > 240 ? "…" : ""}
                </pre>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={S.subLabel}>Expected keywords</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {r.pair.expectedKeywords.map((kw) => {
                  const found = r.retrievedChunks.join(" ").toLowerCase().includes(kw.toLowerCase());
                  return (
                    <span key={kw} style={{ ...S.kwChip, color: found ? "#3fb950" : "#f85149", borderColor: found ? "#3fb95044" : "#f8514944" }}>
                      {found ? "✓" : "✗"} {kw}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, score }: { label: string; score: number }) {
  return (
    <span style={{ color: tone(score), minWidth: 62, textAlign: "right" }}>
      {label}: {pct(score)}
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", background: "#0d1117", minHeight: "100vh", color: "#c9d1d9" } as const,
  nav: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", borderBottom: "1px solid #21262d", background: "#161b22" } as const,
  navBrand: { fontSize: 14, fontWeight: 600, color: "#e6edf3" } as const,
  navLinks: { display: "flex", gap: 20 } as const,
  navLink: { fontSize: 13, color: "#8b949e", textDecoration: "none", paddingBottom: 2 } as const,
  container: { maxWidth: 1100, margin: "0 auto", padding: "28px 24px" } as const,
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16 } as const,
  h1: { fontSize: 20, fontWeight: 700, color: "#e6edf3", marginBottom: 4 } as const,
  sub: { fontSize: 12, color: "#8b949e", lineHeight: 1.5 } as const,
  runBtn: { padding: "9px 22px", borderRadius: 4, fontSize: 13, fontWeight: 600, flexShrink: 0, fontFamily: "inherit" } as React.CSSProperties,
  progressTrack: { height: 3, background: "#21262d", borderRadius: 2, marginBottom: 20 } as const,
  progressFill: { height: "100%", background: "#238636", borderRadius: 2, transition: "width 0.3s ease" } as const,
  layout: { display: "flex", gap: 20, alignItems: "flex-start" } as const,
  sidebar: { width: 220, flexShrink: 0, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 14 } as const,
  sidebarHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } as const,
  sideLabel: { fontSize: 10, color: "#8b949e", fontWeight: 600, letterSpacing: "0.06em" } as const,
  sideBtns: { display: "flex", gap: 6 } as const,
  tinyBtn: { background: "transparent", border: "1px solid #30363d", color: "#8b949e", padding: "1px 7px", borderRadius: 3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" } as const,
  fileList: { display: "flex", flexDirection: "column", gap: 4 } as const,
  fileRow: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "3px 0" } as React.CSSProperties,
  extBadge: { fontSize: 10, border: "1px solid", padding: "0 4px", borderRadius: 3, flexShrink: 0 } as React.CSSProperties,
  fileCount: { fontSize: 11, color: "#8b949e", marginTop: 8, textAlign: "right" } as React.CSSProperties,
  pairChip: (res?: EvalResult, valid = true) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 8px",
    background: "#0d1117",
    borderRadius: 4,
    border: res ? `1px solid ${res.pass ? "#23863655" : "#f8514933"}` : "1px solid #21262d",
    opacity: valid ? 1 : 0.45,
    overflow: "hidden",
  }) as React.CSSProperties,
  pairNum: { fontSize: 10, fontWeight: 700, color: "#8b949e", width: 14, textAlign: "center", flexShrink: 0 } as React.CSSProperties,
  summary: { background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "18px 24px", marginBottom: 16 } as const,
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 } as const,
  previewCard: { background: "#161b22", border: "1px solid #30363d", borderRadius: 6, padding: "12px 14px" } as const,
  subLabel: { fontSize: 10, color: "#8b949e", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 6, marginTop: 12, textTransform: "uppercase" } as React.CSSProperties,
  answerBox: { fontSize: 13, color: "#c9d1d9", lineHeight: 1.6, background: "#0d1117", borderRadius: 6, padding: "10px 14px", marginBottom: 2 } as const,
  chunkBox: { margin: 0, fontSize: 11, color: "#8b949e", background: "#0d1117", borderRadius: 4, padding: "6px 10px", fontFamily: "inherit", whiteSpace: "pre-wrap", wordBreak: "break-word" } as const,
  kwChip: { fontSize: 11, background: "#21262d", color: "#8b949e", padding: "1px 8px", borderRadius: 10, border: "1px solid #30363d" } as React.CSSProperties,
};

// Edit panel styles
const E = {
  card: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: "14px 16px",
  } as const,
  field: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 } as React.CSSProperties,
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as const,
  label: { fontSize: 11, color: "#8b949e", fontWeight: 600, letterSpacing: "0.04em" } as const,
  hint: { fontWeight: 400, color: "#6e7681" } as const,
  input: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 4,
    color: "#c9d1d9",
    fontSize: 12,
    padding: "6px 10px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  } as React.CSSProperties,
  textarea: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 4,
    color: "#c9d1d9",
    fontSize: 12,
    padding: "6px 10px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    outline: "none",
    resize: "vertical",
    width: "100%",
    boxSizing: "border-box",
    lineHeight: 1.5,
  } as React.CSSProperties,
  ghostBtn: {
    background: "transparent",
    border: "1px solid #30363d",
    color: "#8b949e",
    padding: "3px 10px",
    borderRadius: 3,
    fontSize: 11,
    cursor: "pointer",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  } as React.CSSProperties,
  addBtn: {
    background: "#1f3d2e",
    border: "1px solid #2ea04344",
    color: "#3fb950",
    padding: "7px 18px",
    borderRadius: 4,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontWeight: 600,
    width: "100%",
  } as React.CSSProperties,
};
