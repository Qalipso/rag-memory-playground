"use client";

import { useEffect, useRef, useState } from "react";

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
  createdAt: string;
  lastIndexedAt: string;
  error?: string;
}

interface ListResponse {
  sources: KnowledgeSource[];
  totalSources: number;
  totalChunks: number;
  ragMode: "real" | "stub" | "fallback";
}

interface TestResult {
  ok: boolean;
  hits: { id: string; title: string; score: number; reason: string }[];
  totalHits: number;
}

const TYPE_LABEL: Record<KnowledgeSource["type"], string> = {
  link: "Link",
  file: "File",
  sample: "Sample",
  github: "GitHub",
  manual: "Manual",
};

interface UploadOutcome {
  fileName: string;
  relativePath: string;
  status: "indexed" | "skipped" | "failed";
  reason?: string;
  charsExtracted?: number;
  chunksCreated?: number;
}

interface UploadSummary {
  totals: { indexed: number; skipped: number; failed: number };
  outcomes: UploadOutcome[];
  startedAt: number;
  finishedAt: number;
}

export default function KnowledgeSources() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [adding, setAdding] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/rag-memory/sources");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ListResponse;
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addLink() {
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/rag-memory/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "link",
          url: url.trim(),
          title: title.trim() || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok && !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setUrl("");
      setTitle("");
      setTags("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function loadSamples() {
    setLoadingSamples(true);
    setError(null);
    try {
      const res = await fetch("/api/rag-memory/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "samples" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingSamples(false);
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    setUploadProgress(`Preparing ${fileList.length} file(s)…`);

    const startedAt = Date.now();
    const form = new FormData();
    let queued = 0;
    const MAX_FILES = 200;
    for (let i = 0; i < fileList.length && queued < MAX_FILES; i++) {
      const f = fileList.item(i);
      if (!f) continue;
      // Browsers expose webkitRelativePath on files from directory pickers.
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const key = `f_${i}`;
      form.append(key, f, f.name);
      form.append(`relativePath_${key}`, relPath);
      queued++;
    }
    setUploadProgress(`Uploading ${queued} file(s)…`);

    try {
      const res = await fetch("/api/rag-memory/sources/upload", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        totals?: UploadSummary["totals"];
        outcomes?: UploadOutcome[];
      };
      if (!res.ok && !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setUploadSummary({
        totals: json.totals ?? { indexed: 0, skipped: 0, failed: 0 },
        outcomes: json.outcomes ?? [],
        startedAt,
        finishedAt: Date.now(),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  async function deleteSource(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/rag-memory/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function resync(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/rag-memory/sources/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resync" }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function testSource(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/rag-memory/sources/${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "test" }),
      });
      const json = (await res.json()) as TestResult;
      setTestResult({ ...testResult, [id]: json });
    } finally {
      setBusyId(null);
    }
  }

  const userSources = data?.sources.filter((s) => s.type !== "sample").length ?? 0;
  const sampleSources = data?.sources.filter((s) => s.type === "sample").length ?? 0;
  const seedChunks = (data?.totalChunks ?? 0) - (data?.sources.reduce((sum, s) => sum + s.chunksCreated, 0) ?? 0);

  return (
    <div>
      <h3 style={S.question}>What should the AI know?</h3>
      <p style={S.helper}>
        Pick a starting source. Retrieval will index it and run on every query.
      </p>

      {/* Start here — primary actions in one row */}
      <div style={S.startHere}>
        <span style={S.startLabel}>Start here:</span>
        <button
          style={S.primaryButton}
          disabled={loadingSamples}
          onClick={loadSamples}
          type="button"
        >
          {loadingSamples ? "Loading…" : "Use Sample Docs"}
        </button>
        <button
          style={S.primaryButton}
          type="button"
          onClick={() => document.getElementById("knowledge-link-url")?.focus()}
        >
          Add Link
        </button>
        <button
          style={S.primaryButton}
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload Files
        </button>
        <button
          style={S.primaryButton}
          type="button"
          disabled={uploading}
          onClick={() => folderInputRef.current?.click()}
        >
          Upload Folder
        </button>
        <button style={S.secondaryButton} type="button" disabled title="Coming next">
          Connect GitHub
        </button>

        {/* Hidden inputs driven by buttons above. */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error — webkitdirectory is a non-standard but widely supported attribute.
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {(uploading || uploadProgress) && (
        <div style={S.uploadProgress}>{uploadProgress || "Uploading…"}</div>
      )}

      {uploadSummary && (
        <div style={S.uploadSummary}>
          <div style={S.uploadHead}>
            <strong>Upload complete</strong>
            <span style={S.muted}>
              {uploadSummary.totals.indexed} indexed · {uploadSummary.totals.skipped} skipped ·{" "}
              {uploadSummary.totals.failed} failed ·{" "}
              {Math.round((uploadSummary.finishedAt - uploadSummary.startedAt) / 100) / 10}s
            </span>
            <button
              style={S.smallButton}
              type="button"
              onClick={() => setUploadSummary(null)}
            >
              Dismiss
            </button>
          </div>
          {uploadSummary.outcomes.filter((o) => o.status !== "indexed").length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary style={S.detailsSummary}>
                Show {uploadSummary.totals.skipped + uploadSummary.totals.failed} skipped/failed
              </summary>
              <ul style={S.outcomeList}>
                {uploadSummary.outcomes
                  .filter((o) => o.status !== "indexed")
                  .slice(0, 50)
                  .map((o, i) => (
                    <li key={i} style={S.outcomeRow}>
                      <span style={S.outcomeStatus(o.status)}>{o.status}</span>{" "}
                      <code style={S.codeChip}>{o.relativePath}</code>{" "}
                      <span style={S.muted}>{o.reason ?? ""}</span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {data && (
        <p style={S.statsLine}>
          {userSources} user source{userSources === 1 ? "" : "s"}
          {sampleSources > 0 && ` · ${sampleSources} loaded sample${sampleSources === 1 ? "" : "s"}`}
          {" · "}
          {seedChunks > 0 ? `${seedChunks} built-in demo chunks` : `${data.totalChunks} total chunks`}
          {" · "}
          {data.ragMode === "real" ? "real retrieval" : data.ragMode === "fallback" ? "local retrieval (fallback)" : "local retrieval"}
        </p>
      )}

      <div style={S.linkForm}>
        <h4 style={S.h4}>Add Link</h4>
        <div style={S.formRow}>
          <input
            id="knowledge-link-url"
            style={{ ...S.input, flex: 2 }}
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            style={{ ...S.input, flex: 1 }}
            placeholder="tags, comma, separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button
            style={S.primaryButton}
            type="button"
            disabled={adding || !url.trim()}
            onClick={addLink}
          >
            {adding ? "Indexing…" : "Index Link"}
          </button>
        </div>
      </div>

      {error && <div style={S.error}>Error: {error}</div>}

      <div style={S.sourceList}>
        {data?.sources.length === 0 && (
          <p style={S.muted}>
            No sources yet. Use a sample doc, paste a URL, or upload a file.
          </p>
        )}
        {data?.sources.map((s) => {
          const result = testResult[s.id];
          return (
            <div key={s.id} style={S.sourceCard}>
              <div style={S.cardHead}>
                <div>
                  <div style={S.cardTitle}>{s.title}</div>
                  <div style={S.cardMeta}>
                    <span style={S.tag}>{TYPE_LABEL[s.type]}</span>
                    <span style={S.statusBadge(s.status)}>{s.status}</span>
                    <span style={S.modeBadge(s.providerMode)}>{s.providerMode}</span>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noreferrer" style={S.urlLink}>
                        {hostname(s.url)}
                      </a>
                    )}
                  </div>
                </div>
                <div style={S.cardActions}>
                  <button
                    style={S.smallButton}
                    type="button"
                    onClick={() => testSource(s.id)}
                    disabled={busyId === s.id || s.status !== "indexed"}
                  >
                    Test
                  </button>
                  {s.type === "link" && (
                    <button
                      style={S.smallButton}
                      type="button"
                      onClick={() => resync(s.id)}
                      disabled={busyId === s.id}
                    >
                      Re-sync
                    </button>
                  )}
                  <button
                    style={S.dangerButton}
                    type="button"
                    onClick={() => deleteSource(s.id)}
                    disabled={busyId === s.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div style={S.cardStats}>
                <span>{s.charsExtracted.toLocaleString()} chars</span>
                <span>·</span>
                <span>{s.chunksCreated} chunks</span>
                <span>·</span>
                <span>last indexed {formatRelative(s.lastIndexedAt)}</span>
              </div>
              {s.error && <div style={S.errorChip}>{s.error}</div>}
              {result && (
                <div style={S.testResult}>
                  {result.ok ? (
                    <>
                      <strong style={{ color: "#7ee787" }}>✓ Retrieval works.</strong>{" "}
                      {result.hits.length} hit{result.hits.length === 1 ? "" : "s"} from this
                      source (top score{" "}
                      {result.hits[0]?.score.toFixed(2) ?? "n/a"}).
                    </>
                  ) : (
                    <span style={{ color: "#ffd479" }}>
                      ✗ This source returned no hits for "{s.title}". Try Re-sync or check
                      content.
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

const S = {
  question: { fontSize: 18, color: "#e6edf3", marginBottom: 4 } as const,
  helper: { color: "#8b949e", fontSize: 13, marginBottom: 12 } as const,
  h4: { fontSize: 13, color: "#7ee787", margin: "0 0 8px" } as const,
  muted: { color: "#8b949e", fontSize: 12 } as const,
  actionsRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 } as const,
  startHere: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "10px 12px",
    marginBottom: 10,
  } as const,
  startLabel: {
    fontSize: 12,
    color: "#79c0ff",
    fontWeight: 600,
    marginRight: 4,
  } as const,
  statsLine: {
    fontSize: 12,
    color: "#8b949e",
    marginTop: 4,
    marginBottom: 16,
  } as const,
  uploadProgress: {
    background: "#0d2818",
    color: "#7ee787",
    border: "1px solid #1f6feb",
    padding: 10,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 10,
  } as const,
  uploadSummary: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  } as const,
  uploadHead: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: 12,
    color: "#8b949e",
    padding: "6px 0",
  } as const,
  outcomeList: {
    listStyle: "none",
    padding: 0,
    margin: "4px 0 0",
    maxHeight: 240,
    overflow: "auto",
  } as const,
  outcomeRow: {
    fontSize: 11,
    padding: "3px 0",
    borderBottom: "1px solid #21262d",
  } as const,
  codeChip: {
    background: "#21262d",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 10,
  } as const,
  outcomeStatus: (status: "indexed" | "skipped" | "failed") =>
    ({
      background:
        status === "indexed" ? "#1a7f37" : status === "skipped" ? "#6e7681" : "#da3633",
      color: "white",
      padding: "1px 5px",
      borderRadius: 3,
      fontSize: 10,
    }) as const,
  primaryButton: {
    background: "#238636",
    color: "white",
    border: "none",
    padding: "8px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  } as const,
  secondaryButton: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "8px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 13,
    opacity: 0.6,
  } as const,
  smallButton: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "5px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
  } as const,
  dangerButton: {
    background: "#21262d",
    color: "#ff7b72",
    border: "1px solid #4f1f1f",
    padding: "5px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
  } as const,
  linkForm: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  } as const,
  formRow: { display: "flex", gap: 8, flexWrap: "wrap" } as const,
  input: {
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    padding: "8px 10px",
    borderRadius: 4,
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    minWidth: 140,
  } as const,
  error: {
    color: "#ffb4b4",
    background: "#3a1414",
    padding: 8,
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 10,
  } as const,
  errorChip: {
    color: "#ffb4b4",
    background: "#3a1414",
    padding: "4px 8px",
    borderRadius: 3,
    fontSize: 11,
    marginTop: 6,
  } as const,
  sourceList: { display: "flex", flexDirection: "column", gap: 10 } as const,
  sourceCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  cardHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  } as const,
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#e6edf3" } as const,
  cardMeta: {
    display: "flex",
    gap: 6,
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
  } as const,
  cardActions: { display: "flex", gap: 6, flexShrink: 0 } as const,
  cardStats: { color: "#8b949e", fontSize: 11, display: "flex", gap: 8 } as const,
  testResult: {
    marginTop: 8,
    fontSize: 12,
    color: "#c9d1d9",
    padding: 8,
    background: "#161b22",
    borderRadius: 4,
  } as const,
  tag: {
    background: "#21262d",
    color: "#c9d1d9",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 10,
  } as const,
  statusBadge: (status: KnowledgeSource["status"]) =>
    ({
      background:
        status === "indexed"
          ? "#1a7f37"
          : status === "indexing" || status === "queued"
          ? "#1f6feb"
          : "#da3633",
      color: "white",
      padding: "1px 6px",
      borderRadius: 3,
      fontSize: 10,
    }) as const,
  modeBadge: (mode: "real" | "stub" | "fallback") =>
    ({
      background: mode === "real" ? "#1f6feb" : mode === "fallback" ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "1px 6px",
      borderRadius: 3,
      fontSize: 10,
    }) as const,
  urlLink: { color: "#79c0ff", fontSize: 11, textDecoration: "none" } as const,
};
