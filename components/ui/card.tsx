import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl p-5",
        hover && "glass-hover",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight text-white/90", className)} {...props} />;
}

export function CardDesc({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs leading-relaxed text-[var(--color-muted)]", className)} {...props} />;
}
