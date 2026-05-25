"use client";

/**
 * PipelineGraph — placeholder.
 *
 * react-force-graph-2d was removed (unused dep, S0 cleanup).
 * Graph view is out of scope for Phase 0/1 — slated for Phase 2.
 */

import type { MemoryBlock, MemoryChunk, SourceFile } from "../src/mvp/types";

interface Props {
  sources: SourceFile[];
  blocks: MemoryBlock[];
  chunks: MemoryChunk[];
}

export default function PipelineGraph({ sources, blocks, chunks }: Props) {
  return (
    <div
      style={{
        padding: 32,
        textAlign: "center",
        color: "#8b949e",
        fontFamily: "ui-monospace, monospace",
        border: "1px dashed #30363d",
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 14, marginBottom: 8 }}>Graph view — coming in Phase 2</div>
      <div style={{ fontSize: 12 }}>
        {sources.length} sources · {chunks.length} chunks · {blocks.length} blocks indexed
      </div>
    </div>
  );
}
