"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { GlassCard, CardTitle, CardDesc } from "@/components/ui/card";
import { Badge, Stat } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { pct } from "./types";

interface QScore {
  questionId: string;
  question: string;
  sourceRecall: number;
  pointCoverage: number;
  memoryTopicRecall: number;
  overall: number;
  pass: boolean;
}

interface ModeRow {
  mode: string;
  scores: QScore[];
  averages: {
    sourceRecall: number;
    pointCoverage: number;
    memoryTopicRecall: number;
    overall: number;
    passRate: number;
    avgLatencyMs: number;
  };
}

interface EvalResp {
  evalName: string;
  questionCount: number;
  rows: ModeRow[];
  winner: string | null;
}

export function EvalPreset() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<EvalResp | null>(null);
  const [open, setOpen] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gold/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modes: ["rag", "hybrid"] }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setResp((await res.json()) as EvalResp);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const rag = resp?.rows.find((r) => r.mode === "rag");
  const hybrid = resp?.rows.find((r) => r.mode === "hybrid");

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-amber-300" />
        <CardTitle>Golden Eval preset · naive RAG vs hybrid memory</CardTitle>
      </div>
      <CardDesc className="mt-1">
        Runs all 25 gold-history questions through naive RAG and hybrid RAG+memory, scoring source
        recall, ideal-point coverage, and memory recall.
      </CardDesc>

      <div className="mt-3">
        <Button variant="primary" onClick={() => void run()} disabled={loading}>
          {loading ? "Scoring 25 × 2 runs…" : "Run Golden Eval"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Badge tone="bad">{error}</Badge>
        </div>
      )}

      {resp && rag && hybrid && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="brand">{resp.questionCount} questions</Badge>
            {resp.winner && <Badge tone="good">winner: {resp.winner}</Badge>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[rag, hybrid].map((row) => (
              <div key={row.mode} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-white/90">
                    {row.mode === "hybrid" ? "Hybrid RAG+Memory" : "Naive RAG"}
                  </span>
                  <Badge tone={row.mode === resp.winner ? "good" : "neutral"}>
                    overall {pct(row.averages.overall)}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Source recall" value={pct(row.averages.sourceRecall)} />
                  <Stat label="Point cov." value={pct(row.averages.pointCoverage)} />
                  <Stat label="Mem recall" value={pct(row.averages.memoryTopicRecall)} />
                </div>
                <div className="mt-2 text-[11px] text-white/40">
                  pass rate {pct(row.averages.passRate)} · {Math.round(row.averages.avgLatencyMs)}ms avg
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[12px] text-white/55 underline-offset-2 hover:text-white hover:underline"
          >
            {open ? "Hide" : "Show"} per-question scores
          </button>

          {open && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="text-left text-white/45">
                    <th className="px-2 py-1 font-medium">Question</th>
                    <th className="px-2 py-1 font-medium">RAG</th>
                    <th className="px-2 py-1 font-medium">Hybrid</th>
                    <th className="px-2 py-1 font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {hybrid.scores.map((h) => {
                    const r = rag.scores.find((s) => s.questionId === h.questionId);
                    const delta = h.overall - (r?.overall ?? 0);
                    return (
                      <tr key={h.questionId} className="border-t border-white/5 text-white/70">
                        <td className="max-w-[420px] truncate px-2 py-1" title={h.question}>{h.question}</td>
                        <td className="px-2 py-1">{pct(r?.overall ?? 0)}</td>
                        <td className="px-2 py-1">{pct(h.overall)}</td>
                        <td className={"px-2 py-1 " + (delta > 0.01 ? "text-emerald-300" : delta < -0.01 ? "text-rose-300" : "text-white/40")}>
                          {delta >= 0 ? "+" : ""}{Math.round(delta * 100)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
