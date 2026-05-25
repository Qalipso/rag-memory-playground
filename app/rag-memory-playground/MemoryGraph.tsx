"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

// react-force-graph-2d uses HTML canvas + browser APIs only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div style={{ padding: 24, color: "#8b949e" }}>Loading graph…</div>,
});

// ---------- Types ----------

interface MemoryItem {
  id: string;
  type: "working" | "episodic" | "semantic" | "procedural";
  content: string;
  score: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

interface MemoriesResponse {
  userId: string;
  provider: {
    name: string;
    framework: string;
    mode: "real" | "stub" | "fallback";
    reason: string;
  } | null;
  memories: MemoryItem[];
  count: number;
}

interface KnowledgeSource {
  id: string;
  type: "link" | "file" | "sample" | "github" | "manual";
  title: string;
  url?: string;
  tags: string[];
  status: "queued" | "indexing" | "indexed" | "failed";
  charsExtracted: number;
  chunksCreated: number;
  providerMode: "real" | "stub" | "fallback";
  contentPreview?: string;
}

interface SourcesResponse {
  sources: KnowledgeSource[];
  totalSources: number;
  totalChunks: number;
  ragMode: "real" | "stub" | "fallback";
}

type NodeKind = "type" | "memory" | "tag" | "doc-hub" | "doc";

interface GraphNode {
  id: string;
  label: string;
  color: string;
  size: number;
  kind: NodeKind;
  detail: string;
  content?: string;
  url: string;
  memoryType?: MemoryItem["type"];
  status?: string;
  // dynamic position fields populated by force-graph
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  kind: string;
}

// ---------- Constants ----------

const TYPE_COLOR: Record<MemoryItem["type"], string> = {
  semantic: "#79c0ff",
  episodic: "#7ee787",
  procedural: "#ffd479",
  working: "#d2a8ff",
};

const TYPE_LABEL: Record<MemoryItem["type"], string> = {
  semantic: "Semantic",
  episodic: "Episodic",
  procedural: "Procedural",
  working: "Working",
};

const DOC_COLOR = "#f0883e";
const TAG_COLOR = "#8b949e";

// ---------- Component ----------

export default function MemoryGraph({ userId }: { userId: string }) {
  const [memData, setMemData] = useState<MemoriesResponse | null>(null);
  const [srcData, setSrcData] = useState<SourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [memRes, srcRes] = await Promise.all([
        fetch(`/api/rag-memory/memories?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/rag-memory/sources`),
      ]);
      if (!memRes.ok) throw new Error(`Memories: HTTP ${memRes.status}`);
      if (!srcRes.ok) throw new Error(`Sources: HTTP ${srcRes.status}`);
      setMemData((await memRes.json()) as MemoriesResponse);
      setSrcData((await srcRes.json()) as SourcesResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Resize observer for responsive canvas
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(
    () => buildGraph(memData?.memories ?? [], srcData?.sources ?? []),
    [memData, srcData],
  );

  // Apply repulsion force after graph mounts / data changes.
  // Delay needed: dynamic import + data fetch complete asynchronously.
  useEffect(() => {
    if (data.nodes.length === 0) return;
    const timer = setTimeout(() => {
      const fg = fgRef.current;
      if (!fg) return;
      const charge = fg.d3Force("charge");
      if (charge) charge.strength(-350);
      fg.d3ReheatSimulation();
    }, 300);
    return () => clearTimeout(timer);
  }, [data]);

  const memProvider = memData?.provider;
  const ragMode = srcData?.ragMode;

  return (
    <div>
      <div style={S.toolbar}>
        <div>
          <strong>User:</strong> {userId}
          {memData && (
            <span style={S.muted}>
              {" · "}
              {memData.count} memor{memData.count === 1 ? "y" : "ies"}{" "}
              <code style={S.code}>{memProvider?.name}</code>
              <span style={S.modeBadge(memProvider?.mode ?? "stub")}>
                {memProvider?.mode}
              </span>
            </span>
          )}
          {srcData && (
            <span style={S.muted}>
              {" · "}
              {srcData.totalSources} source{srcData.totalSources === 1 ? "" : "s"} ·{" "}
              {srcData.totalChunks} chunks{" "}
              <span style={S.modeBadge(ragMode ?? "stub")}>{ragMode}</span>
            </span>
          )}
        </div>
        <button style={S.smallButton} onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div style={S.error}>Error: {error}</div>}

      <div style={S.legend}>
        {(Object.keys(TYPE_LABEL) as MemoryItem["type"][]).map((t) => (
          <div key={t} style={S.legendChip}>
            <span style={{ ...S.dot, background: TYPE_COLOR[t] }} />
            {TYPE_LABEL[t]} memory
          </div>
        ))}
        <div style={S.legendChip}>
          <span style={{ ...S.dot, background: DOC_COLOR }} />
          Document / Source
        </div>
        <div style={S.legendChip}>
          <span style={{ ...S.dot, background: TAG_COLOR }} />
          Tag
        </div>
      </div>

      <div ref={containerRef} style={S.graphWrap}>
        {data.nodes.length > 0 ? (
          <ForceGraph2D
            ref={fgRef}
            graphData={data}
            width={size.width}
            height={size.height}
            backgroundColor="#0d1117"
            nodeRelSize={8}
            nodeVal={(n: object) => (n as GraphNode).size}
            nodeColor={(n: object) => (n as GraphNode).color}
            linkColor={() => "rgba(140, 160, 190, 0.28)"}
            linkWidth={1.2}
            linkCurvature={0.18}
            linkDirectionalParticles={1}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleColor={() => "rgba(140, 190, 255, 0.7)"}
            cooldownTicks={300}
            warmupTicks={80}
            d3AlphaDecay={0.015}
            d3VelocityDecay={0.2}
            nodeCanvasObject={drawNode}
            nodeCanvasObjectMode={() => "after"}
            nodePointerAreaPaint={paintHitArea}
            onNodeClick={(n: object) => setSelected(n as GraphNode)}
            onBackgroundClick={() => setSelected(null)}
          />
        ) : (
          <div style={S.placeholder}>
            {loading ? "Loading memories and sources…" : "No memories or sources yet."}
          </div>
        )}
      </div>

      {selected && (
        <div style={S.detail}>
          <div style={S.detailHead}>
            <span style={{ ...S.tag, background: selected.color, color: "#0d1117" }}>
              {selected.kind === "memory"
                ? selected.memoryType
                : selected.kind === "doc"
                ? "document"
                : selected.kind === "doc-hub"
                ? "documents"
                : selected.kind}
            </span>
            <code style={S.code}>{selected.id}</code>
            {selected.url && (
              <a href={selected.url} target="_blank" rel="noreferrer" style={S.urlLink}>
                {selected.url}
              </a>
            )}
          </div>
          <p style={S.detailBody}>{selected.detail || selected.label}</p>
          {selected.content && (
            <pre style={S.contentBox}>{selected.content}</pre>
          )}
        </div>
      )}

      {!selected && (memData || srcData) && data.nodes.length > 0 && (
        <p style={S.hint}>
          Drag to pan · scroll to zoom · click a node for details. Memory hubs in their type
          colors; documents in orange.
        </p>
      )}
    </div>
  );
}

// ---------- Node rendering ----------

function drawNode(node: object, ctx: CanvasRenderingContext2D, globalScale: number) {
  const n = node as GraphNode;
  const fontSize = Math.max(10 / globalScale, 2);
  // Only show labels for hubs always, others when zoomed in enough
  const showLabel = n.kind === "type" || n.kind === "doc-hub" || globalScale > 2.5;
  if (!showLabel) return;
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const text = n.label;
  const textWidth = ctx.measureText(text).width;
  const padX = 3 / globalScale;
  const padY = 2 / globalScale;
  const x = n.x ?? 0;
  const y = (n.y ?? 0) + (n.size + fontSize) / globalScale;
  ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
  ctx.fillRect(x - textWidth / 2 - padX, y - fontSize / 2 - padY, textWidth + padX * 2, fontSize + padY * 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#e6edf3";
  ctx.fillText(text, x, y);
}

function paintHitArea(node: object, color: string, ctx: CanvasRenderingContext2D) {
  const n = node as GraphNode;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(n.x ?? 0, n.y ?? 0, n.size + 2, 0, 2 * Math.PI);
  ctx.fill();
}

// ---------- Graph builder ----------

function buildGraph(
  memories: MemoryItem[],
  sources: KnowledgeSource[],
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  const pushNode = (n: GraphNode) => {
    if (nodeIds.has(n.id)) return;
    nodeIds.add(n.id);
    nodes.push(n);
  };

  // Memory type hubs
  const typesUsed = new Set<MemoryItem["type"]>();
  for (const m of memories) typesUsed.add(m.type);
  for (const t of typesUsed) {
    pushNode({
      id: `type:${t}`,
      label: TYPE_LABEL[t],
      color: TYPE_COLOR[t],
      size: 10,
      kind: "type",
      detail: `Hub for ${TYPE_LABEL[t]} memories.`,
      url: "",
    });
  }

  // Memory items
  for (const m of memories) {
    pushNode({
      id: m.id,
      label: shortLabel(m.content),
      color: TYPE_COLOR[m.type],
      size: 4,
      kind: "memory",
      memoryType: m.type,
      detail: m.content,
      url: "",
    });
    links.push({ source: `type:${m.type}`, target: m.id, kind: "type-mem" });
  }

  // Documents hub + nodes
  if (sources.length > 0) {
    pushNode({
      id: "hub:documents",
      label: `Documents (${sources.length})`,
      color: DOC_COLOR,
      size: 11,
      kind: "doc-hub",
      detail: `Hub for ${sources.length} indexed source${sources.length === 1 ? "" : "s"}.`,
      url: "",
    });
    for (const s of sources) {
      pushNode({
        id: s.id,
        label: shortLabel(s.title),
        color: s.status === "failed" ? "#ff7b72" : DOC_COLOR,
        size: Math.min(7, 3 + Math.log2(Math.max(1, s.chunksCreated))),
        kind: "doc",
        detail: `${s.title} · ${s.chunksCreated} chunks · ${s.charsExtracted.toLocaleString()} chars · ${s.status}`,
        content: s.contentPreview,
        url: s.url ?? "",
        status: s.status,
      });
      links.push({ source: "hub:documents", target: s.id, kind: "doc-hub" });
    }
  }

  // Tags shared by ≥2 owners
  const tagToOwners = new Map<string, string[]>();
  const pushTag = (tag: string, ownerId: string) => {
    const key = tag.trim().toLowerCase();
    if (!key) return;
    const bucket = tagToOwners.get(key) ?? [];
    bucket.push(ownerId);
    tagToOwners.set(key, bucket);
  };
  for (const m of memories) {
    const meta = m.metadata as Record<string, unknown> | undefined;
    const tags = Array.isArray(meta?.["tags"]) ? (meta!["tags"] as unknown[]) : [];
    for (const raw of tags) if (typeof raw === "string") pushTag(raw, m.id);
  }
  for (const s of sources) for (const tag of s.tags) pushTag(tag, s.id);

  for (const [tag, owners] of tagToOwners) {
    if (owners.length < 2) continue;
    const id = `tag:${tag}`;
    pushNode({
      id,
      label: `#${tag}`,
      color: TAG_COLOR,
      size: 3,
      kind: "tag",
      detail: `Tag shared by ${owners.length} items.`,
      url: "",
    });
    for (const ownerId of owners) {
      if (nodeIds.has(ownerId)) links.push({ source: ownerId, target: id, kind: "tag" });
    }
  }

  // Drop dangling links (defensive)
  const filteredLinks = links.filter(
    (l) => nodeIds.has(l.source) && nodeIds.has(l.target),
  );

  return { nodes, links: filteredLinks };
}

function shortLabel(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 28) return trimmed;
  return trimmed.slice(0, 26) + "…";
}

// ---------- Styles ----------

const S = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 10,
  } as const,
  smallButton: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "6px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
  } as const,
  legend: { display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12 } as const,
  legendChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "#c9d1d9",
  } as const,
  dot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" } as const,
  graphWrap: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    overflow: "hidden",
    height: 560,
    position: "relative",
  } as const,
  placeholder: {
    color: "#8b949e",
    fontSize: 13,
    padding: 24,
    textAlign: "center",
  } as const,
  detail: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
    marginTop: 14,
  } as const,
  detailHead: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
  } as const,
  detailBody: { color: "#c9d1d9", fontSize: 14, lineHeight: 1.5 },
  hint: { color: "#8b949e", fontSize: 12, marginTop: 12 },
  muted: { color: "#8b949e", fontSize: 12 },
  error: { color: "#ffb4b4", background: "#3a1414", padding: 10, borderRadius: 4 } as const,
  code: {
    background: "#21262d",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
    marginRight: 6,
  } as const,
  tag: { padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600 } as const,
  urlLink: { color: "#79c0ff", fontSize: 11, textDecoration: "none" } as const,
  contentBox: {
    margin: "8px 0 0",
    fontSize: 11,
    color: "#8b949e",
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: "10px 12px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 240,
    overflowY: "auto",
    lineHeight: 1.5,
  } as React.CSSProperties,
  modeBadge: (mode: "real" | "stub" | "fallback") =>
    ({
      background: mode === "real" ? "#1f6feb" : mode === "fallback" ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "1px 8px",
      borderRadius: 3,
      fontSize: 10,
      marginLeft: 8,
    }) as const,
};
