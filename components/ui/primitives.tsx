import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "good" | "warn" | "bad" | "info";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/8 text-white/70 border-white/10",
    brand: "bg-[var(--color-brand)]/12 text-[var(--color-brand)] border-[var(--color-brand)]/25",
    good: "bg-emerald-400/12 text-emerald-300 border-emerald-400/25",
    warn: "bg-amber-400/12 text-amber-300 border-amber-400/25",
    bad: "bg-rose-400/12 text-rose-300 border-rose-400/25",
    info: "bg-sky-400/12 text-sky-300 border-sky-400/25",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl bg-black/30 border border-white/10 px-3.5 py-3 text-sm text-white/90 placeholder:text-white/30 outline-none transition focus:border-[var(--color-brand)]/50 focus:ring-2 focus:ring-[var(--color-brand)]/20 resize-y",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "w-full rounded-xl bg-black/30 border border-white/10 px-3.5 h-10 text-sm text-white/90 placeholder:text-white/30 outline-none transition focus:border-[var(--color-brand)]/50 focus:ring-2 focus:ring-[var(--color-brand)]/20",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full rounded-xl bg-black/30 border border-white/10 px-3 h-10 text-sm text-white/90 outline-none transition focus:border-[var(--color-brand)]/50 [&>option]:bg-[#0b0f17]",
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/40">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-white/90">{value}</div>
      {sub && <div className="text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}
