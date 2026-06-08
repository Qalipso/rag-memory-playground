/**
 * /memory — Visual Memory Lab.
 * Raw note → multi-level long-term memory, with pipeline trace + graph.
 */
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Brain, Sparkles, Layers, GitFork, Wand2 } from "lucide-react";
import { GlassCard, CardTitle } from "@/components/ui/card";
import { Badge, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-white/40">Loading graph…</div>,
});

type Level = "semantic" | "episodic" | "procedural" | "working";

interface Entity { id: string; name: string; kind: string }
interface Block {
  id: string; level: Level; content: string; entityIds: string[];
  importance: number; status: string;
}
interface Edge { id: string; from: string; to: string; kind: string; weight: number; reason: string }
interface Step {
  name: string; providerMode: string; framework: string; status: string;
  outputSummary: string; durationMs: number;
}
interface Failure { type: string; description: string; severity: string }
interface FormResult {
  noteId: string;
  classification: { topics: string[]; language: string; summary: string };
  entities: Entity[]; blocks: Block[]; newEdges: Edge[]; steps: Step[];
  providerStatus: Array<{ role: string; mode: string; name: string }>;
  failureModes: Failure[]; meta: { totalDurationMs: number };
}
interface Snapshot { blocks: Block[]; edges: Edge[]; entities: Entity[]; backend?: string }

const EXAMPLE =
  "Сегодня я понял, что много трачу на кофе. Надо сделать автоматический трекер расходов в Shadow.";

const LEVELS: Level[] = ["semantic", "episodic", "procedural", "working"];
const LV: Record<Level, { label: string; color: string; desc: string }> = {
  semantic: { label: "Semantic", color: "#5eead4", desc: "Durable facts" },
  episodic: { label: "Episodic", color: "#7dd3fc", desc: "Dated events" },
  procedural: { label: "Procedural", color: "#c4b5fd", desc: "How-to / intent" },
  working: { label: "Working", color: "#fcd34d", desc: "Active tasks" },
};
const EDGE_COLOR: Record<string, string> = {
  shares_entity: "#58a6ff", semantic_similar: "#5eead4",
  supersedes: "#fb7185", elaborates: "#c4b5fd",
};
const tone = (m: string) => (m === "real" ? "good" : m === "fallback" ? "warn" : "neutral") as
  "good" | "warn" | "neutral";

export default function MemoryLabPage() {
  const userId = "demo-user";
  const [text, setText] = useState(EXAMPLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FormResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadGraph = useCallback(async () => {
    const res = await fetch(`/api/rag-memory/memory/graph?userId=${encodeURIComponent(userId)}`);
    if (res.ok) setSnapshot((await res.json()) as Snapshot);
  }, [userId]);

  useEffect(() => { void loadGraph(); }, [loadGraph]);

  async function form() {
    setLoading(true); setError(null); setMsg(null);
    try {
      const res = await fetch("/api/rag-memory/memory/form", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, text }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as FormResult);
      await loadGraph();
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function consolidate() {
    const res = await fetch("/api/rag-memory/memory/consolidate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const d = (await res.json()) as { merged: number; supersededAcrossLevel: number; decayed: number };
      setMsg(`Consolidated: ${d.merged} merged, ${d.supersededAcrossLevel} absorbed, ${d.decayed} decayed.`);
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
        id: b.id, label: b.content.slice(0, 26), color: LV[b.level].color, val: 1 + b.importance * 3,
      })),
      links: snapshot.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
        .map((e) => ({ source: e.from, target: e.to, color: EDGE_COLOR[e.kind] ?? "#30363d" })),
    };
  }, [snapshot]);

  const activeCount = graphData.nodes.length;

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <Brain className="h-5 w-5 text-[var(--color-brand)]" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visual Memory Lab</h1>
          <p className="text-sm text-white/50">
            normalize → classify → extract → split → embed → store → link → consolidate
          </p>
        </div>
      </div>

      {/* input */}
      <GlassCard>
        <label className="mb-2 block text-xs text-white/50">Note</label>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={form} disabled={loading}>
            <Wand2 className="h-4 w-4" /> {loading ? "Forming memory…" : "Form memory"}
          </Button>
          <Button variant="glass" onClick={consolidate}>
            <Sparkles className="h-4 w-4" /> Consolidate
          </Button>
          {msg && <span className="text-xs text-emerald-300">{msg}</span>}
          {error && <span className="text-xs text-rose-300">{error}</span>}
        </div>
      </GlassCard>

      {result && (
        <>
          {/* pipeline trace */}
          <section>
            <SectionTitle icon={GitFork}>Pipeline trace</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {result.steps.map((s, i) => (
                <div key={i} className="glass min-w-[150px] flex-1 rounded-xl p-3">
                  <div className="text-xs font-semibold text-white/85">{s.name.replace("Node", "")}</div>
                  <div className="mt-1"><Badge tone={tone(s.providerMode)}>{s.providerMode}</Badge></div>
                  <div className="mt-1.5 text-[11px] leading-snug text-white/45">{s.outputSummary}</div>
                  <div className="mt-1 text-[10px] text-white/30">{s.durationMs}ms</div>
                </div>
              ))}
            </div>
          </section>

          {/* classification + entities */}
          <GlassCard>
            <div className="flex items-center justify-between">
              <CardTitle>Classification</CardTitle>
              <span className="text-xs text-white/40">
                {result.classification.language} · {result.meta.totalDurationMs}ms
              </span>
            </div>
            <p className="mt-2 text-sm text-white/80">{result.classification.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {result.classification.topics.map((t) => (
                <Badge key={t} tone="info">#{t}</Badge>
              ))}
              {result.entities.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80">
                  {e.name} <span className="text-white/35">{e.kind}</span>
                </span>
              ))}
            </div>
          </GlassCard>

          {/* blocks by level */}
          <section>
            <SectionTitle icon={Layers}>Memory blocks ({result.blocks.length})</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {LEVELS.map((lvl) => {
                const blocks = result.blocks.filter((b) => b.level === lvl);
                return (
                  <div key={lvl} className="glass rounded-xl p-3">
                    <div className="flex items-center gap-2" style={{ color: LV[lvl].color }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: LV[lvl].color }} />
                      <span className="text-sm font-semibold">{LV[lvl].label}</span>
                    </div>
                    <div className="mb-2 text-[10px] text-white/30">{LV[lvl].desc}</div>
                    {blocks.length === 0 && <div className="text-xs text-white/20">—</div>}
                    {blocks.map((b) => (
                      <div key={b.id} className="mb-2 rounded-lg border border-white/8 bg-black/20 p-2.5">
                        <div className="text-xs leading-snug text-white/85">{b.content}</div>
                        <div className="mt-2 h-1 overflow-hidden rounded bg-white/8">
                          <div className="h-full rounded" style={{ width: `${Math.round(b.importance * 100)}%`, background: LV[lvl].color }} />
                        </div>
                        {b.entityIds.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {b.entityIds.map((id) => (
                              <span key={id} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/45">
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

          {/* honesty */}
          {result.failureModes.length > 0 && (
            <GlassCard>
              <CardTitle>Honesty panel</CardTitle>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.providerStatus.map((p) => (
                  <Badge key={p.role} tone={tone(p.mode)}>{p.role}: {p.name} ({p.mode})</Badge>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                {result.failureModes.map((f, i) => (
                  <div key={i} className="rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-[11px]"
                    style={{ color: f.severity === "critical" ? "#fb7185" : f.severity === "warn" ? "#fcd34d" : "#8b95a7" }}>
                    <span className="font-semibold">{f.type}</span> — {f.description}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}

      {/* graph */}
      <section>
        <SectionTitle icon={GitFork}>
          Memory graph
          <span className="ml-2 text-xs font-normal text-white/40">
            {activeCount} active blocks · {graphData.links.length} links
            {snapshot?.backend ? ` · ${snapshot.backend}` : ""}
          </span>
        </SectionTitle>
        <GlassCard className="overflow-hidden p-0">
          {activeCount === 0 ? (
            <div className="p-8 text-sm text-white/40">No memory yet. Form a note above.</div>
          ) : (
            <ForceGraph2D
              graphData={graphData}
              backgroundColor="rgba(0,0,0,0)"
              nodeLabel="label"
              nodeRelSize={5}
              linkColor={(l) => (l as { color?: string }).color ?? "#30363d"}
              linkWidth={1.4}
              height={420}
            />
          )}
        </GlassCard>
        <div className="mt-2 flex gap-4">
          {LEVELS.map((l) => (
            <span key={l} className="text-[11px]" style={{ color: LV[l].color }}>● {LV[l].label}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/85">
      <Icon className="h-4 w-4 text-white/40" /> {children}
    </h2>
  );
}
