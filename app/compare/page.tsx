/**
 * /compare — Side-by-side pipeline comparison.
 *
 * Runs the same query through 2–4 configs and diffs them on quality (eval
 * scores), cost (estimated USD), and latency. Winners are highlighted per axis.
 */
"use client";

import Link from "next/link";
import { useState } from "react";

type Mode = "auto" | "rag" | "memory" | "long_context" | "hybrid";

interface ConfigDraft {
  label: string;
  mode: Mode;
  topK: number;
  maxContextTokens: number;
}

interface Metrics {
  routeMode: string;
  documents: number;
  memories: number;
  promptTokens: number;
  answerChars: number;
  latencyMs: number;
  faithfulness: number;
  contextRelevance: number;
  answerRelevance: number;
  estimatedCostUsd: number;
  llmMode: string;
  failureModeCount: number;
}

interface Row {
  label: string;
  config: ConfigDraft;
  run: {
    answer: string;
    failureModes: Array<{ type: string; severity: string; description: string }>;
  };
  metrics: Metrics;
}

interface CompareResponse {
  query: { userId: string; message: string };
  providerStatus: Array<{ role: string; mode: string; name: string }>;
  rows: Row[];
  winners: { faithfulness: string | null; cost: string | null; latency: string | null };
}

const MODES: Mode[] = ["auto", "rag", "memory", "long_context", "hybrid"];

const DEFAULT_CONFIGS: ConfigDraft[] = [
  { label: "Tight (topK=3)", mode: "auto", topK: 3, maxContextTokens: 2000 },
  { label: "Wide (topK=10)", mode: "auto", topK: 10, maxContextTokens: 6000 },
];

export default function ComparePage() {
  const [userId] = useState("demo-user");
  const [message, setMessage] = useState(
    "Почему я снова застрял с Shadow и этой теорией?"
  );
  const [configs, setConfigs] = useState<ConfigDraft[]>(DEFAULT_CONFIGS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);

  function updateConfig(i: number, patch: Partial<ConfigDraft>) {
    setConfigs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function addConfig() {
    if (configs.length >= 4) return;
    setConfigs((prev) => [
      ...prev,
      {
        label: `Config ${prev.length + 1}`,
        mode: "auto",
        topK: 5,
        maxContextTokens: 4000,
      },
    ]);
  }

  function removeConfig(i: number) {
    if (configs.length <= 2) return;
    setConfigs((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function runCompare() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rag-memory/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, message, configs }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as CompareResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={S.main}>
      <header style={{ marginBottom: 20 }}>
        <Link href="/" style={S.back}>
          ← Back to home
        </Link>
        <h1 style={S.h1}>Side-by-side comparison</h1>
        <p style={S.sub}>
          Run the same query through 2–4 pipeline configs. Diff quality (eval
          scores) × cost (estimated USD) × latency. Winners highlighted per axis.
        </p>
      </header>

      <section style={S.card}>
        <label style={S.fieldLabel}>Query</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          style={S.textarea}
        />
      </section>

      <section style={S.configGrid}>
        {configs.map((c, i) => (
          <div key={i} style={S.configCard}>
            <div style={S.configHead}>
              <input
                value={c.label}
                onChange={(e) => updateConfig(i, { label: e.target.value })}
                style={S.labelInput}
              />
              {configs.length > 2 && (
                <button onClick={() => removeConfig(i)} style={S.removeBtn} title="Remove">
                  ×
                </button>
              )}
            </div>
            <label style={S.miniLabel}>Route mode</label>
            <select
              value={c.mode}
              onChange={(e) => updateConfig(i, { mode: e.target.value as Mode })}
              style={S.select}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label style={S.miniLabel}>topK ({c.topK})</label>
            <input
              type="range"
              min={1}
              max={20}
              value={c.topK}
              onChange={(e) => updateConfig(i, { topK: Number(e.target.value) })}
              style={S.range}
            />
            <label style={S.miniLabel}>maxContextTokens</label>
            <input
              type="number"
              min={256}
              max={16000}
              step={256}
              value={c.maxContextTokens}
              onChange={(e) =>
                updateConfig(i, { maxContextTokens: Number(e.target.value) })
              }
              style={S.numInput}
            />
          </div>
        ))}
        {configs.length < 4 && (
          <button onClick={addConfig} style={S.addCard}>
            + Add config
          </button>
        )}
      </section>

      <button onClick={runCompare} disabled={loading} style={S.runBtn}>
        {loading ? "Running…" : "Run comparison"}
      </button>

      {error && <p style={S.error}>{error}</p>}

      {result && <Results result={result} />}
    </main>
  );
}

function Results({ result }: { result: CompareResponse }) {
  const { rows, winners } = result;
  const fmtCost = (n: number) => (n === 0 ? "free (stub)" : `$${n.toFixed(5)}`);
  const fmtScore = (n: number) => n.toFixed(2);

  const metricRows: Array<{
    key: keyof Metrics;
    label: string;
    fmt: (m: Metrics) => string;
    winner?: keyof CompareResponse["winners"];
  }> = [
    { key: "routeMode", label: "Route", fmt: (m) => m.routeMode },
    { key: "documents", label: "Docs retrieved", fmt: (m) => String(m.documents) },
    { key: "memories", label: "Memories", fmt: (m) => String(m.memories) },
    { key: "promptTokens", label: "Prompt tokens", fmt: (m) => String(m.promptTokens) },
    {
      key: "faithfulness",
      label: "Faithfulness",
      fmt: (m) => fmtScore(m.faithfulness),
      winner: "faithfulness",
    },
    { key: "contextRelevance", label: "Context rel.", fmt: (m) => fmtScore(m.contextRelevance) },
    { key: "answerRelevance", label: "Answer rel.", fmt: (m) => fmtScore(m.answerRelevance) },
    {
      key: "estimatedCostUsd",
      label: "Est. cost",
      fmt: (m) => fmtCost(m.estimatedCostUsd),
      winner: "cost",
    },
    {
      key: "latencyMs",
      label: "Latency",
      fmt: (m) => `${m.latencyMs}ms`,
      winner: "latency",
    },
    { key: "failureModeCount", label: "Failure modes", fmt: (m) => String(m.failureModeCount) },
  ];

  return (
    <section style={{ marginTop: 28 }}>
      <div style={S.winnerBar}>
        <span style={{ ...S.winnerChip, background: "#23863622", color: "#7ee787" }}>
          Best faithfulness: {winners.faithfulness ?? "—"}
        </span>
        <span style={{ ...S.winnerChip, background: "#1f6feb22", color: "#79c0ff" }}>
          Lowest cost: {winners.cost ?? "—"}
        </span>
        <span style={{ ...S.winnerChip, background: "#a371f722", color: "#d2a8ff" }}>
          Fastest: {winners.latency ?? "—"}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Metric</th>
              {rows.map((r) => (
                <th key={r.label} style={S.th}>
                  {r.label}
                  <div style={S.thSub}>
                    {r.config.mode} · k={r.config.topK} · {r.metrics.llmMode}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((mr) => (
              <tr key={mr.key}>
                <td style={S.tdMetric}>{mr.label}</td>
                {rows.map((r) => {
                  const isWinner = mr.winner && winners[mr.winner] === r.label;
                  return (
                    <td
                      key={r.label}
                      style={{
                        ...S.td,
                        ...(isWinner ? S.tdWinner : {}),
                      }}
                    >
                      {mr.fmt(r.metrics)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={S.answerGrid}>
        {rows.map((r) => (
          <div key={r.label} style={S.answerCard}>
            <div style={S.answerHead}>{r.label}</div>
            <pre style={S.answerText}>{r.run.answer}</pre>
            {r.run.failureModes.length > 0 && (
              <div style={S.fmList}>
                {r.run.failureModes.map((f, idx) => (
                  <div key={idx} style={S.fmItem(f.severity)}>
                    {f.severity}: {f.type}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S = {
  main: {
    fontFamily: mono,
    padding: 32,
    maxWidth: 1100,
    margin: "0 auto",
    color: "#c9d1d9",
    background: "#0d1117",
    minHeight: "100vh",
  } as const,
  back: { color: "#79c0ff", textDecoration: "none", fontSize: 12 } as const,
  h1: { fontSize: 24, margin: "8px 0 4px" } as const,
  sub: { color: "#8b949e", fontSize: 13, lineHeight: 1.6, margin: 0 } as const,
  card: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  } as const,
  fieldLabel: { display: "block", fontSize: 12, color: "#8b949e", marginBottom: 6 } as const,
  textarea: {
    width: "100%",
    background: "#0d1117",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: 8,
    fontFamily: mono,
    fontSize: 13,
    resize: "vertical" as const,
  } as const,
  configGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
    marginBottom: 16,
  } as const,
  configCard: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  configHead: { display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } as const,
  labelInput: {
    flex: 1,
    background: "#0d1117",
    color: "#79c0ff",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: "4px 6px",
    fontFamily: mono,
    fontSize: 13,
    fontWeight: 600,
  } as const,
  removeBtn: {
    background: "#21262d",
    color: "#ff7b72",
    border: "1px solid #30363d",
    borderRadius: 4,
    cursor: "pointer",
    width: 24,
    height: 24,
    fontSize: 14,
  } as const,
  miniLabel: { display: "block", fontSize: 11, color: "#8b949e", margin: "8px 0 4px" } as const,
  select: {
    width: "100%",
    background: "#0d1117",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: 6,
    fontFamily: mono,
    fontSize: 12,
  } as const,
  range: { width: "100%" } as const,
  numInput: {
    width: "100%",
    background: "#0d1117",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: 6,
    fontFamily: mono,
    fontSize: 12,
  } as const,
  addCard: {
    background: "transparent",
    color: "#8b949e",
    border: "1px dashed #30363d",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 13,
    minHeight: 120,
  } as const,
  runBtn: {
    background: "#238636",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "10px 20px",
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 14,
  } as const,
  error: { color: "#ff7b72", marginTop: 12, fontSize: 13 } as const,
  winnerBar: { display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 16 } as const,
  winnerChip: { padding: "4px 10px", borderRadius: 4, fontSize: 12 } as const,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 } as const,
  th: {
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: "1px solid #30363d",
    color: "#c9d1d9",
    verticalAlign: "top" as const,
  } as const,
  thSub: { fontSize: 10, color: "#8b949e", fontWeight: 400 as const, marginTop: 2 } as const,
  tdMetric: {
    padding: "8px 12px",
    borderBottom: "1px solid #21262d",
    color: "#8b949e",
  } as const,
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid #21262d",
    color: "#c9d1d9",
  } as const,
  tdWinner: { background: "#23863622", color: "#7ee787", fontWeight: 600 as const } as const,
  answerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 12,
    marginTop: 20,
  } as const,
  answerCard: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  answerHead: { color: "#79c0ff", fontSize: 13, fontWeight: 600, marginBottom: 8 } as const,
  answerText: {
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    fontSize: 12,
    lineHeight: 1.5,
    color: "#c9d1d9",
    margin: 0,
    fontFamily: mono,
  } as const,
  fmList: { marginTop: 8, display: "flex", flexDirection: "column" as const, gap: 4 } as const,
  fmItem: (severity: string) =>
    ({
      fontSize: 11,
      padding: "2px 6px",
      borderRadius: 3,
      background:
        severity === "critical"
          ? "#da363322"
          : severity === "warn"
          ? "#bf870022"
          : "#21262d",
      color:
        severity === "critical" ? "#ff7b72" : severity === "warn" ? "#ffd479" : "#8b949e",
    }) as const,
};
