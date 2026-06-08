"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, GitCompareArrows, Sparkles, Terminal, FlaskConical, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/memory", label: "Memory Lab", icon: Brain },
  { href: "/gold-lab", label: "Gold Lab", icon: Coins },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/rag-memory-playground", label: "Playground", icon: Terminal },
  { href: "/eval", label: "Eval", icon: FlaskConical },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 px-4 pt-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between glass rounded-2xl px-4 py-2.5">
          <Link href="/" className="group flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-2)] text-[#06121a]">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              RAG <span className="text-gradient">Memory</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/55 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
