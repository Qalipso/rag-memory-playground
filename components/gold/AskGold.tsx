"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GlassCard, CardTitle, CardDesc } from "@/components/ui/card";
import { Badge, Select, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { RunTrace } from "./RunTrace";
import type { AskResponse } from "./types";

const SUGGESTED = [
  "Compare the 1970s gold rally with the 2020–2026 rally",
  "When did gold fail as a safe haven?",
  "Is gold a reliable inflation hedge?",
  "Why did gold stay flat in 2022 despite 40-year-high inflation?",
  "How do real interest rates affect gold?",
  "How did the 2022 freezing of Russian reserves change gold's role?",
];

const MODES = ["hybrid", "rag", "memory", "long_context", "auto"];

export function AskGold() {
  const [message, setMessage] = useState(SUGGESTED[0]!);
  const [mode, setMode] = useState("hybrid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AskResponse | null>(null);

  async function ask(q?: string) {
    const text = (q ?? message).trim();
    if (!text) return;
    if (q) setMessage(q);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gold/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, mode }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as AskResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--color-brand)]" />
        <CardTitle>Ask Gold Memory</CardTitle>
      </div>
      <CardDesc className="mt-1">
        Hybrid retrieval over the gold corpus + formed memory. The trace shows retrieved memories,
        source docs, graph path, confidence, failure modes, cost, and latency.
      </CardDesc>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTED.map((q) => (
          <button
            key={q}
            onClick={() => void ask(q)}
            disabled={loading}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/60 transition hover:border-[var(--color-brand)]/40 hover:text-white disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="w-40">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={() => void ask()} disabled={loading}>
          {loading ? "Retrieving…" : "Ask"}
        </Button>
      </div>

      {error && (
        <div className="mt-3">
          <Badge tone="bad">{error}</Badge>
        </div>
      )}

      {data && (
        <div className="mt-5">
          <RunTrace data={data} />
        </div>
      )}
    </GlassCard>
  );
}
