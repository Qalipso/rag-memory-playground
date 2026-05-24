/**
 * URL → plain text → chunks. Phase 1: simple HTML strip + size-based chunking.
 * Replace with LlamaIndex.TS ingestion pipeline when real RAG provider is wired.
 */

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 80;
const MAX_FETCH_BYTES = 1_500_000; // 1.5 MB cap to avoid runaway downloads

export interface ExtractedDocument {
  title: string;
  content: string;
  charsExtracted: number;
}

export interface Chunk {
  content: string;
  chunkIndex: number;
}

export async function fetchAndExtract(url: string): Promise<ExtractedDocument> {
  const u = new URL(url); // throws if invalid
  // SSRF defense for the dev playground: forbid private network targets.
  if (
    /^(localhost|127\.|0\.0\.0\.0$|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(
      u.hostname
    )
  ) {
    throw new Error("Refusing to fetch private-network URL.");
  }

  const res = await fetch(u, {
    redirect: "follow",
    headers: { "user-agent": "rag-memory-playground/0.3 (knowledge-ingest)" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Empty response body.");

  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_FETCH_BYTES) {
      reader.cancel().catch(() => undefined);
      throw new Error(`Response exceeded ${MAX_FETCH_BYTES} bytes.`);
    }
    chunks.push(value);
  }

  // Concat into single Uint8Array.
  const total = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    total.set(c, offset);
    offset += c.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(total);

  const title = extractTitle(text) ?? u.hostname;
  const content = htmlToText(text);

  return { title, content, charsExtracted: content.length };
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string): string {
  // Strip script/style first.
  let s = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  // Replace block tags with newlines for readability.
  s = s.replace(/<(\/p|\/div|\/li|br|\/h[1-6])\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  s = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return s;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

export function chunkText(content: string): Chunk[] {
  if (content.length === 0) return [];
  const out: Chunk[] = [];
  let start = 0;
  let idx = 0;
  while (start < content.length) {
    const end = Math.min(content.length, start + CHUNK_SIZE);
    let slice = content.slice(start, end);
    // Try to break on sentence boundary near the end.
    if (end < content.length) {
      const lastDot = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"));
      if (lastDot > CHUNK_SIZE * 0.6) {
        slice = slice.slice(0, lastDot + 1);
      }
    }
    out.push({ content: slice.trim(), chunkIndex: idx++ });
    if (end >= content.length) break;
    start += slice.length - CHUNK_OVERLAP;
    if (start <= 0) start = end;
  }
  return out.filter((c) => c.content.length > 0);
}
