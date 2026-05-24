import type { FileInput } from "./engine";

/**
 * Built-in sample project — six files, enough to surface every block type.
 * Content is intentionally small but dense with signals (features/decisions/
 * risks/todos/concepts) so the heuristic extractor produces a useful demo.
 */
export const SAMPLE_FILES: FileInput[] = [
  {
    name: "README.md",
    path: "README.md",
    content: `# RAG Memory Playground

A small playground that turns project files into structured RAG memory.

The user can upload markdown, text, JSON, or TypeScript files. The app then
splits them into chunks, extracts memory blocks (Feature, Decision, Risk,
Todo, Concept), and answers questions with sources.

This project supports:
- File-based ingestion
- Heuristic memory block extraction
- Keyword-based retrieval with source attribution
- A visible retrieval trace for every answer

The playground is deliberately small. It is not a full RAG framework and
does not call any LLM by default.
`,
  },
  {
    name: "architecture.md",
    path: "docs/architecture.md",
    content: `# Architecture

We decided to keep the MVP entirely in the browser. No backend, no database,
no vector store. The rationale is that the playground is a teaching tool —
visibility of every step matters more than retrieval quality.

## Layers

1. Ingestion — files become SourceFile records.
2. Chunking — markdown is split by headings, code by blank lines.
3. Extraction — heuristic rules produce MemoryBlock records.
4. Retrieval — keyword scoring with term expansion.
5. Answer — extractive composition from retrieved chunks and blocks.

## Decision: heuristics over embeddings

We chose keyword heuristics for the MVP because embeddings require an API key
and obscure the retrieval logic. A keyword pipeline makes the retrieval trace
genuinely useful for teaching how RAG works.

We will add optional embedding-based retrieval later, behind a feature flag.
`,
  },
  {
    name: "roadmap.md",
    path: "docs/roadmap.md",
    content: `# Roadmap

## Now (MVP)
- Sources, Chunks, Memory Blocks, Ask, Trace tabs
- Heuristic block extraction
- In-browser only

## Next
- TODO: add optional OpenAI-backed answer generation behind a toggle
- TODO: persist sessions in localStorage so reloads do not lose state
- TODO: support drag-and-drop folders, not only individual files
- We should improve the chunker to respect code function boundaries
- Need to add a confidence histogram in the Trace tab

## Risks
- Risk: large repos may freeze the UI thread; we have no worker yet.
- Risk: heuristic extraction misses nuanced decisions written in prose.
- Issue: JSON files larger than a few KB produce one giant chunk.
- Problem: there is no automated evaluation of retrieval quality yet.
`,
  },
  {
    name: "rag-settings.md",
    path: "docs/rag-settings.md",
    content: `# RAG Settings

The Settings page allows the user to configure how retrieval behaves.

## Features
- Pick which file types are indexed
- Adjust top-K for chunk retrieval
- Toggle Concept extraction on or off
- Choose between extractive and (future) generative answers

## Memory Blocks
The settings page also surfaces the memory blocks stored from the current
session. Feature blocks describe what the playground can do. Decision blocks
record architectural choices. Risk blocks highlight known limitations.
`,
  },
  {
    name: "promptops-notes.md",
    path: "docs/promptops-notes.md",
    content: `# PromptOps Notes

PromptOps is a prompt asset registry, not an evaluator. Its concepts are
useful here because a memory block is similar to a prompt asset: a typed,
versioned, summarised piece of project knowledge.

## Concepts
- Asset: a named piece of project knowledge with a lifecycle
- Fixture: a named variable set used to render a prompt
- Render check: an assertion on rendered text

## Decisions
- We use a flat asset list per project rather than a folder tree, because
  flat lists are easier to search and reason about.
- Versions are immutable. Once a version is published, edits create a new
  version rather than mutating the old one.

## Risks
- Risk: unbounded version growth if every tiny edit creates a new version.
- Todo: add an "amend" mode for trivial typo fixes within the same draft.
`,
  },
  {
    name: "sample-component.tsx",
    path: "components/SampleComponent.tsx",
    content: `import { useState } from "react";

/**
 * SampleComponent — minimal example used to show that the playground can
 * ingest TypeScript code, not only markdown.
 *
 * We decided to keep this component dependency-free so it can be copied into
 * other projects as-is.
 */
export function SampleComponent({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  // TODO: extract this into a reusable hook once we have a second consumer
  return (
    <div>
      <label>
        Note
        <input value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <p>Current value: {value}</p>
    </div>
  );
}
`,
  },
];
