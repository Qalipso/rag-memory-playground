/**
 * /rag-memory-playground — debug page.
 *
 * Renders the ExplainableRun from POST /api/rag-memory/framework-run as a
 * step-by-step inspection view. Minimal, honest, no framework-faking.
 *
 * Drop into a Next.js App Router project at:
 *   app/rag-memory-playground/page.tsx
 */
"use client";

import Link from "next/link";
import { useState } from "react";
import MemoryGraph from "./MemoryGraph.js";
import SettingsPanel from "./SettingsPanel.js";

type Tab = "run" | "memory" | "settings";

interface ProviderStatusLike {
  role: string;
  name: string;
  framework: string;
  mode: "real" | "stub" | "fallback";
  reason: string;
  requiredEnvVars: string[];
  isConfigured: boolean;
  version?: string;
}

interface GraphStepLike {
  id: string;
  name: string;
  framework: string;
  providerMode: "real" | "stub" | "fallback";
  status: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
}

interface ExplainableRunLike {
  runId: string;
  input: { userId: string; message: string; mode?: string };
  route: {
    mode: string;
    useDocuments: boolean;
    useMemory: boolean;
    useLongContext: boolean;
    reason: string;
    confidence: number;
  };
  providerStatus: ProviderStatusLike[];
  graphSteps: GraphStepLike[];
  retrievedDocuments: Array<{
    id: string;
    title: string;
    content: string;
    source: string;
    score: number;
    reason: string;
  }>;
  retrievedMemories: Array<{
    id: string;
    type: string;
    content: string;
    score: number;
    reason: string;
  }>;
  finalContext: {
    systemPrompt: string;
    memoryBlock: string;
    documentBlock: string;
    finalPrompt: string;
    tokensEstimate: number;
  };
  answer: string;
  evaluations: {
    faithfulness: { score: number; explanation: string };
    contextRelevance: { score: number; explanation: string };
    answerRelevance: { score: number; explanation: string };
    warnings: string[];
  };
  trace: Array<{
    id: string;
    level: string;
    message: string;
    timestamp: string;
  }>;
  failureModes: Array<{
    id: string;
    type: string;
    description: string;
    severity: string;
  }>;
  debug: {
    envHints: Array<{ key: string; present: boolean }>;
    containerDecisions: Array<{ role: string; decision: string }>;
    workflow: {
      nodeOrder: string[];
      skippedNodes: string[];
      failedNodes: string[];
    };
  };
  meta: {
    totalDurationMs: number;
    frameworks: Record<string, { name: string; mode: string }>;
  };
}

export default function PlaygroundPage() {
  const [tab, setTab] = useState<Tab>("run");
  const [userId, setUserId] = useState("demo-user");
  const [message, setMessage] = useState("Почему я снова застрял с Shadow и этой теорией?");
  const [mode, setMode] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExplainableRunLike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [showContext, setShowContext] = useState(false);

  async function runQuery() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rag-memory/framework-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, message, mode }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ExplainableRunLike;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={S.main}>
      <header style={S.header}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            color: "#79c0ff",
            textDecoration: "none",
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          ← Back to home
        </Link>
        <h1 style={S.h1}>RAG Memory Playground</h1>
        <p style={S.sub}>
          LangGraph orchestration · LlamaIndex.TS retrieval · Mem0 memory · OpenAI generation ·
          Ragas-shaped evaluation · Langfuse observability.
          Providers self-report mode (real / stub / fallback). Failure modes are surfaced honestly.
        </p>
      </header>

      <nav style={S.tabBar}>
        <button
          style={tab === "run" ? S.tabActive : S.tabInactive}
          onClick={() => setTab("run")}
        >
          Run pipeline
        </button>
        <button
          style={tab === "memory" ? S.tabActive : S.tabInactive}
          onClick={() => setTab("memory")}
        >
          Memory graph
        </button>
        <button
          style={tab === "settings" ? S.tabActive : S.tabInactive}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </nav>

      {tab === "memory" && (
        <section style={S.section}>
          <h2 style={S.h2}>Memory Graph — full store for {userId}</h2>
          <MemoryGraph userId={userId} />
        </section>
      )}

      {tab === "settings" && (
        <section style={S.section}>
          <h2 style={S.h2}>Settings — providers, keys, tools</h2>
          <SettingsPanel />
        </section>
      )}

      {tab === "run" && (
      <div>
      <section style={S.section}>
        <div style={S.formRow}>
          <label style={S.label}>
            User ID
            <input style={S.input} value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label style={{ ...S.label, flex: 1 }}>
            Message
            <textarea
              style={{ ...S.input, height: 70 }}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label style={S.label}>
            Mode
            <select style={S.input} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="auto">auto</option>
              <option value="rag">rag</option>
              <option value="memory">memory</option>
              <option value="long_context">long_context</option>
              <option value="hybrid">hybrid</option>
            </select>
          </label>
        </div>
        <button style={S.button} disabled={loading} onClick={runQuery}>
          {loading ? "Running…" : "Run pipeline"}
        </button>
      </section>

      {error && (
        <section style={{ ...S.section, ...S.errorSection }}>
          Error: {error}
        </section>
      )}

      {result && (
        <>
          <Section title={`Route — ${result.route.mode} (${result.route.confidence.toFixed(2)})`}>
            <p style={S.mono}>{result.route.reason}</p>
            <p style={S.muted}>
              docs={String(result.route.useDocuments)} · memory={String(result.route.useMemory)} ·
              longCtx={String(result.route.useLongContext)}
            </p>
          </Section>

          <Section title={`Provider Status (${result.providerStatus.length})`}>
            <div style={S.cardGrid}>
              {result.providerStatus.map((p) => (
                <ProviderCard key={p.role} status={p} />
              ))}
            </div>
          </Section>

          <Section title={`Graph Steps (${result.graphSteps.length})`}>
            <div style={S.timeline}>
              {result.graphSteps.map((s, i) => (
                <div key={s.id} style={S.timelineStep}>
                  <div style={S.timelineDot(s.status)}>{i + 1}</div>
                  <div style={S.timelineBody}>
                    <div style={S.stepHead}>
                      <strong>{s.name}</strong>
                      <span style={S.modeBadge(s.providerMode)}>{s.providerMode}</span>
                      <span style={S.statusBadge(s.status)}>{s.status}</span>
                      <span style={S.muted}>{s.framework}</span>
                      <span style={S.muted}>{s.durationMs}ms</span>
                    </div>
                    <div style={S.mono}>in:  {s.inputSummary}</div>
                    <div style={S.mono}>out: {s.outputSummary}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Retrieved Documents (${result.retrievedDocuments.length})`}>
            {result.retrievedDocuments.length === 0 && <p style={S.muted}>None.</p>}
            {result.retrievedDocuments.map((d) => (
              <div key={d.id} style={S.item}>
                <div>
                  <strong>{d.title}</strong>{" "}
                  <span style={S.muted}>· {d.source}</span>{" "}
                  <span style={S.score}>{d.score.toFixed(2)}</span>{" "}
                  <span style={S.muted}>· {d.reason}</span>
                </div>
                <div style={S.snippet}>{d.content}</div>
              </div>
            ))}
          </Section>

          <Section title={`Retrieved Memories (${result.retrievedMemories.length})`}>
            {result.retrievedMemories.length === 0 && <p style={S.muted}>None.</p>}
            {result.retrievedMemories.map((m) => (
              <div key={m.id} style={S.item}>
                <div>
                  <span style={S.tag}>{m.type}</span>{" "}
                  <span style={S.score}>{m.score.toFixed(2)}</span>{" "}
                  <span style={S.muted}>· {m.reason}</span>
                </div>
                <div style={S.snippet}>{m.content}</div>
              </div>
            ))}
          </Section>

          <Section title={`Final Context (${result.finalContext.tokensEstimate} tokens)`}>
            <button style={S.smallButton} onClick={() => setShowContext(!showContext)}>
              {showContext ? "Hide" : "Show"} system + memory + document blocks
            </button>
            {showContext && (
              <>
                <h3 style={S.h3}>System prompt</h3>
                <pre style={S.pre}>{result.finalContext.systemPrompt}</pre>
                <h3 style={S.h3}>Memory block</h3>
                <pre style={S.pre}>{result.finalContext.memoryBlock || "(empty)"}</pre>
                <h3 style={S.h3}>Document block</h3>
                <pre style={S.pre}>{result.finalContext.documentBlock || "(empty)"}</pre>
                <h3 style={S.h3}>Final prompt</h3>
                <pre style={S.pre}>{result.finalContext.finalPrompt}</pre>
              </>
            )}
          </Section>

          <Section title="Answer">
            <pre style={S.pre}>{result.answer}</pre>
          </Section>

          <Section title="Evaluations">
            <EvalRow label="faithfulness" {...result.evaluations.faithfulness} />
            <EvalRow label="context_relevance" {...result.evaluations.contextRelevance} />
            <EvalRow label="answer_relevance" {...result.evaluations.answerRelevance} />
            {result.evaluations.warnings.length > 0 && (
              <>
                <h3 style={S.h3}>Warnings</h3>
                <ul>
                  {result.evaluations.warnings.map((w, i) => (
                    <li key={i} style={{ color: "#ffd479" }}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </Section>

          {result.failureModes.length > 0 && (
            <Section title={`Failure Modes (${result.failureModes.length})`}>
              {result.failureModes.map((f) => (
                <div key={f.id} style={S.item}>
                  <div>
                    <span style={S.severityBadge(f.severity)}>{f.severity}</span>{" "}
                    <span style={S.tag}>{f.type}</span>
                  </div>
                  <div style={S.snippet}>{f.description}</div>
                </div>
              ))}
            </Section>
          )}

          <Section title="Debug envelope">
            <h3 style={S.h3}>Env hints</h3>
            <div style={S.envGrid}>
              {result.debug.envHints.map((h) => (
                <div key={h.key} style={S.envChip(h.present)}>
                  {h.key} {h.present ? "✓" : "✗"}
                </div>
              ))}
            </div>
            <h3 style={S.h3}>Container decisions</h3>
            <ul>
              {result.debug.containerDecisions.map((d, i) => (
                <li key={i} style={S.mono}>
                  <strong>{d.role}</strong>: {d.decision}
                </li>
              ))}
            </ul>
            <h3 style={S.h3}>Workflow</h3>
            <p style={S.mono}>order: {result.debug.workflow.nodeOrder.join(" → ")}</p>
            <p style={S.mono}>skipped: {result.debug.workflow.skippedNodes.join(", ") || "(none)"}</p>
            <p style={S.mono}>failed: {result.debug.workflow.failedNodes.join(", ") || "(none)"}</p>
          </Section>

          <Section title={`Frameworks (total ${result.meta.totalDurationMs}ms)`}>
            <div style={S.cardGrid}>
              {Object.entries(result.meta.frameworks).map(([role, fw]) => (
                <div key={role} style={S.smallCard}>
                  <div style={S.muted}>{role}</div>
                  <div>
                    <strong>{fw.name}</strong>{" "}
                    <span style={S.modeBadge(fw.mode as "real" | "stub" | "fallback")}>{fw.mode}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Trace Events (${result.trace.length})`}>
            <ul style={S.traceList}>
              {result.trace.map((e) => (
                <li key={e.id} style={S.mono}>
                  [{e.level}] {e.timestamp.slice(11, 19)} — {e.message}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Raw JSON">
            <button style={S.smallButton} onClick={() => setShowJson(!showJson)}>
              {showJson ? "Hide" : "Show"} full ExplainableRun
            </button>
            {showJson && <pre style={S.pre}>{JSON.stringify(result, null, 2)}</pre>}
          </Section>
        </>
      )}
      </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={S.section}>
      <h2 style={S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function ProviderCard({ status }: { status: ProviderStatusLike }) {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div>
          <div style={S.muted}>{status.role}</div>
          <div style={S.cardTitle}>{status.name}</div>
        </div>
        <span style={S.modeBadge(status.mode)}>{status.mode}</span>
      </div>
      <div style={S.muted}>{status.framework}</div>
      <p style={S.cardReason}>{status.reason}</p>
      {status.requiredEnvVars.length > 0 && (
        <div style={S.muted}>
          env:{" "}
          {status.requiredEnvVars.map((v) => (
            <code key={v} style={S.code}>{v}</code>
          ))}{" "}
          {status.isConfigured ? "✓" : "✗"}
        </div>
      )}
    </div>
  );
}

function EvalRow({
  label,
  score,
  explanation,
}: {
  label: string;
  score: number;
  explanation: string;
}) {
  const color = score >= 0.7 ? "#7ee787" : score >= 0.4 ? "#ffd479" : "#ff7b72";
  return (
    <div style={S.item}>
      <div>
        <strong>{label}</strong>{" "}
        <span style={{ ...S.score, background: color, color: "#0d1117" }}>
          {score.toFixed(2)}
        </span>
      </div>
      <div style={S.muted}>{explanation}</div>
    </div>
  );
}

// ---------- Styles ----------

const S = {
  main: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    background: "#0d1117",
    color: "#e6edf3",
    minHeight: "100vh",
    padding: "32px",
    maxWidth: 1180,
    margin: "0 auto",
  } as const,
  header: { marginBottom: 16 },
  tabBar: {
    display: "flex",
    gap: 4,
    marginBottom: 16,
    borderBottom: "1px solid #30363d",
  } as const,
  tabActive: {
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    borderBottom: "1px solid #161b22",
    padding: "8px 18px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: "6px 6px 0 0",
    marginBottom: -1,
  } as const,
  tabInactive: {
    background: "transparent",
    color: "#8b949e",
    border: "1px solid transparent",
    padding: "8px 18px",
    cursor: "pointer",
    fontSize: 13,
    borderRadius: "6px 6px 0 0",
  } as const,
  h1: { fontSize: 24, marginBottom: 4, color: "#e6edf3" },
  h2: { fontSize: 15, marginBottom: 12, color: "#7ee787", letterSpacing: 0.5 },
  h3: { fontSize: 13, marginTop: 12, marginBottom: 6, color: "#79c0ff" },
  sub: { color: "#8b949e", fontSize: 13, lineHeight: 1.5 },
  section: {
    background: "#161b22",
    padding: 18,
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid #30363d",
  },
  errorSection: { background: "#3a1414", color: "#ffb4b4" },
  formRow: { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" } as const,
  label: { display: "flex", flexDirection: "column", fontSize: 12, flex: "0 0 auto" } as const,
  input: {
    background: "#0d1117",
    color: "#e6edf3",
    border: "1px solid #30363d",
    padding: "8px 10px",
    borderRadius: 4,
    marginTop: 4,
    fontFamily: "inherit",
    fontSize: 13,
  } as const,
  button: {
    background: "#238636",
    color: "white",
    border: "none",
    padding: "10px 18px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 14,
  } as const,
  smallButton: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    marginBottom: 8,
  } as const,
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  } as const,
  card: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  } as const,
  cardTitle: { fontSize: 14, fontWeight: 600 } as const,
  cardReason: { fontSize: 12, color: "#c9d1d9", marginTop: 8, marginBottom: 6 } as const,
  smallCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
  } as const,
  code: {
    background: "#21262d",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
    marginRight: 4,
  } as const,
  timeline: { display: "flex", flexDirection: "column", gap: 10 } as const,
  timelineStep: { display: "flex", gap: 12, alignItems: "flex-start" } as const,
  timelineDot: (status: string) =>
    ({
      width: 28,
      height: 28,
      borderRadius: "50%",
      background:
        status === "ok"
          ? "#1f6feb"
          : status === "skipped"
          ? "#6e7681"
          : status === "failed"
          ? "#da3633"
          : "#30363d",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 12,
      fontWeight: 600,
      flex: "0 0 auto",
    }) as const,
  timelineBody: { flex: 1 } as const,
  stepHead: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 4,
    flexWrap: "wrap",
  } as const,
  modeBadge: (mode: "real" | "stub" | "fallback") =>
    ({
      background: mode === "real" ? "#1f6feb" : mode === "fallback" ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "2px 8px",
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 600,
    }) as const,
  statusBadge: (status: string) =>
    ({
      background:
        status === "ok"
          ? "#1a7f37"
          : status === "skipped"
          ? "#6e7681"
          : status === "failed"
          ? "#da3633"
          : "#30363d",
      color: "white",
      padding: "2px 6px",
      borderRadius: 3,
      fontSize: 11,
    }) as const,
  severityBadge: (severity: string) =>
    ({
      background: severity === "critical" ? "#da3633" : severity === "warn" ? "#bf8700" : "#1f6feb",
      color: "white",
      padding: "2px 8px",
      borderRadius: 3,
      fontSize: 11,
      fontWeight: 600,
    }) as const,
  mono: { fontFamily: "inherit", fontSize: 12, color: "#8b949e", margin: "2px 0" },
  muted: { color: "#8b949e", fontSize: 12 },
  score: {
    background: "#1f6feb",
    color: "white",
    padding: "1px 8px",
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 600,
  },
  tag: {
    background: "#21262d",
    color: "#c9d1d9",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
  },
  item: { padding: "8px 0", borderBottom: "1px solid #21262d" } as const,
  snippet: { color: "#c9d1d9", fontSize: 13, marginTop: 4, lineHeight: 1.5 },
  pre: {
    background: "#0d1117",
    padding: 12,
    borderRadius: 4,
    overflow: "auto",
    fontSize: 12,
    color: "#c9d1d9",
    maxHeight: 400,
  } as const,
  traceList: { listStyle: "none", padding: 0, margin: 0, maxHeight: 220, overflow: "auto" } as const,
  envGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 } as const,
  envChip: (present: boolean) =>
    ({
      background: present ? "#1a7f37" : "#21262d",
      color: present ? "white" : "#8b949e",
      padding: "3px 8px",
      borderRadius: 3,
      fontSize: 11,
      fontFamily: "inherit",
    }) as const,
};
