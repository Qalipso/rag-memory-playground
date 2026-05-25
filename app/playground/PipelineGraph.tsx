"use client";

/**
 * PipelineGraph — visualises the client-side RAG pipeline result.
 *
 * Layout:
 *   Source file nodes  →  memory block nodes  →  knowledge-type hub nodes
 *
 * Hubs (Feature / Decision / Risk / Todo / Concept) sit at the centre;
 * they are large glowing circles whose size scales with how many blocks
 * belong to them.  Block nodes (coloured by type) form the middle ring.
 * Source file nodes are on the outer ring.
 *
 * All positions emerge from d3-force with a strong charge repulsion so
 * nodes never overlap.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockType, MemoryBlock, MemoryChunk, SourceFile } from "../src/mvp/types";

// react-force-graph-2d uses browser APIs; must be client-only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 24, color: "#8b949e", textAlign: "center" }}>
      Loading graph engine…
    </div>
  ),
});

// ─── Colours ──────────────────────────────────────────────────────────────────

const BLOCK_COLORS: Record<BlockType, string> = {
  Feature:  "#79c0ff",
  Decision: "#d2a8ff",
  Risk:     "#ff7b72",
  Todo:     "#ffd479",
  Concept:  "#7ee787",
};

function sourceColor(kind: string): string {
  if (kind === "code") return "#79c0ff";
  if (kind === "json" || kind === "config") return "#ffd479";
  return "#f78166"; // md / txt / docs
}

// ─── Graph node / link types ──────────────────────────────────────────────────

interface GNode {
  id: string;
  label: string;
  nodeType: "hub" | "source" | "block";
  color: string;
  val: number;
  subtitle?: string;
  /** Original record ID for lookup (src.id or block.id or block type for hub) */
  recordId?: string;
}

interface GLink {
  source: string;
  target: string;
  linkColor: string;
  linkWidth: number;
}

// ─── Build graph ──────────────────────────────────────────────────────────────

function buildGraph(
  sources: SourceFile[],
  blocks: MemoryBlock[],
): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [];
  const links: GLink[] = [];

  if (sources.length === 0 || blocks.length === 0) return { nodes, links };

  const indexed = sources.filter((s) => s.status === "indexed");

  // 1. Hub nodes — one per block type actually present.
  const activeTypes = new Set<BlockType>(blocks.map((b) => b.type));
  for (const t of ["Feature", "Decision", "Risk", "Todo", "Concept"] as const) {
    if (!activeTypes.has(t)) continue;
    const count = blocks.filter((b) => b.type === t).length;
    nodes.push({
      id: `hub-${t}`,
      label: t,
      nodeType: "hub",
      color: BLOCK_COLORS[t],
      val: 22 + count * 3,
      subtitle: `${count} block${count !== 1 ? "s" : ""}`,
      recordId: t,
    });
  }

  // 2. Source nodes.
  for (const src of indexed) {
    nodes.push({
      id: `src-${src.id}`,
      label: src.name,
      nodeType: "source",
      color: sourceColor(src.type),
      val: 10 + src.chunkCount,
      subtitle: `${src.chunkCount} chunk${src.chunkCount !== 1 ? "s" : ""}`,
      recordId: src.id,
    });
  }

  // 3. Block nodes + links to hub + links from sources.
  for (const b of blocks) {
    const bColor = BLOCK_COLORS[b.type];
    nodes.push({
      id: `blk-${b.id}`,
      label: b.title.length > 32 ? `${b.title.slice(0, 30)}…` : b.title,
      nodeType: "block",
      color: bColor,
      val: 5 + Math.round(b.confidence * 8),
      subtitle: b.summary,
      recordId: b.id,
    });

    // Block → its type hub.
    links.push({
      source: `blk-${b.id}`,
      target: `hub-${b.type}`,
      linkColor: `${bColor}99`,
      linkWidth: 1.6,
    });

    // Source → block (one link per matching source).
    for (const sName of b.sources) {
      const src = indexed.find(
        (s) => s.name === sName || s.path === sName || s.path.endsWith(`/${sName}`),
      );
      if (!src) continue;
      links.push({
        source: `src-${src.id}`,
        target: `blk-${b.id}`,
        linkColor: "rgba(139,148,158,0.35)",
        linkWidth: 1,
      });
    }
  }

  return { nodes, links };
}

// ─── Node drawing ─────────────────────────────────────────────────────────────

function drawNode(
  node: object,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
): void {
  const n = node as GNode & { x?: number; y?: number };
  if (n.x === undefined || n.y === undefined) return;

  const r = Math.sqrt(n.val) * 3.2;

  // Glow for hubs.
  if (n.nodeType === "hub") {
    ctx.shadowBlur = 20;
    ctx.shadowColor = n.color;
  }

  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

  if (n.nodeType === "hub") {
    ctx.fillStyle = n.color;
  } else if (n.nodeType === "source") {
    ctx.fillStyle = n.color + "bb";
    ctx.strokeStyle = n.color;
    ctx.lineWidth = 1.5 / globalScale;
    ctx.stroke();
  } else {
    ctx.fillStyle = n.color + "aa";
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  // Labels — hubs always visible; sources/blocks only when zoomed.
  const minScale = n.nodeType === "hub" ? 0 : n.nodeType === "source" ? 0.4 : 1;
  if (globalScale >= minScale) {
    const baseFontSize =
      n.nodeType === "hub" ? 12 : n.nodeType === "source" ? 10 : 8;
    const fontSize = baseFontSize / globalScale;
    ctx.font = `${n.nodeType === "hub" ? "bold " : ""}${fontSize}px ui-monospace, monospace`;
    ctx.textAlign = "center";

    if (n.nodeType === "hub") {
      // Label centred inside hub circle.
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#0d1117";
      ctx.fillText(n.label, n.x, n.y);
    } else {
      // Label below circle.
      ctx.textBaseline = "top";
      ctx.fillStyle = "#e6edf3cc";
      ctx.fillText(n.label, n.x, n.y + r + 2 / globalScale);
    }
  }
}

function paintHitArea(
  node: object,
  color: string,
  ctx: CanvasRenderingContext2D,
): void {
  const n = node as GNode & { x?: number; y?: number };
  if (n.x === undefined || n.y === undefined) return;
  const r = Math.sqrt(n.val) * 3.2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface PipelineGraphProps {
  sources: SourceFile[];
  blocks: MemoryBlock[];
  chunks: MemoryChunk[];
}

export default function PipelineGraph({ sources, blocks, chunks }: PipelineGraphProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [selected, setSelected] = useState<GNode | null>(null);

  // Responsive width from container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setSize({ width: Math.floor(e.contentRect.width), height: 520 });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const data = useMemo(() => buildGraph(sources, blocks), [sources, blocks]);

  // Apply strong repulsion after data changes.
  useEffect(() => {
    if (data.nodes.length === 0) return;
    const t = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force("charge");
      if (charge) charge.strength(-280);
      fg.d3ReheatSimulation();
    }, 350);
    return () => clearTimeout(t);
  }, [data]);

  if (sources.filter((s) => s.status === "indexed").length === 0) {
    return (
      <p style={{ color: "#8b949e", fontSize: 14, padding: "12px 0" }}>
        No indexed sources. Load files in Setup first.
      </p>
    );
  }

  if (blocks.length === 0) {
    return (
      <p style={{ color: "#8b949e", fontSize: 14, padding: "12px 0" }}>
        No memory blocks extracted yet.
      </p>
    );
  }

  const activeTypes = [...new Set<BlockType>(blocks.map((b) => b.type))];

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      {/* Legend */}
      <div style={legendRow}>
        {activeTypes.map((t) => (
          <span key={t} style={legendItem}>
            <Dot color={BLOCK_COLORS[t]} />
            {t}
          </span>
        ))}
        <span style={legendItem}>
          <Dot color="#f78166" />
          Doc / text
        </span>
        <span style={legendItem}>
          <Dot color="#79c0ff" />
          Code file
        </span>
        <span style={{ ...legendItem, marginLeft: "auto", color: "#8b949e" }}>
          {data.nodes.length} nodes · {data.links.length} links
        </span>
      </div>

      {/* Graph canvas */}
      <div style={{ borderRadius: 6, overflow: "hidden" }}>
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={size.width}
          height={size.height}
          backgroundColor="#0d1117"
          nodeRelSize={1}
          nodeVal={(n: object) => (n as GNode).val}
          nodeColor={(n: object) => (n as GNode).color}
          linkColor={(l: object) => (l as GLink).linkColor}
          linkWidth={(l: object) => (l as GLink).linkWidth}
          linkCurvature={0.18}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={(l: object) => (l as GLink).linkColor}
          cooldownTicks={300}
          warmupTicks={80}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.2}
          nodeCanvasObject={drawNode}
          nodeCanvasObjectMode={() => "replace"}
          nodePointerAreaPaint={paintHitArea}
          onNodeClick={(n: object) => setSelected(n as GNode)}
          onBackgroundClick={() => setSelected(null)}
        />
      </div>

      <p style={{ color: "#8b949e", fontSize: 12, marginTop: 8, textAlign: "center" }}>
        Source files → memory blocks → knowledge-type hubs · Drag to pan · scroll to zoom · click node for details
      </p>

      {/* Node detail panel */}
      {selected && (
        <NodeDetail
          node={selected}
          sources={sources}
          blocks={blocks}
          chunks={chunks}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── Node Detail Panel ────────────────────────────────────────────────────────

const BLOCK_COLORS_PAGE: Record<BlockType, { bg: string; fg: string }> = {
  Feature:  { bg: "#1f6feb22", fg: "#79c0ff" },
  Decision: { bg: "#a371f722", fg: "#d2a8ff" },
  Risk:     { bg: "#da363322", fg: "#ff7b72" },
  Todo:     { bg: "#bf870022", fg: "#ffd479" },
  Concept:  { bg: "#1a7f3722", fg: "#7ee787" },
};

function blockBadgeStyle(type: BlockType): React.CSSProperties {
  const c = BLOCK_COLORS_PAGE[type];
  return { background: c.bg, color: c.fg, border: `1px solid ${c.fg}`, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 };
}

function NodeDetail({
  node, sources, blocks, chunks, onClose,
}: {
  node: GNode;
  sources: SourceFile[];
  blocks: MemoryBlock[];
  chunks: MemoryChunk[];
  onClose: () => void;
}) {
  const panelContent = () => {
    if (node.nodeType === "source" && node.recordId) {
      const src = sources.find((s) => s.id === node.recordId);
      if (!src) return null;
      const srcChunks = chunks.filter((c) => c.sourceId === src.id);
      return (
        <>
          <div style={D.row}>
            <span style={D.pathMuted}>{src.path}</span>
            <span style={{ ...D.typeBadge, background: node.color + "22", color: node.color, border: `1px solid ${node.color}44` }}>{src.type}</span>
            <span style={D.confBadge}>{src.chunkCount} chunks</span>
          </div>
          {src.summary && <p style={D.summary}>{src.summary}</p>}
          {srcChunks.length > 0 && (
            <div style={D.section}>
              <div style={D.sectionLabel}>CHUNKS ({srcChunks.length})</div>
              <div style={D.chunkList}>
                {srcChunks.map((c) => (
                  <div key={c.id} style={D.chunkRow}>
                    <div style={D.chunkMeta}>
                      <code style={D.chunkId}>{c.id}</code>
                      <span style={D.mutedSm}>{c.charCount} chars</span>
                      {c.keywords.length > 0 && (
                        <span style={D.mutedSm}>{c.keywords.slice(0, 4).join(", ")}</span>
                      )}
                    </div>
                    <pre style={D.chunkPreview}>{c.text.slice(0, 200)}{c.text.length > 200 ? "…" : ""}</pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      );
    }

    if (node.nodeType === "block" && node.recordId) {
      const blk = blocks.find((b) => b.id === node.recordId);
      if (!blk) return null;
      return (
        <>
          <div style={D.row}>
            <span style={blockBadgeStyle(blk.type)}>{blk.type}</span>
            <span style={D.confBadge}>conf {blk.confidence.toFixed(2)}</span>
          </div>
          <p style={D.summary}>{blk.summary}</p>
          {blk.evidence.length > 0 && (
            <div style={D.section}>
              <div style={D.sectionLabel}>EVIDENCE</div>
              {blk.evidence.map((e, i) => (
                <div key={i} style={D.evidence}>"{e}"</div>
              ))}
            </div>
          )}
          <div style={D.section}>
            <div style={D.sectionLabel}>SOURCES</div>
            <div style={D.tagRow}>
              {blk.sources.map((s) => <span key={s} style={D.tag}>{s}</span>)}
            </div>
          </div>
          <div style={D.section}>
            <div style={D.sectionLabel}>CHUNKS</div>
            <div style={D.tagRow}>
              {blk.chunkIds.map((c) => <code key={c} style={D.chunkId}>{c}</code>)}
            </div>
          </div>
        </>
      );
    }

    if (node.nodeType === "hub" && node.recordId) {
      const hubBlocks = blocks.filter((b) => b.type === node.recordId);
      return (
        <>
          <div style={D.row}>
            <span style={D.confBadge}>{hubBlocks.length} block{hubBlocks.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={D.section}>
            <div style={D.sectionLabel}>BLOCKS IN THIS CATEGORY</div>
            <div style={D.blockList}>
              {hubBlocks.map((b) => (
                <div key={b.id} style={D.blockItem}>
                  <div style={D.blockItemHead}>
                    <strong style={{ fontSize: 13, color: "#e6edf3" }}>{b.title}</strong>
                    <span style={{ fontSize: 11, color: "#8b949e" }}>conf {b.confidence.toFixed(2)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#8b949e", lineHeight: 1.4 }}>{b.summary}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div style={detailPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <strong style={{ fontSize: 14, color: node.color }}>{node.label}</strong>
        <button style={closeBtn} onClick={onClose}>✕</button>
      </div>
      {panelContent()}
    </div>
  );
}

// ─── Detail styles ─────────────────────────────────────────────────────────────

const D = {
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 } as React.CSSProperties,
  pathMuted: { fontSize: 11, color: "#8b949e", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties,
  typeBadge: { padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, flexShrink: 0 } as React.CSSProperties,
  confBadge: { background: "#21262d", color: "#c9d1d9", padding: "1px 8px", borderRadius: 3, fontSize: 11, flexShrink: 0 } as React.CSSProperties,
  summary: { fontSize: 13, color: "#c9d1d9", lineHeight: 1.5, margin: "8px 0" } as React.CSSProperties,
  section: { marginTop: 10 } as React.CSSProperties,
  sectionLabel: { fontSize: 10, color: "#8b949e", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 6 } as React.CSSProperties,
  chunkList: { display: "flex", flexDirection: "column", gap: 6 } as React.CSSProperties,
  chunkRow: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 4, padding: "8px 10px" } as React.CSSProperties,
  chunkMeta: { display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" } as React.CSSProperties,
  chunkId: { background: "#21262d", color: "#79c0ff", padding: "1px 6px", borderRadius: 3, fontSize: 11 } as React.CSSProperties,
  mutedSm: { fontSize: 11, color: "#8b949e" } as React.CSSProperties,
  chunkPreview: { margin: 0, fontSize: 11, color: "#8b949e", whiteSpace: "pre-wrap", lineHeight: 1.5, fontFamily: "inherit" } as React.CSSProperties,
  evidence: { fontSize: 12, color: "#8b949e", fontStyle: "italic", lineHeight: 1.5, borderLeft: "2px solid #30363d", paddingLeft: 8, marginBottom: 4 } as React.CSSProperties,
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap" } as React.CSSProperties,
  tag: { background: "#21262d", color: "#c9d1d9", padding: "1px 8px", borderRadius: 3, fontSize: 11 } as React.CSSProperties,
  blockList: { display: "flex", flexDirection: "column", gap: 8 } as React.CSSProperties,
  blockItem: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 4, padding: "8px 10px" } as React.CSSProperties,
  blockItemHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 8 } as React.CSSProperties,
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const legendRow: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: "1px solid #21262d",
};

const legendItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11,
  color: "#c9d1d9",
};

const detailPanel: React.CSSProperties = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: 6,
  padding: 14,
  marginTop: 10,
};

const typeBadge: React.CSSProperties = {
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
};

const closeBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#8b949e",
  cursor: "pointer",
  fontSize: 14,
  padding: 0,
  fontFamily: "inherit",
};
