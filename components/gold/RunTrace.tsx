"use client";

import { Badge, Stat } from "@/components/ui/primitives";
import {
  modeTone,
  pct,
  type AskResponse,
  type GoldNode,
} from "./types";

function severityTone(s: string): "info" | "warn" | "bad" {
  return s === "critical" ? "bad" : s === "warn" ? "warn" : "info";
}

export function RunTrace({ data }: { data: AskResponse }) {
  const { run, metrics, subgraph } = data;

  return (
    <div className="space-y-4">
      {/* Answer */}
      <div className="rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="mb-2 flex items-center gap-2">
          <Badge tone="brand">answer</Badge>
          <Badge tone={modeTone(metrics.llmMode)}>{metrics.llmMode} LLM</Badge>
          <Badge tone="neutral">route: {metrics.routeMode}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{run.answer}</p>
        <p className="mt-2 text-[11px] text-white/40">{run.route.reason}</p>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Confidence" value={pct(metrics.confidence)} sub="faithfulness" />
        <Stat label="Ctx relevance" value={pct(metrics.contextRelevance)} />
        <Stat label="Cost" value={metrics.estimatedCostUsd > 0 ? `$${metrics.estimatedCostUsd.toFixed(4)}` : "free"} sub={metrics.llmMode} />
        <Stat label="Latency" value={`${metrics.latencyMs}ms`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Retrieved memories */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Retrieved memories ({run.retrievedMemories.length})
          </div>
          <div className="space-y-1.5">
            {run.retrievedMemories.length === 0 && (
              <p className="text-[12px] text-white/35">No memories retrieved for this route.</p>
            )}
            {run.retrievedMemories.slice(0, 6).map((m) => (
              <div key={m.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-emerald-300/80">{m.type}</span>
                  <span className="text-[10px] text-white/40">{pct(m.score)}</span>
                </div>
                <p className="text-[12px] leading-snug text-white/75">{m.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Source docs */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Source documents ({run.retrievedDocuments.length})
          </div>
          <div className="space-y-1.5">
            {run.retrievedDocuments.length === 0 && (
              <p className="text-[12px] text-white/35">No documents retrieved for this route.</p>
            )}
            {run.retrievedDocuments.slice(0, 6).map((d) => (
              <div key={d.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-sky-200/90">{d.title}</span>
                  <span className="shrink-0 text-[10px] text-white/40">{pct(d.score)}</span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-snug text-white/55">{d.content}</p>
                <span className="text-[10px] text-white/30">{d.id}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Graph path */}
      {subgraph.nodes.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
            Graph path ({subgraph.nodes.length} nodes · {subgraph.edges.length} edges)
          </div>
          <div className="flex flex-wrap gap-1.5">
            {dedupeNodes(subgraph.nodes).slice(0, 24).map((n) => (
              <span
                key={n.id}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65"
                title={n.summary ?? n.label}
              >
                <span className="text-white/35">{n.type}</span> · {n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Failure modes */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
          Failure modes ({run.failureModes.length})
        </div>
        {run.failureModes.length === 0 ? (
          <p className="text-[12px] text-emerald-300/70">None flagged.</p>
        ) : (
          <div className="space-y-1.5">
            {run.failureModes.map((f) => (
              <div key={f.id} className="flex items-start gap-2">
                <Badge tone={severityTone(f.severity)}>{f.type}</Badge>
                <span className="text-[12px] text-white/65">{f.description}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dedupeNodes(nodes: GoldNode[]): GoldNode[] {
  const seen = new Set<string>();
  const out: GoldNode[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n);
  }
  return out;
}
