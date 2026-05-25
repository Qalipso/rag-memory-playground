import { NextResponse } from "next/server";
import { SAMPLE_FILES } from "../../../src/mvp/sample-files";

// Derive stub sources from actual SAMPLE_FILES so content is real.
const STUB_SOURCES = SAMPLE_FILES.map((f, i) => ({
  id: `src-${i + 1}`,
  type: "file" as const,
  title: f.name,
  tags: [],
  status: "indexed" as const,
  charsExtracted: f.content.length,
  chunksCreated: Math.ceil(f.content.length / 800),
  providerMode: "stub" as const,
  contentPreview: f.content.slice(0, 600).replace(/\n{3,}/g, "\n\n").trim(),
}));

export function GET() {
  return NextResponse.json({
    sources: STUB_SOURCES,
    totalSources: STUB_SOURCES.length,
    totalChunks: STUB_SOURCES.reduce((s, src) => s + src.chunksCreated, 0),
    ragMode: "stub",
  });
}

export function POST() {
  return NextResponse.json({ error: "Write not available in portfolio demo" }, { status: 501 });
}
