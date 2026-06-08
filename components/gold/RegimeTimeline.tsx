"use client";

import { useMemo, useState } from "react";
import { GlassCard, CardTitle } from "@/components/ui/card";
import {
  REGIME_COLORS,
  type AnnualPrice,
  type GoldRegime,
} from "./types";

interface Props {
  regimes: GoldRegime[];
  annual: AnnualPrice[];
}

const W = 1000;
const H = 150;
const PAD_L = 8;
const PAD_R = 8;
const BAND_TOP = 92;
const BAND_H = 30;
const MIN_YEAR = 1926;
const MAX_YEAR = 2026;

export function RegimeTimeline({ regimes, annual }: Props) {
  const [hover, setHover] = useState<GoldRegime | null>(null);

  const x = (year: number) =>
    PAD_L + ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * (W - PAD_L - PAD_R);

  const pricePath = useMemo(() => {
    const prices = annual.filter((a) => Number.isFinite(a.priceUsd) && a.priceUsd > 0);
    if (prices.length === 0) return "";
    const logs = prices.map((p) => Math.log10(p.priceUsd));
    const minL = Math.min(...logs);
    const maxL = Math.max(...logs);
    const top = 12;
    const bottom = BAND_TOP - 10;
    const y = (price: number) => {
      const t = (Math.log10(price) - minL) / (maxL - minL || 1);
      return bottom - t * (bottom - top);
    };
    return prices
      .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.year).toFixed(1)} ${y(p.priceUsd).toFixed(1)}`)
      .join(" ");
  }, [annual]);

  const decades = [1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <CardTitle>Regime timeline · 1926–2026</CardTitle>
        <span className="text-[11px] text-white/40">log-scaled gold price</span>
      </div>

      <div className="mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
          {/* decade gridlines */}
          {decades.map((d) => (
            <g key={d}>
              <line x1={x(d)} y1={8} x2={x(d)} y2={BAND_TOP + BAND_H} stroke="#ffffff10" strokeWidth={1} />
              <text x={x(d)} y={H - 4} fill="#ffffff40" fontSize={11} textAnchor="middle">
                {d}
              </text>
            </g>
          ))}

          {/* price line */}
          <path d={pricePath} fill="none" stroke="#fbbf24" strokeWidth={1.8} opacity={0.9} />

          {/* regime bands */}
          {regimes.map((r) => {
            const x0 = x(r.startYear);
            const x1 = x(Math.min(r.endYear, MAX_YEAR));
            const color = REGIME_COLORS[r.id] ?? "#94a3b8";
            return (
              <g
                key={r.id}
                onMouseEnter={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x0}
                  y={BAND_TOP}
                  width={Math.max(1, x1 - x0)}
                  height={BAND_H}
                  rx={4}
                  fill={color}
                  opacity={hover && hover.id === r.id ? 0.55 : 0.3}
                  stroke={color}
                  strokeOpacity={0.5}
                />
                {x1 - x0 > 70 && (
                  <text
                    x={(x0 + x1) / 2}
                    y={BAND_TOP + BAND_H / 2 + 3}
                    fill="#e6edf3"
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {r.name.split(" ").slice(0, 2).join(" ")}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 min-h-[44px] rounded-lg bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-white/70">
        {hover ? (
          <>
            <span className="font-semibold text-white/90">{hover.name}</span> ({hover.startYear}–
            {hover.endYear}): {hover.summary}
          </>
        ) : (
          <span className="text-white/40">Hover a band to read the regime. The amber line is the log-scaled gold price.</span>
        )}
      </div>
    </GlassCard>
  );
}
