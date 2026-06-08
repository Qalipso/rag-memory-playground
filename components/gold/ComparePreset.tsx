"use client";

import { useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { GlassCard, CardTitle, CardDesc } from "@/components/ui/card";
import { Badge, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { GOLD_USER_ID_CLIENT, pct } from "./types";

interface Row {
  label: string;
  metrics: {
    routeMode: string;
    documents: number;
    memories: number;
    faithfulness: number;
    contextRelevance: number;
    estimatedCostUsd: number;
    latencyMs: number;
    failureModeCount: number;
  };
}

interface CompareResp {
  rows: Row[];
  winners: { faithfulness: string | null; cost: string | null; latency: string | null };
}

const PRESET_CONFIGS = [
  { label: "Naive RAG", mode: "rag", topK: 6, maxContextTokens: 4000 },
  { label: "Memory only", mode: "memory", topK: 6, maxContextTokens: 4000 },
  { label: "Hybrid RAG+Memory", mode: "hybrid", topK: 6, maxContextTokens: 6000 },
  { label: "Long context", mode: "long_context", topK: 12, maxContextTokens: 12000 },
];

export function ComparePreset() {
  const [question, setQuestion] = useState(
    "Compare the 1970s gold rally with the 2020–2026 rally"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<CompareResp | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      // Ensure gold memory exists for the memory/hybrid configs.
      await fetch("/api/gold/seed", { method: "POST" });
      const res = await fetch("/api/rag-memory/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: GOLD_USER_ID_CLIENT,
          message: question,
          configs: PRESET_CONFIGS,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setResp((await res.json()) as CompareResp);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <GitCompareArrows className="h-4 w-4 text-sky-300" />
        <CardTitle>Pipeline comparison preset</CardTitle>
      </div>
      <CardDesc className="mt-1">
        Same gold question across four strategies: naive RAG · memory only · hybrid · long context.
        Diff quality, cost, and latency.
      </CardDesc>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Button variant="primary" onClick={() => void run()} disabled={loading} className="shrink-0">
          {loading ? "Running 4 configs…" : "Run comparison"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Badge tone="bad">{error}</Badge>
        </div>
      )}

      {resp && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-white/45">
                <th className="px-2 py-1.5 font-medium">Strategy</th>
                <th className="px-2 py-1.5 font-medium">Route</th>
                <th className="px-2 py-1.5 font-medium">Docs</th>
                <th className="px-2 py-1.5 font-medium">Mem</th>
                <th className="px-2 py-1.5 font-medium">Faithful</th>
                <th className="px-2 py-1.5 font-medium">Ctx rel</th>
                <th className="px-2 py-1.5 font-medium">Cost</th>
                <th className="px-2 py-1.5 font-medium">Latency</th>
                <th className="px-2 py-1.5 font-medium">Fails</th>
              </tr>
            </thead>
            <tbody>
              {resp.rows.map((r) => {
                const isFaith = resp.winners.faithfulness === r.label;
                const isCost = resp.winners.cost === r.label;
                const isLat = resp.winners.latency === r.label;
                return (
                  <tr key={r.label} className="border-t border-white/5 text-white/75">
                    <td className="px-2 py-1.5 font-medium text-white/90">{r.label}</td>
                    <td className="px-2 py-1.5 text-white/55">{r.metrics.routeMode}</td>
                    <td className="px-2 py-1.5">{r.metrics.documents}</td>
                    <td className="px-2 py-1.5">{r.metrics.memories}</td>
                    <td className={"px-2 py-1.5 " + (isFaith ? "text-emerald-300 font-semibold" : "")}>
                      {pct(r.metrics.faithfulness)}{isFaith ? " ★" : ""}
                    </td>
                    <td className="px-2 py-1.5">{pct(r.metrics.contextRelevance)}</td>
                    <td className={"px-2 py-1.5 " + (isCost ? "text-emerald-300 font-semibold" : "")}>
                      {r.metrics.estimatedCostUsd > 0 ? `$${r.metrics.estimatedCostUsd.toFixed(4)}` : "free"}{isCost ? " ★" : ""}
                    </td>
                    <td className={"px-2 py-1.5 " + (isLat ? "text-emerald-300 font-semibold" : "")}>
                      {r.metrics.latencyMs}ms{isLat ? " ★" : ""}
                    </td>
                    <td className="px-2 py-1.5">{r.metrics.failureModeCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-white/35">★ marks the winner per axis. Hybrid usually wins faithfulness by combining documents with memory.</p>
        </div>
      )}
    </GlassCard>
  );
}
