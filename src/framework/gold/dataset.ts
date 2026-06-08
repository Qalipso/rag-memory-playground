/**
 * Loads and parses the /data/gold seed files into a typed GoldDataset.
 *
 * Synchronous fs reads, cached on globalThis so the Next.js server and the
 * seed script both pay the parse cost only once per process. Files are the
 * single source of truth; everything downstream (knowledge docs, memory notes,
 * graph) is derived from this dataset.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AnnualPrice,
  GoldDataset,
  GoldEvalFile,
  GoldEvent,
  GoldHypothesis,
  GoldRegime,
  MonthlyPrice,
} from "./types.js";

function goldDir(): string {
  return join(process.cwd(), "data", "gold");
}

function read(file: string): string {
  return readFileSync(join(goldDir(), file), "utf8");
}

function parseAnnual(csv: string): AnnualPrice[] {
  return parseCsvRows(csv).map((cols) => ({
    year: Number(cols[0]),
    priceUsd: Number(cols[1]),
    regimeId: cols[2] ?? "",
    note: cols[3] ?? "",
  }));
}

function parseMonthly(csv: string): MonthlyPrice[] {
  return parseCsvRows(csv).map((cols) => ({
    month: cols[0] ?? "",
    priceUsd: Number(cols[1]),
    regimeId: cols[2] ?? "",
    note: cols[3] ?? "",
  }));
}

/** Minimal CSV row parser: skips header, blank lines, and `#` comments. */
function parseCsvRows(csv: string): string[][] {
  const lines = csv.split(/\r?\n/);
  const rows: string[][] = [];
  let headerSeen = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    if (!headerSeen) {
      headerSeen = true;
      continue; // skip header
    }
    rows.push(splitCsvLine(line));
  }
  return rows;
}

/** Split a CSV line, honoring simple double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => JSON.parse(l) as T);
}

function loadDataset(): GoldDataset {
  const annual = parseAnnual(read("prices_annual_1926_2026.csv"));
  const monthly = parseMonthly(read("prices_monthly_1978_2026.csv"));
  const regimes = JSON.parse(read("regimes.json")) as GoldRegime[];
  const events = parseJsonl<GoldEvent>(read("events_1926_2026.jsonl"));
  const hypotheses = parseJsonl<GoldHypothesis>(read("hypotheses.jsonl"));
  return { annual, monthly, regimes, events, hypotheses };
}

declare global {
  // eslint-disable-next-line no-var
  var __goldDataset: GoldDataset | undefined;
  // eslint-disable-next-line no-var
  var __goldEval: GoldEvalFile | undefined;
}

export function getGoldDataset(): GoldDataset {
  if (!globalThis.__goldDataset) globalThis.__goldDataset = loadDataset();
  return globalThis.__goldDataset;
}

export function getGoldEval(): GoldEvalFile {
  if (!globalThis.__goldEval) {
    globalThis.__goldEval = JSON.parse(read("gold-history-eval.json")) as GoldEvalFile;
  }
  return globalThis.__goldEval;
}

export function resetGoldCache(): void {
  globalThis.__goldDataset = undefined;
  globalThis.__goldEval = undefined;
}
