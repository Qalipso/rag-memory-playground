/**
 * /memory — Visual Memory Lab.
 *
 * Shows how raw text becomes structured, multi-level long-term memory:
 *   Input → Normalize → Classify+Extract → Split blocks → Embed → Store
 *         → Link to graph → Consolidate
 *
 * Each pipeline stage, the extracted entities, the multi-level memory blocks,
 * and the resulting memory graph are rendered. Provider modes and failure modes
 * are surfaced honestly.
 */
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#8b949e" }}>Loading graph…</div>,
});

type Level = "semantic" | "episodic" | "procedural" | "working";

interface Entity {
  id: string;
  name: string;
  kind: string;
}
interface Block {
  id: string;
  level: Level;
  content: string;
  entityIds: string[];
  importance: number;
  status: string;
}
interface Edge {
  id: string;
  from: string;
  to: string;
  kind: string;
  weight: number;
  reason: string;
}
interface Step {
  name: string;
  providerMode: string;
  framework: string;
  status: string;
  outputSummary: string;
  durationMs: number;
}
interface Failure {
  type: string;
  description: string;
  severity: string;
}
interface FormResult {
  noteId: string;
  classification: { topics: string[]; language: string; summary: string };
  entities: Entity[];
  blocks: Block[];
  newEdges: Edge[];
  steps: Step[];
  providerStatus: Array<{ role: string; mode: string; name: string }>;
  failureModes: Failure[];
  meta: { totalDurationMs: number };
}
interface Snapshot {
  blocks: Block[];
  edges: Edge[];
  entities: Entity[];
}

const EXAMPLE =
  "Сегодня я понял, что много трачу на кофе. Надо сделать автоматический трекер расходов в Shadow.";

const LEVELS: Level[] = ["semantic", "episodic", "procedural", "working"];
const LEVEL_META: Record<Level, { label: string; color: string; desc: string }> = {
  semantic: { label: "Semantic", color: "#7ee787", desc: "Durable facts / knowledge" },
  episodic: { label: "Episodic", color: "#79c0ff", desc: "Dated events" },
  procedural: { label: "Procedural", color: "#d2a8ff", desc: "How-to / intent" },
  working: { label: "Working", color: "#ffd479", desc: "Active tasks" },
};
const EDGE_COLOR: Record<string, string> = {
  shares_entity: "#58a6ff",
  semantic_similar: "#7ee787",
  supersedes: "#ff7b72",
  elaborates: "#d2a8ff",
};

export default function MemoryLabPage() {
  const userId = "demo-user";
  const [text, setText] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [consolidateMsg, setConsolidateMsg] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    const res = await fetch(`/api/rag-memory/memory/graph?userId=${encodeURIComponent(userId)}`);
    if (res.ok) setSnapshot((await res.json()) as Snapshot);
  }, [userId]);

  useEffect(() => {
    void loadGraph();
  }, [loadGraph]);

  async function form() {
    setLoading(true);
    setError(null);
    setConsolidateMsg(null);
    try {
      const res = await fetch("/api/rag-memory/memory/form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, text }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as FormResult);
      await loadGraph();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function consolidate() {
    const res = await fetch("/api/rag-memory/memory/consolidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { merged: number };
      setConsolidateMsg(`Consolidated: ${data.merged} block(s) merged.`);
      await loadGraph();
    }
  }

  const entityById = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of result?.entities ?? []) m.set(e.id, e);
    for (const e of snapshot?.entities ?? []) m.set(e.id, e);
    return m;
  }, [result, snapshot]);

  const graphData = useMemo(() => {
    if (!snapshot) return { nodes: [], links: [] };
    const active = snapshot.blocks.filter((b) => b.status === "active");
    const ids = new Set(active.map((b) => b.id));
    return {
      nodes: active.map((b) => ({
        id: b.id,
        label: b.content.slice(0, 28),
        color: LEVEL_META[b.level].color,
        val: 1 + b.importance * 3,
      })),
      links: snapshot.edges
        .filter((e) => ids.has(e.from) && ids.has(e.to))
        .map((e) => ({ source: e.from, target: e.to, color: EDGE_COLOR[e.kind] ?? "#30363d" })),
    };
  }, [snapshot]);

  return (
    <main style={S.main}>
      <header style={{ marginBottom: 16 }}>
        <Link href="/" style={S.back}>
          ← Back to home
        </Link>
        <h1 style={S.h1}>Visual Memory Lab</h1>
        <p style={S.sub}>
          Watch a raw note become structured, multi-level long-term memory:
          normalize → classify → extract entities → split into memory blocks →
          embed → store → link to graph → consolidate.
        </p>
      </header>

      <section style={S.card}>
        <label style={S.fieldLabel}>Note</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} style={S.textarea} />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={form} disabled={loading} style={S.runBtn}>
            {loading ? "Forming memory…" : "Form memory"}
          </button>
          <button onClick={consolidate} style={S.secondaryBtn}>
            Consolidate
          </button>
        </div>
        {consolidateMsg && <p style={S.note}>{consolidateMsg}</p>}
        {error && <p style={S.error}>{error}</p>}
      </section>

      {result && (
        <>
          <section style={S.section}>
            <h2 style={S.h2}>Pipeline trace</h2>
            <div style={S.stepRow}>
              {result.steps.map((s, i) => (
                <div key={i} style={S.step}>
                  <div style={S.stepName}>{s.name.replace("Node", "")}</div>
                  <span style={modeBadge(s.providerMode)}>{s.providerMode}</span>
                  <div style={S.stepOut}>{s.outputSummary}</div>
                  <div style={S.stepDur}>{s.durationMs}ms</div>
                </div>
              ))}
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>
              Classification{" "}
              <span style={S.dim}>
                · {result.classification.language} · {result.meta.totalDurationMs}ms
              </span>
            </h2>
            <p style={S.summary}>{result.classification.summary}</p>
            <div style={S.chipRow}>
              {result.classification.topics.map((t) => (
                <span key={t} style={S.topicChip}>
                  #{t}
                </span>
              ))}
              {result.entities.map((e) => (
                <span key={e.id} style={entityChip(e.kind)}>
                  {e.name} <span style={S.entityKind}>{e.kind}</span>
                </span>
              ))}
            </div>
          </section>

          <section style={S.section}>
            <h2 style={S.h2}>Memory blocks ({result.blocks.length})</h2>
            <div style={S.levelGrid}>
              {LEVELS.map((lvl) => {
                const blocks = result.blocks.filter((b) => b.level === lvl);
                return (
                  <div key={lvl} style={S.levelCol}>
                    <div style={{ ...S.levelHead, color: LEVEL_META[lvl].color }}>
                      {LEVEL_META[lvl].label}
                      <div style={S.levelDesc}>{LEVEL_META[lvl].desc}</div>
                    </div>
                    {blocks.length === 0 && <div style={S.levelEmpty}>—</div>}
                    {blocks.map((b) => (
                      <div key={b.id} style={S.block}>
                        <div style={S.blockContent}>{b.content}</div>
                        <div style={S.importanceBar}>
                          <div
                            style={{
                              ...S.importanceFill,
                              width: `${Math.round(b.importance * 100)}%`,
                              background: LEVEL_META[lvl].color,
                            }}
                          />
                        </div>
                        {b.entityIds.length > 0 && (
                          <div style={S.blockEntities}>
                            {b.entityIds.map((id) => (
                              <span key={id} style={S.miniChip}>
                                {entityById.get(id)?.name ?? id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {result.failureModes.length > 0 && (
            <section style={S.section}>
              <h2 style={S.h2}>Honesty panel</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={S.chipRow}>
                  {result.providerStatus.map((p) => (
                    <span key={p.role} style={modeBadge(p.mode)}>
                      {p.role}: {p.name} ({p.mode})
                    </span>
                  ))}
                </div>
                {result.failureModes.map((f, i) => (
                  <div key={i} style={failItem(f.severity)}>
                    <strong>{f.type}</strong> — {f.description}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <section style={S.section}>
        <h2 style={S.h2}>
          Memory graph{" "}
          <span style={S.dim}>
            · {graphData.nodes.length} active blocks · {graphData.links.length} links
          </span>
        </h2>
        <div style={S.graphBox}>
          {graphData.nodes.length === 0 ? (
            <div style={{ padding: 24, color: "#8b949e" }}>
              No memory yet. Form a note above to populate the graph.
            </div>
          ) : (
            <ForceGraph2D
              graphData={graphData}
              backgroundColor="#0d1117"
              nodelabel="label"
              nodeRelSize={5}
              linkColor={(l: { color?: string }) => l.color ?? "#30363d"}
              linkWidth={1.5}
              height={420}
            />
          )}
        </div>
        <div style={S.legend}>
          {LEVELS.map((l) => (
            <span key={l} style={{ color: LEVEL_META[l].color, fontSize: 12 }}>
              ● {LEVEL_META[l].label}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function modeBadge(mode: string): React.CSSProperties {
  const map: Record<string, { bg: string; fg: string }> = {
    real: { bg: "#23863622", fg: "#7ee787" },
    stub: { bg: "#21262d", fg: "#8b949e" },
    fallback: { bg: "#bf870022", fg: "#ffd479" },
  };
  const c = map[mode] ?? map["stub"]!;
  return {
    background: c.bg,
    color: c.fg,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    display: "inline-block",
  };
}

function entityChip(kind: string): React.CSSProperties {
  const colors: Record<string, string> = {
    project: "#d2a8ff",
    person: "#79c0ff",
    concept: "#7ee787",
    action: "#ffd479",
    place: "#ff7b72",
    other: "#8b949e",
  };
  return {
    background: "#161b22",
    border: `1px solid ${colors[kind] ?? "#30363d"}`,
    color: "#c9d1d9",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 4,
  };
}

function failItem(severity: string): React.CSSProperties {
  return {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 4,
    background:
      severity === "critical" ? "#da363322" : severity === "warn" ? "#bf870022" : "#161b22",
    color: severity === "critical" ? "#ff7b72" : severity === "warn" ? "#ffd479" : "#8b949e",
    border: "1px solid #30363d",
  };
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: mono,
    padding: 32,
    maxWidth: 1100,
    margin: "0 auto",
    color: "#c9d1d9",
    background: "#0d1117",
    minHeight: "100vh",
  },
  back: { color: "#79c0ff", textDecoration: "none", fontSize: 12 },
  h1: { fontSize: 24, margin: "8px 0 4px" },
  h2: { fontSize: 16, margin: "0 0 10px" },
  sub: { color: "#8b949e", fontSize: 13, lineHeight: 1.6, margin: 0 },
  dim: { color: "#8b949e", fontSize: 12, fontWeight: 400 },
  card: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
    marginBottom: 20,
  },
  section: { marginBottom: 24 },
  fieldLabel: { display: "block", fontSize: 12, color: "#8b949e", marginBottom: 6 },
  textarea: {
    width: "100%",
    background: "#0d1117",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: 8,
    fontFamily: mono,
    fontSize: 13,
    resize: "vertical",
  },
  runBtn: {
    background: "#238636",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 13,
  },
  secondaryBtn: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "8px 18px",
    cursor: "pointer",
    fontFamily: mono,
    fontSize: 13,
  },
  note: { color: "#7ee787", fontSize: 12, marginTop: 8 },
  error: { color: "#ff7b72", fontSize: 13, marginTop: 8 },
  stepRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  step: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 10,
    minWidth: 150,
    flex: "1 1 150px",
  },
  stepName: { fontSize: 12, fontWeight: 600, color: "#c9d1d9", marginBottom: 4 },
  stepOut: { fontSize: 11, color: "#8b949e", margin: "6px 0 4px", lineHeight: 1.4 },
  stepDur: { fontSize: 10, color: "#6e7681" },
  summary: { fontSize: 13, color: "#c9d1d9", margin: "0 0 10px" },
  chipRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  topicChip: {
    background: "#1f6feb22",
    color: "#79c0ff",
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 4,
  },
  entityKind: { color: "#6e7681", fontSize: 10 },
  levelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  levelCol: {
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 6,
    padding: 10,
  },
  levelHead: { fontSize: 13, fontWeight: 600, marginBottom: 8 },
  levelDesc: { fontSize: 10, color: "#6e7681", fontWeight: 400 },
  levelEmpty: { color: "#30363d", fontSize: 13, padding: "8px 0" },
  block: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  blockContent: { fontSize: 12, lineHeight: 1.4, color: "#c9d1d9" },
  importanceBar: {
    height: 3,
    background: "#21262d",
    borderRadius: 2,
    margin: "6px 0",
    overflow: "hidden",
  },
  importanceFill: { height: "100%" },
  blockEntities: { display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 },
  miniChip: {
    background: "#21262d",
    color: "#8b949e",
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 3,
  },
  graphBox: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    overflow: "hidden",
  },
  legend: { display: "flex", gap: 14, marginTop: 8 },
};
