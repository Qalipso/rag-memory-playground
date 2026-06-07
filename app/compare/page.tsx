/**
 * /compare — Side-by-side pipeline comparison.
 * Same query × 2–4 configs. Diff quality × cost × latency, winners per axis.
 */
"use client";

import { useState } from "react";
import { GitCompareArrows, Plus, X, Trophy, Zap, DollarSign, Play } from "lucide-react";
import { GlassCard, CardTitle } from "@/components/ui/card";
import { Badge, Textarea, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

type Mode = "auto" | "rag" | "memory" | "long_context" | "hybrid";
interface ConfigDraft { label: string; mode: Mode; topK: number; maxContextTokens: number }
interface Metrics {
  routeMode: string; documents: number; memories: number; promptTokens: number;
  answerChars: number; latencyMs: number; faithfulness: number; contextRelevance: number;
  answerRelevance: number; estimatedCostUsd: number; llmMode: string; failureModeCount: number;
}
interface Row {
  label: string; config: ConfigDraft;
  run: { answer: string; failureModes: Array<{ type: string; severity: string }> };
  metrics: Metrics;
}
interface CompareResponse {
  rows: Row[];
  winners: { faithfulness: string | null; cost: string | null; latency: string | null };
}

const MODES: Mode[] = ["auto", "rag", "memory", "long_context", "hybrid"];
const DEFAULTS: ConfigDraft[] = [
  { label: "Tight (k=3)", mode: "auto", topK: 3, maxContextTokens: 2000 },
  { label: "Wide (k=10)", mode: "auto", topK: 10, maxContextTokens: 6000 },
];

export default function ComparePage() {
  const userId = "demo-user";
  const [message, setMessage] = useState("Почему я снова застрял с Shadow и этой теорией?");
  const [configs, setConfigs] = useState<ConfigDraft[]>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);

  const patch = (i: number, p: Partial<ConfigDraft>) =>
    setConfigs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  const add = () => configs.length < 4 &&
    setConfigs((p) => [...p, { label: `Config ${p.length + 1}`, mode: "auto", topK: 5, maxContextTokens: 4000 }]);
  const remove = (i: number) => configs.length > 2 && setConfigs((p) => p.filter((_, idx) => idx !== i));

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/rag-memory/compare", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, message, configs }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as CompareResponse);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
          <GitCompareArrows className="h-5 w-5 text-[var(--color-brand)]" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Side-by-side comparison</h1>
          <p className="text-sm text-white/50">Same query through 2–4 configs · diff quality × cost × latency</p>
        </div>
      </div>

      <GlassCard>
        <label className="mb-2 block text-xs text-white/50">Query</label>
        <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {configs.map((c, i) => (
          <GlassCard key={i} className="space-y-2.5">
            <div className="flex items-center gap-2">
              <input
                value={c.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 py-1 text-sm font-semibold text-[var(--color-brand)] outline-none"
              />
              {configs.length > 2 && (
                <button onClick={() => remove(i)} className="rounded-lg border border-white/10 p-1 text-rose-300 hover:bg-white/5">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] text-white/40">Route mode</div>
              <Select value={c.mode} onChange={(e) => patch(i, { mode: e.target.value as Mode })}>
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div>
              <div className="mb-1 text-[11px] text-white/40">topK: {c.topK}</div>
              <input type="range" min={1} max={20} value={c.topK}
                onChange={(e) => patch(i, { topK: Number(e.target.value) })} className="w-full accent-[var(--color-brand)]" />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-white/40">maxContextTokens</div>
              <input type="number" min={256} max={16000} step={256} value={c.maxContextTokens}
                onChange={(e) => patch(i, { maxContextTokens: Number(e.target.value) })}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-2 h-9 text-sm text-white/85 outline-none" />
            </div>
          </GlassCard>
        ))}
        {configs.length < 4 && (
          <button onClick={add} className="glass glass-hover grid min-h-[160px] place-items-center rounded-2xl text-sm text-white/45">
            <span className="flex items-center gap-1"><Plus className="h-4 w-4" /> Add config</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={run} disabled={loading}>
          <Play className="h-4 w-4" /> {loading ? "Running…" : "Run comparison"}
        </Button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </div>

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: CompareResponse }) {
  const { rows, winners } = result;
  const fmtCost = (n: number) => (n === 0 ? "free" : `$${n.toFixed(5)}`);
  const f2 = (n: number) => n.toFixed(2);

  const metricRows: Array<{ label: string; fmt: (m: Metrics) => string; win?: keyof CompareResponse["winners"] }> = [
    { label: "Route", fmt: (m) => m.routeMode },
    { label: "Docs", fmt: (m) => String(m.documents) },
    { label: "Memories", fmt: (m) => String(m.memories) },
    { label: "Prompt tokens", fmt: (m) => String(m.promptTokens) },
    { label: "Faithfulness", fmt: (m) => f2(m.faithfulness), win: "faithfulness" },
    { label: "Context rel.", fmt: (m) => f2(m.contextRelevance) },
    { label: "Answer rel.", fmt: (m) => f2(m.answerRelevance) },
    { label: "Est. cost", fmt: (m) => fmtCost(m.estimatedCostUsd), win: "cost" },
    { label: "Latency", fmt: (m) => `${m.latencyMs}ms`, win: "latency" },
    { label: "Failures", fmt: (m) => String(m.failureModeCount) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone="good"><Trophy className="h-3 w-3" /> Faithfulness: {winners.faithfulness ?? "—"}</Badge>
        <Badge tone="info"><DollarSign className="h-3 w-3" /> Cost: {winners.cost ?? "—"}</Badge>
        <Badge tone="brand"><Zap className="h-3 w-3" /> Fastest: {winners.latency ?? "—"}</Badge>
      </div>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-white/50">Metric</th>
              {rows.map((r) => (
                <th key={r.label} className="px-4 py-3 text-left align-top">
                  <div className="font-semibold text-white/90">{r.label}</div>
                  <div className="text-[10px] font-normal text-white/40">{r.config.mode} · k={r.config.topK} · {r.metrics.llmMode}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((mr) => (
              <tr key={mr.label} className="border-b border-white/5">
                <td className="px-4 py-2.5 text-white/45">{mr.label}</td>
                {rows.map((r) => {
                  const win = mr.win && winners[mr.win] === r.label;
                  return (
                    <td key={r.label} className={win ? "px-4 py-2.5 font-semibold text-emerald-300" : "px-4 py-2.5 text-white/85"}>
                      {mr.fmt(r.metrics)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <GlassCard key={r.label}>
            <CardTitle className="text-[var(--color-brand)]">{r.label}</CardTitle>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-white/75">{r.run.answer}</pre>
            {r.run.failureModes.length > 0 && (
              <div className="mt-2 space-y-1">
                {r.run.failureModes.map((f, i) => (
                  <div key={i} className="text-[10px] text-white/40">{f.severity}: {f.type}</div>
                ))}
              </div>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
