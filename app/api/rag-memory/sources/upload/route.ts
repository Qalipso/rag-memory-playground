/**
 * POST /api/rag-memory/sources/upload
 *
 * Accepts multipart/form-data with one or more files. Extracts plain text and
 * indexes each file as a separate KnowledgeSource. Supports folder upload via
 * webkitdirectory (browser sends each file with its relativePath in the form
 * field name "relativePath_<index>").
 *
 * SECURITY (local dev only):
 *   - 5 MB per file cap.
 *   - 200 files per request cap.
 *   - Text-only MIME / extension allow-list. Binaries skipped, not indexed.
 *
 * SKIP rules:
 *   - .git, node_modules, dist, .next, .turbo, build, .cache anywhere in path.
 *   - lockfiles, sourcemaps, minified bundles by extension.
 */

import { getSharedFrameworkContainer } from "../../../../../src/framework";
import { getKnowledgeStore } from "../../../../../src/framework/knowledge/store";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 200;

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "mdx", "rst", "log",
  "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "env",
  "csv", "tsv",
  "html", "htm", "xml", "svg",
  "css", "scss", "sass", "less",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "vue", "svelte", "astro",
  "py", "rb", "go", "rs", "java", "kt", "swift", "c", "cpp", "h", "hpp",
  "cs", "php", "scala", "sh", "bash", "zsh", "fish",
  "sql", "graphql", "gql", "proto",
  "dockerfile", "makefile",
]);

const SKIP_PATH_SEGMENTS = [
  ".git/", "/.git/", "node_modules/", "/node_modules/",
  "dist/", "/dist/", "build/", "/build/",
  ".next/", "/.next/", ".turbo/", "/.turbo/",
  ".cache/", "/.cache/", "coverage/", "/coverage/",
  ".venv/", "/.venv/", "__pycache__/", "/__pycache__/",
  "vendor/", "/vendor/",
];

const SKIP_FILE_SUFFIXES = [
  ".min.js", ".min.css", ".map", ".lock",
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function currentRagMode(): "real" | "stub" | "fallback" {
  try {
    const c = getSharedFrameworkContainer();
    const rag = c.providerStatus.find((p) => p.role === "rag");
    return (rag?.mode ?? "stub") as "real" | "stub" | "fallback";
  } catch {
    return "stub";
  }
}

function extOf(name: string): string {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot < 0) {
    // No extension — check known nameless files (Dockerfile, Makefile).
    return base.toLowerCase();
  }
  return base.slice(dot + 1).toLowerCase();
}

function isSkippedPath(path: string): boolean {
  const lower = path.toLowerCase();
  for (const seg of SKIP_PATH_SEGMENTS) {
    if (lower.includes(seg)) return true;
  }
  for (const suf of SKIP_FILE_SUFFIXES) {
    if (lower.endsWith(suf)) return true;
  }
  return false;
}

function isTextExtension(ext: string): boolean {
  return TEXT_EXTENSIONS.has(ext);
}

interface UploadOutcome {
  fileName: string;
  relativePath: string;
  status: "indexed" | "skipped" | "failed";
  reason?: string;
  sourceId?: string;
  charsExtracted?: number;
  chunksCreated?: number;
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return jsonResponse({ error: "Expected multipart/form-data." }, 400);
  }

  const ragMode = currentRagMode();
  const store = getKnowledgeStore();
  const outcomes: UploadOutcome[] = [];

  // Files arrive under any field name. Pair each File with its relativePath
  // entry (browser sends webkitRelativePath as a sibling field if frontend
  // explicitly appended it; otherwise file.name is the only path).
  const entries: Array<{ file: File; relativePath: string }> = [];
  let fileCount = 0;
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (fileCount >= MAX_FILES_PER_REQUEST) break;
      fileCount += 1;
      const relPath = form.get(`relativePath_${key}`);
      const relativePath = typeof relPath === "string" ? relPath : value.name;
      entries.push({ file: value, relativePath });
    }
  }

  if (entries.length === 0) {
    return jsonResponse({ error: "No files in upload." }, 400);
  }

  for (const { file, relativePath } of entries) {
    const path = relativePath || file.name;

    if (isSkippedPath(path)) {
      outcomes.push({
        fileName: file.name,
        relativePath: path,
        status: "skipped",
        reason: "path matches skip list",
      });
      continue;
    }

    const ext = extOf(path);
    if (!isTextExtension(ext) && ext !== "dockerfile" && ext !== "makefile") {
      outcomes.push({
        fileName: file.name,
        relativePath: path,
        status: "skipped",
        reason: `unsupported extension .${ext}`,
      });
      continue;
    }

    if (file.size > MAX_FILE_BYTES) {
      outcomes.push({
        fileName: file.name,
        relativePath: path,
        status: "skipped",
        reason: `file > ${MAX_FILE_BYTES} bytes`,
      });
      continue;
    }

    try {
      const text = await file.text();
      if (text.trim().length === 0) {
        outcomes.push({
          fileName: file.name,
          relativePath: path,
          status: "skipped",
          reason: "empty content",
        });
        continue;
      }
      const source = store.addFile({
        fileName: file.name,
        relativePath: path,
        content: text,
        tags: ["upload"],
        providerMode: ragMode,
      });
      outcomes.push({
        fileName: file.name,
        relativePath: path,
        status: source.status === "indexed" ? "indexed" : "failed",
        ...(source.status === "indexed" ? { sourceId: source.id } : {}),
        charsExtracted: source.charsExtracted,
        chunksCreated: source.chunksCreated,
      });
    } catch (err) {
      outcomes.push({
        fileName: file.name,
        relativePath: path,
        status: "failed",
        reason: (err as Error).message,
      });
    }
  }

  const totals = {
    indexed: outcomes.filter((o) => o.status === "indexed").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
  };

  return jsonResponse({
    ok: totals.indexed > 0,
    totals,
    outcomes,
    storeSize: store.list().length,
    ragMode,
  });
}

// Increase body size limit for folder uploads.
export const runtime = "nodejs";
