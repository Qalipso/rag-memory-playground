import type { ChunkType, FileKind, MemoryChunk } from "./types";

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","must","shall","can","need",
  "to","of","in","on","at","by","for","with","about","against","between","into","through",
  "during","before","after","above","below","from","up","down","out","off","over","under","again",
  "further","then","once","this","that","these","those","i","me","my","myself","we","our","ours",
  "you","your","yours","he","she","it","its","they","them","their","what","which","who","whom",
  "if","because","as","while","also","just","so","than","too","very","not","no","yes","there",
  "here","when","where","why","how","all","any","both","each","few","more","most","other","some",
  "such","only","own","same","new","one","two","three"
]);

const CODE_HINTS = /\b(function|const|let|var|class|interface|import|export|return|=>|async|await)\b/;
const CONFIG_HINTS = /^\s*[{[]|"[^"]+"\s*:|^\s*(version|name|scripts|dependencies)\s*[:=]/m;

export function detectChunkType(text: string, fileKind: FileKind): ChunkType {
  if (fileKind === "json") return "config";
  if (fileKind === "code") return "code";
  if (CODE_HINTS.test(text)) return "code";
  if (CONFIG_HINTS.test(text)) return "config";
  if (fileKind === "md" || fileKind === "txt") return "docs";
  return "unknown";
}

export function extractKeywords(text: string, maxTerms = 12): string[] {
  const counts = new Map<string, number>();
  const tokens = text
    .toLowerCase()
    .replace(/[`*_#>~|\\/{}[\]()<>+=,.;:!?"']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([w]) => w);
}

/**
 * Split text into readable chunks.
 *
 * Strategy:
 * - Markdown/text: split by headings/blank lines, target ~600 chars per chunk.
 * - Code: split by blank lines, target ~800 chars.
 * - JSON: treat whole file as one chunk (small files) or split by top-level keys.
 */
export function chunkText(text: string, fileKind: FileKind): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (fileKind === "json") {
    return trimmed.length > 1500
      ? splitByDelimiter(trimmed, /\n\s*\n/, 1500)
      : [trimmed];
  }

  if (fileKind === "code") {
    return splitByDelimiter(trimmed, /\n\s*\n/, 800);
  }

  // md / txt
  const parts = trimmed.split(/\n(?=#{1,6}\s)/);
  const chunks: string[] = [];
  for (const part of parts) {
    if (part.length <= 700) {
      chunks.push(part.trim());
    } else {
      chunks.push(...splitByDelimiter(part, /\n\s*\n/, 700));
    }
  }
  return chunks.filter((c) => c.length > 20);
}

function splitByDelimiter(text: string, delimiter: RegExp, target: number): string[] {
  const segments = text.split(delimiter);
  const chunks: string[] = [];
  let buffer = "";
  for (const seg of segments) {
    const next = buffer ? `${buffer}\n\n${seg}` : seg;
    if (next.length > target && buffer) {
      chunks.push(buffer.trim());
      buffer = seg;
    } else {
      buffer = next;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

export function buildChunks(
  sourceId: string,
  sourceName: string,
  fileKind: FileKind,
  content: string,
  chunkIdPrefix: string,
): MemoryChunk[] {
  const parts = chunkText(content, fileKind);
  return parts.map((text, index) => ({
    id: `${chunkIdPrefix}-${index}`,
    sourceId,
    sourceName,
    text,
    index,
    type: detectChunkType(text, fileKind),
    charCount: text.length,
    keywords: extractKeywords(text, 10),
  }));
}
