import Link from "next/link";
import { Brain, GitCompareArrows, Terminal, FlaskConical, ArrowRight, Boxes } from "lucide-react";
import { GlassCard, CardTitle, CardDesc } from "@/components/ui/card";
import { Badge } from "@/components/ui/primitives";

const SURFACES = [
  {
    href: "/memory",
    icon: Brain,
    title: "Visual Memory Lab",
    desc: "Raw note → multi-level long-term memory. Normalize, classify, extract entities, split blocks, embed, store, link graph, consolidate.",
    tone: "brand" as const,
  },
  {
    href: "/compare",
    icon: GitCompareArrows,
    title: "Side-by-side Compare",
    desc: "Same query across 2–4 pipeline configs. Diff quality × cost × latency, winners per axis.",
    tone: "info" as const,
  },
  {
    href: "/rag-memory-playground",
    icon: Terminal,
    title: "Framework Playground",
    desc: "Run any query through the LangGraph workflow. Inspect the full ExplainableRun trace.",
    tone: "good" as const,
  },
  {
    href: "/eval",
    icon: FlaskConical,
    title: "Golden Eval",
    desc: "Score retrieval + answers against a golden set. Deterministic or LLM-as-judge.",
    tone: "warn" as const,
  },
];

const STACK = [
  "LangGraph",
  "LlamaIndex.TS",
  "Mem0",
  "OpenAI",
  "Ragas-shaped eval",
  "Langfuse",
  "pgvector",
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl glass p-8 sm:p-12">
        <div className="glow pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--color-brand-2)]/20 blur-3xl" />
        <Badge tone="brand" className="mb-4">
          <Boxes className="h-3 w-3" /> framework-first · honest providers
        </Badge>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Watch raw text become <span className="text-gradient">structured memory</span>.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
          A framework-first RAG Memory engine. Real LangGraph orchestration; LlamaIndex, Mem0,
          OpenAI, and Langfuse promote per key, else fall back to honest stubs — surfaced in every
          run.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/memory"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--color-brand)] to-[var(--color-brand-2)] px-5 py-2.5 text-sm font-semibold text-[#06121a] transition hover:-translate-y-0.5 hover:brightness-110"
          >
            Open Memory Lab <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/compare"
            className="glass glass-hover inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm text-white/85"
          >
            Compare configs
          </Link>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">
          {STACK.map((s) => (
            <span
              key={s}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-white/55"
            >
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* surfaces */}
      <section className="grid gap-4 sm:grid-cols-2">
        {SURFACES.map(({ href, icon: Icon, title, desc, tone }) => (
          <Link key={href} href={href}>
            <GlassCard hover className="group h-full">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10">
                  <Icon className="h-5 w-5 text-[var(--color-brand)]" />
                </span>
                <Badge tone={tone}>open</Badge>
              </div>
              <CardTitle className="mt-4 text-base">{title}</CardTitle>
              <CardDesc className="mt-1.5">{desc}</CardDesc>
              <span className="mt-4 inline-flex items-center gap-1 text-xs text-white/50 transition group-hover:text-[var(--color-brand)]">
                Enter <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </GlassCard>
          </Link>
        ))}
      </section>
    </div>
  );
}
