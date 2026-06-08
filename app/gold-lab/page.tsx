/**
 * /gold-lab — Gold Memory Lab.
 *
 * Ingests 100 years of gold history into a structured memory graph for
 * explainable macro analysis. Historical macro-analysis and explainable-memory
 * demo — NOT investment advice.
 */
"use client";

import { useEffect, useState } from "react";
import { Coins, ShieldAlert, Boxes } from "lucide-react";
import { GlassCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/primitives";
import { AskGold } from "@/components/gold/AskGold";
import { GoldGraph } from "@/components/gold/GoldGraph";
import { RegimeTimeline } from "@/components/gold/RegimeTimeline";
import { ComparePreset } from "@/components/gold/ComparePreset";
import { EvalPreset } from "@/components/gold/EvalPreset";
import type { GoldGraphResponse } from "@/components/gold/types";

const STACK = ["100y annual prices", "events", "regimes", "hypotheses", "memory graph", "Golden Eval"];

export default function GoldLabPage() {
  const [graph, setGraph] = useState<GoldGraphResponse | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);

  useEffect(() => {
    // Seed gold memory (idempotent) and load the typed graph.
    void fetch("/api/gold/seed", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { blocksCreated?: number; backend?: string } | null) => {
        if (d) setSeeded(`${d.blocksCreated ?? 0} memory blocks · ${d.backend ?? "store"}`);
      })
      .catch(() => {});
    void fetch("/api/gold/graph")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GoldGraphResponse | null) => setGraph(d))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl glass p-7 sm:p-10">
        <div className="glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <Badge tone="warn" className="mb-3">
          <Coins className="h-3 w-3" /> Gold Memory Lab · case study
        </Badge>
        <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          100 years of gold as a <span className="text-gradient">structured memory graph</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
          Annual prices (1926–2026), monetary regimes, macro events, and analytical hypotheses are
          ingested into typed memory and a macro graph, then queried with explainable hybrid
          retrieval. Memory lets the system reason across decades — comparing rallies, surfacing
          counterexamples, and grounding answers in sources.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {STACK.map((s) => (
            <span key={s} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55">
              {s}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <Boxes className="h-3.5 w-3.5" />
          {graph ? (
            <span>{graph.totals.nodes} graph nodes · {graph.totals.edges} edges</span>
          ) : (
            <span>loading graph…</span>
          )}
          {seeded && <span>· memory: {seeded}</span>}
        </div>
      </section>

      {/* Disclaimer */}
      <GlassCard className="border-amber-400/20 bg-amber-400/5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-[12px] leading-relaxed text-white/65">
            <span className="font-semibold text-amber-200">Not investment advice.</span> This is a
            historical macro-analysis and explainable-memory demo. Prices and events are approximate,
            illustrative, and partly synthetic for 2024–2026. Nothing here is a recommendation to buy
            or sell any asset.
          </p>
        </div>
      </GlassCard>

      {/* Ask */}
      <AskGold />

      {/* Graph + timeline */}
      {graph && (
        <>
          <GoldGraph nodes={graph.nodes} edges={graph.edges} />
          <RegimeTimeline regimes={graph.regimes} annual={graph.annual} />
        </>
      )}

      {/* Compare + Eval */}
      <ComparePreset />
      <EvalPreset />
    </div>
  );
}
