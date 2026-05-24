"use client";

import { useEffect, useState } from "react";
import KnowledgeSources from "./KnowledgeSources.js";

// ---------- Types ----------

type ProviderRole = "rag" | "memory" | "llm" | "observability" | "engine" | "evaluation";
type ProviderMode = "real" | "stub" | "fallback";

interface ConfigItem {
  key: string;
  label: string;
  role: "rag" | "memory" | "llm" | "observability" | "engine";
  secret: boolean;
  description: string;
  placeholder?: string;
  present: boolean;
  preview: string | null;
  source: "file" | "env" | "missing";
}

interface ProviderStatusItem {
  role: ProviderRole;
  name: string;
  framework: string;
  mode: ProviderMode;
  reason: string;
  isConfigured: boolean;
  version?: string;
}

interface EnvironmentSummary {
  mode: "local_demo" | "production" | "mixed";
  label: string;
  description: string;
  realRoles: string[];
  stubRoles: string[];
  fallbackRoles: string[];
}

interface ConfigResponse {
  items: ConfigItem[];
  providerStatus: ProviderStatusItem[];
  environment: EnvironmentSummary;
  envFile: string;
}

interface ConnectResult {
  ok: boolean;
  role: string;
  probe: { ok: boolean; detail: string };
}

// ---------- Maps ----------

// Essential (Quick Connect) fields per role.
const ESSENTIAL_KEYS: Partial<Record<ProviderRole, string[]>> = {
  llm: ["OPENAI_API_KEY"],
  rag: ["OPENAI_API_KEY"],
  memory: ["MEM0_API_KEY"],
  observability: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
};

// Advanced (collapsed) fields per role.
const ADVANCED_KEYS: Partial<Record<ProviderRole, string[]>> = {
  llm: ["OPENAI_LLM_MODEL"],
  rag: ["OPENAI_EMBEDDING_MODEL"],
  memory: ["MEM0_ORG_ID", "MEM0_PROJECT_ID"],
  observability: ["LANGFUSE_HOST", "LANGFUSE_BASE_URL"],
};

// All keys to ship in a Connect request for a role.
const ROLE_TO_KEYS: Record<string, string[]> = {
  rag: ["OPENAI_API_KEY", "OPENAI_EMBEDDING_MODEL"],
  memory: ["MEM0_API_KEY", "MEM0_ORG_ID", "MEM0_PROJECT_ID"],
  llm: ["OPENAI_API_KEY", "OPENAI_LLM_MODEL"],
  observability: [
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "LANGFUSE_HOST",
    "LANGFUSE_BASE_URL",
  ],
};

const ROLE_LABEL: Record<ProviderRole, string> = {
  engine: "Engine",
  rag: "Retrieval (RAG)",
  memory: "Persistent Memory",
  llm: "LLM",
  observability: "Tracing & Observability",
  evaluation: "Evaluation",
};

// Status hierarchy (most → least healthy):
//   Real → Local fallback (demo working) → Built-in → Local → Missing key → Error
function uiStatus(p: ProviderStatusItem): {
  label: string;
  color: string;
  tier: "real" | "local_fallback" | "built_in" | "local" | "missing_key" | "error";
} {
  if (p.mode === "real") {
    return { label: "Real", color: "#7ee787", tier: "real" };
  }

  // Evaluation is always intentionally a stub (Ragas-shaped heuristic).
  if (p.role === "evaluation") {
    return { label: "Built-in", color: "#79c0ff", tier: "built_in" };
  }

  // Local trace provider — distinct from "demo mode" since it actually works.
  if (p.role === "observability") {
    return { label: "Local", color: "#79c0ff", tier: "local" };
  }

  // Fallback in this project means: real was requested but env missing.
  if (p.mode === "fallback") {
    // Distinguish "stub running because requested" from "stub running because broken".
    if (/missing/i.test(p.reason)) {
      return { label: "Missing key", color: "#ffd479", tier: "missing_key" };
    }
    if (/error/i.test(p.reason)) {
      return { label: "Error", color: "#ff7b72", tier: "error" };
    }
    return { label: "Local fallback", color: "#ffd479", tier: "local_fallback" };
  }

  // mode === "stub" (FRAMEWORK_MODE=local). Working as designed.
  return { label: "Demo mode", color: "#79c0ff", tier: "local" };
}

// ---------- Component ----------

export default function SettingsPanel() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<Record<string, ConnectResult>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdvanced, setShowAdvanced] = useState<Set<string>>(new Set());

  async function loadConfig() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rag-memory/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ConfigResponse;
      setConfig(data);
      // Pre-fill non-secret values so user sees what is stored.
      const initialDraft: Record<string, string> = { ...draft };
      for (const item of data.items) {
        if (!item.secret && item.preview && !(item.key in initialDraft)) {
          initialDraft[item.key] = item.preview;
        }
      }
      setDraft(initialDraft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyMode(mode: "local" | "real") {
    setError(null);
    try {
      const res = await fetch("/api/rag-memory/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: { FRAMEWORK_MODE: mode } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSavedAt(Date.now());
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function connect(role: string) {
    setConnecting(role);
    setError(null);
    try {
      const allowed = ROLE_TO_KEYS[role] ?? [];
      const values: Record<string, string> = {};
      for (const key of allowed) {
        const v = draft[key];
        if (v && v.trim().length > 0) values[key] = v.trim();
      }
      const res = await fetch("/api/rag-memory/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, values }),
      });
      const data = (await res.json()) as ConnectResult & {
        error?: string;
        providerStatus?: ProviderStatusItem[];
      };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setConnectResult({ ...connectResult, [role]: data });
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  async function clearAndSave(keys: string[]) {
    setError(null);
    try {
      const values: Record<string, string> = {};
      for (const k of keys) values[k] = "";
      await fetch("/api/rag-memory/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      for (const k of keys) draft[k] = "";
      setDraft({ ...draft });
      await loadConfig();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function toggleExpand(role: string) {
    const next = new Set(expanded);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setExpanded(next);
  }

  function toggleAdvanced(role: string) {
    const next = new Set(showAdvanced);
    if (next.has(role)) next.delete(role);
    else next.add(role);
    setShowAdvanced(next);
  }

  if (!config) {
    return (
      <div style={S.muted}>
        {loading ? "Loading…" : error ? `Error: ${error}` : "—"}
      </div>
    );
  }

  // Build "make this real" checklist from current state.
  const checklist = buildChecklist(config);

  return (
    <div>
      {/* Environment */}
      <EnvironmentCard env={config.environment} onApply={applyMode} />

      {/* Make this real — checklist */}
      <ChecklistCard checklist={checklist} />

      {/* Provider Status grid */}
      <h3 style={S.h3}>Providers</h3>
      <div style={S.statusGrid}>
        {config.providerStatus.map((p) => (
          <ProviderCard
            key={p.role}
            status={p}
            connectResult={connectResult[p.role]}
            expanded={expanded.has(p.role)}
            onToggle={() => toggleExpand(p.role)}
          />
        ))}
      </div>

      {/* Knowledge Sources */}
      <h3 style={S.h3}>Knowledge sources</h3>
      <KnowledgeSources />

      {/* Quick Connect */}
      <h3 style={S.h3}>Quick connect</h3>
      <p style={S.muted}>
        Essential keys only. Other fields live inside Advanced.
      </p>

      {(["llm", "memory", "observability"] as ProviderRole[]).map((role) => (
        <QuickConnectGroup
          key={role}
          role={role}
          items={config.items}
          draft={draft}
          setDraft={setDraft}
          onConnect={() => connect(role)}
          connecting={connecting === role}
          result={connectResult[role]}
          showAdvanced={showAdvanced.has(role)}
          toggleAdvanced={() => toggleAdvanced(role)}
          onClear={() => clearAndSave(ROLE_TO_KEYS[role] ?? [])}
        />
      ))}

      {error && <div style={S.error}>Error: {error}</div>}
      {savedAt && (
        <div style={S.success}>
          Saved at {new Date(savedAt).toLocaleTimeString()}. Container reloaded.
        </div>
      )}

      <div style={S.warningBox}>
        <strong>Local dev only.</strong> Keys are written to{" "}
        <code style={S.code}>.env.local</code> on this machine. The file is git-ignored.
        Do not expose this dev server to the public network.
      </div>
    </div>
  );
}

// ---------- Environment card ----------

function EnvironmentCard({
  env,
  onApply,
}: {
  env: EnvironmentSummary;
  onApply: (mode: "local" | "real") => void;
}) {
  return (
    <section style={S.envCard}>
      <div style={S.envHead}>
        <div>
          <div style={S.muted}>Current mode</div>
          <div style={S.envLabel}>{env.label}</div>
        </div>
        <span style={S.envBadge(env.mode)}>{env.mode.replace("_", " ")}</span>
      </div>
      <p style={S.envDescription}>{env.description}</p>
      <p style={S.muted}>
        Local Demo runs without API keys using fallback providers. Production uses real
        providers when keys are configured. Mixed means some are real, some are not.
      </p>
      <div style={S.actionsRow}>
        <button style={S.primaryButton} type="button" onClick={() => onApply("local")}>
          Use Local Demo
        </button>
        <button style={S.secondaryButton} type="button" onClick={() => onApply("real")}>
          Configure Production
        </button>
      </div>
    </section>
  );
}

// ---------- Checklist ----------

interface ChecklistItem {
  label: string;
  done: boolean;
  optional?: boolean;
}

function buildChecklist(config: ConfigResponse): ChecklistItem[] {
  const has = (key: string) => Boolean(config.items.find((i) => i.key === key)?.present);
  const providerReal = (role: string) =>
    config.providerStatus.find((p) => p.role === role)?.mode === "real";

  return [
    {
      label: "Connect OpenAI (LLM + embeddings)",
      done: has("OPENAI_API_KEY") && (providerReal("llm") || providerReal("rag")),
    },
    {
      label: "Add a knowledge source",
      // Knowledge source count is not in this payload; the KnowledgeSources
      // component handles its own state. We approximate via "rag connected".
      done: providerReal("rag"),
    },
    { label: "Run pipeline at least once (Run tab)", done: false },
    { label: "Connect Mem0 (persistent memory)", done: has("MEM0_API_KEY"), optional: true },
    {
      label: "Connect Langfuse (tracing)",
      done: has("LANGFUSE_PUBLIC_KEY") && has("LANGFUSE_SECRET_KEY"),
      optional: true,
    },
  ];
}

function ChecklistCard({ checklist }: { checklist: ChecklistItem[] }) {
  const required = checklist.filter((c) => !c.optional);
  const optional = checklist.filter((c) => c.optional);
  const doneCount = required.filter((c) => c.done).length;

  return (
    <section style={S.checklistCard}>
      <div style={S.checklistHead}>
        <strong>To make this real</strong>
        <span style={S.muted}>
          {doneCount} / {required.length} required
        </span>
      </div>
      <ol style={S.checklistList}>
        {required.map((c, i) => (
          <li key={i} style={S.checklistItem(c.done)}>
            <span style={S.checklistMark}>{c.done ? "✓" : i + 1}</span>
            {c.label}
          </li>
        ))}
      </ol>
      {optional.length > 0 && (
        <>
          <div style={S.muted}>Optional</div>
          <ol style={S.checklistList} start={required.length + 1}>
            {optional.map((c, i) => (
              <li key={`opt-${i}`} style={S.checklistItem(c.done)}>
                <span style={S.checklistMark}>{c.done ? "✓" : "+"}</span>
                {c.label}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

// ---------- Provider card ----------

function ProviderCard({
  status,
  expanded,
  onToggle,
}: {
  status: ProviderStatusItem;
  connectResult: ConnectResult | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  const ui = uiStatus(status);
  return (
    <div style={S.statusCard}>
      <div style={S.statusHead}>
        <div>
          <div style={S.muted}>{ROLE_LABEL[status.role]}</div>
          <div style={S.statusName}>{status.name}</div>
        </div>
        <span style={{ ...S.statusBadge, color: ui.color, borderColor: ui.color }}>
          {ui.label}
        </span>
      </div>
      <div style={S.muted}>
        {status.framework}
        {status.version ? ` · ${status.version}` : ""}
      </div>
      <p style={S.statusReason}>{status.reason}</p>
      <div style={S.cardActions}>
        <button style={S.smallButton} type="button" onClick={onToggle}>
          {expanded ? "Hide details" : "Details"}
        </button>
      </div>
      {expanded && (
        <pre style={S.detailsPre}>
          {JSON.stringify(
            {
              role: status.role,
              mode: status.mode,
              framework: status.framework,
              version: status.version,
              isConfigured: status.isConfigured,
            },
            null,
            2
          )}
        </pre>
      )}
    </div>
  );
}

// ---------- Quick Connect group ----------

function QuickConnectGroup({
  role,
  items,
  draft,
  setDraft,
  onConnect,
  connecting,
  result,
  showAdvanced,
  toggleAdvanced,
  onClear,
}: {
  role: ProviderRole;
  items: ConfigItem[];
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
  onConnect: () => void;
  connecting: boolean;
  result: ConnectResult | undefined;
  showAdvanced: boolean;
  toggleAdvanced: () => void;
  onClear: () => void;
}) {
  const essential = (ESSENTIAL_KEYS[role] ?? [])
    .map((k) => items.find((i) => i.key === k))
    .filter((x): x is ConfigItem => Boolean(x));
  const advanced = (ADVANCED_KEYS[role] ?? [])
    .map((k) => items.find((i) => i.key === k))
    .filter((x): x is ConfigItem => Boolean(x));

  return (
    <div style={S.quickGroup}>
      <h4 style={S.h4}>{ROLE_LABEL[role]}</h4>
      {essential.map((item) => (
        <FieldRow
          key={item.key}
          item={item}
          draft={draft}
          setDraft={setDraft}
        />
      ))}

      <div style={S.quickRow}>
        <button
          style={S.connectButton}
          type="button"
          onClick={onConnect}
          disabled={connecting}
        >
          {connecting ? "Testing…" : "Test connection"}
        </button>
        <button style={S.smallButton} type="button" onClick={onClear}>
          Clear
        </button>
        {result && (
          <span style={result.probe.ok ? S.connectOk : S.connectFail}>
            {result.probe.ok ? "✓ connected" : "✗ failed"} — {result.probe.detail}
          </span>
        )}
      </div>

      {advanced.length > 0 && (
        <details
          open={showAdvanced}
          onToggle={(e) => {
            if ((e.target as HTMLDetailsElement).open !== showAdvanced) toggleAdvanced();
          }}
          style={S.advancedDetails}
        >
          <summary style={S.advancedSummary}>Advanced</summary>
          {advanced.map((item) => (
            <FieldRow key={item.key} item={item} draft={draft} setDraft={setDraft} />
          ))}
        </details>
      )}
    </div>
  );
}

function FieldRow({
  item,
  draft,
  setDraft,
}: {
  item: ConfigItem;
  draft: Record<string, string>;
  setDraft: (next: Record<string, string>) => void;
}) {
  return (
    <div style={S.field}>
      <label style={S.labelText}>
        {item.label}
        {item.secret && <span style={S.secretChip}>secret</span>}
        {item.present && <span style={S.presentChip}>stored</span>}
      </label>
      <input
        style={S.input}
        type={item.secret ? "password" : "text"}
        placeholder={
          item.secret && item.present
            ? `current: ${item.preview ?? ""}`
            : item.placeholder ?? ""
        }
        value={draft[item.key] ?? ""}
        onChange={(e) => setDraft({ ...draft, [item.key]: e.target.value })}
        autoComplete="off"
      />
      <div style={S.fieldDescription}>{item.description}</div>
    </div>
  );
}

// ---------- Styles ----------

const S = {
  envCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: 16,
    marginBottom: 18,
  } as const,
  envHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  } as const,
  envLabel: { fontSize: 18, color: "#e6edf3", fontWeight: 600 } as const,
  envDescription: { color: "#c9d1d9", fontSize: 13, marginTop: 6, marginBottom: 6 } as const,
  envBadge: (mode: "local_demo" | "production" | "mixed") =>
    ({
      background:
        mode === "production" ? "#1f6feb" : mode === "mixed" ? "#bf8700" : "#6e7681",
      color: "white",
      padding: "3px 10px",
      borderRadius: 3,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: 600,
    }) as const,
  h3: { fontSize: 14, color: "#79c0ff", marginTop: 18, marginBottom: 10 } as const,
  h4: { fontSize: 13, color: "#7ee787", marginTop: 4, marginBottom: 8 } as const,
  muted: { color: "#8b949e", fontSize: 12 } as const,
  statusGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 10,
    marginBottom: 18,
  } as const,
  statusCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
  } as const,
  statusHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  } as const,
  statusName: { fontSize: 14, fontWeight: 600 } as const,
  statusReason: { fontSize: 11, color: "#8b949e", marginTop: 6, lineHeight: 1.4 } as const,
  statusBadge: {
    background: "transparent",
    border: "1px solid #8b949e",
    padding: "2px 8px",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
  } as const,
  cardActions: { display: "flex", gap: 6, marginTop: 8 } as const,
  detailsPre: {
    background: "#161b22",
    padding: 8,
    marginTop: 6,
    borderRadius: 3,
    fontSize: 10,
    color: "#8b949e",
    overflow: "auto",
  } as const,
  quickGroup: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  } as const,
  field: { marginBottom: 8 } as const,
  labelText: {
    display: "block",
    fontSize: 12,
    color: "#e6edf3",
    marginBottom: 4,
  } as const,
  fieldDescription: { fontSize: 10, color: "#8b949e", marginTop: 4 } as const,
  input: {
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    padding: "8px 10px",
    borderRadius: 4,
    fontFamily: "ui-monospace, monospace",
    fontSize: 12,
    width: "100%",
    boxSizing: "border-box",
  } as const,
  secretChip: {
    background: "#3a2a14",
    color: "#ffd479",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 9,
    marginLeft: 6,
  } as const,
  presentChip: {
    background: "#1a7f37",
    color: "white",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 9,
    marginLeft: 6,
  } as const,
  quickRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
  } as const,
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
  } as const,
  connectButton: {
    background: "#1f6feb",
    color: "white",
    border: "none",
    padding: "7px 12px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  } as const,
  smallButton: {
    background: "#21262d",
    color: "#c9d1d9",
    border: "1px solid #30363d",
    padding: "6px 10px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
  } as const,
  connectOk: { color: "#7ee787", fontSize: 11 } as const,
  connectFail: { color: "#ffb4b4", fontSize: 11 } as const,
  advancedDetails: {
    marginTop: 10,
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 4,
    padding: "0 12px",
  } as const,
  advancedSummary: {
    cursor: "pointer",
    padding: "8px 0",
    fontSize: 12,
    color: "#8b949e",
  } as const,
  actionsRow: { display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" } as const,
  error: {
    color: "#ffb4b4",
    background: "#3a1414",
    padding: 10,
    borderRadius: 4,
    marginBottom: 12,
    marginTop: 12,
  } as const,
  success: {
    color: "#7ee787",
    background: "#0d2818",
    padding: 10,
    borderRadius: 4,
    marginTop: 12,
    fontSize: 13,
  } as const,
  checklistCard: {
    background: "#0d1117",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: 14,
    marginBottom: 18,
  } as const,
  checklistHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 8,
    fontSize: 13,
    color: "#e6edf3",
  } as const,
  checklistList: {
    listStyle: "none",
    padding: 0,
    margin: "4px 0 10px",
  } as const,
  checklistItem: (done: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "4px 0",
      fontSize: 13,
      color: done ? "#7ee787" : "#c9d1d9",
      textDecoration: done ? "line-through" : "none",
      opacity: done ? 0.7 : 1,
    }) as const,
  checklistMark: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#161b22",
    border: "1px solid #30363d",
    fontSize: 11,
    color: "#79c0ff",
    flexShrink: 0,
  } as const,
  warningBox: {
    background: "#3a2a14",
    border: "1px solid #bf8700",
    color: "#ffd479",
    padding: 12,
    borderRadius: 6,
    fontSize: 12,
    marginTop: 18,
  } as const,
  code: {
    background: "#21262d",
    padding: "1px 6px",
    borderRadius: 3,
    fontSize: 11,
  } as const,
};
