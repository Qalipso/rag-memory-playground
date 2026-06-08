"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { GlassCard, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/primitives";
import {
  EDGE_COLORS,
  NODE_COLORS,
  type GoldEdge,
  type GoldNode,
} from "./types";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-white/40">Loading graph…</div>,
});

interface Props {
  nodes: GoldNode[];
  edges: GoldEdge[];
  height?: number;
}

const DEFAULT_TYPES = [
  "Event",
  "Regime",
  "Hypothesis",
  "Counterexample",
  "MacroFactor",
  "PricePoint",
];

export function GoldGraph({ nodes, edges, height = 440 }: Props) {
  const allTypes = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.type))).sort(),
    [nodes]
  );
  const [active, setActive] = useState<Set<string>>(
    () => new Set(DEFAULT_TYPES.filter((t) => nodes.some((n) => n.type === t)))
  );

  function toggle(t: string) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const data = useMemo(() => {
    const visible = nodes.filter((n) => active.has(n.type));
    const ids = new Set(visible.map((n) => n.id));
    return {
      nodes: visible.map((n) => ({
        id: n.id,
        label: n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label,
        color: NODE_COLORS[n.type] ?? "#94a3b8",
        val: n.type === "Regime" ? 5 : n.type === "Event" ? 3 : 1.5,
      })),
      links: edges
        .filter((e) => ids.has(e.from) && ids.has(e.to))
        .map((e) => ({
          source: e.from,
          target: e.to,
          color: EDGE_COLORS[e.type] ?? "#3f3f46",
        })),
    };
  }, [nodes, edges, active]);

  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Gold memory graph</CardTitle>
        <span className="text-[11px] text-white/40">
          {data.nodes.length} nodes · {data.links.length} edges
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {allTypes.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition"
            style={{
              borderColor: (NODE_COLORS[t] ?? "#94a3b8") + (active.has(t) ? "" : "33"),
              color: active.has(t) ? NODE_COLORS[t] ?? "#94a3b8" : "#ffffff55",
              background: active.has(t) ? (NODE_COLORS[t] ?? "#94a3b8") + "18" : "transparent",
            }}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: NODE_COLORS[t] ?? "#94a3b8" }}
            />
            {t}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/5 bg-black/20" style={{ height }}>
        <ForceGraph2D
          graphData={data}
          height={height}
          nodeRelSize={4}
          backgroundColor="rgba(0,0,0,0)"
          linkColor={(l) => (l as { color?: string }).color ?? "#3f3f46"}
          linkWidth={1.2}
          nodeLabel="label"
        />
      </div>
      <p className="mt-2 text-[11px] text-white/35">
        Toggle node types to filter. Edge colors encode relations: green = increases demand /
        supports, red = reduces demand / contradicts, amber = triggered / regime change.
      </p>
    </GlassCard>
  );
}
