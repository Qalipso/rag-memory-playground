import Link from "next/link";

export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: 48,
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>RAG Memory Playground</h1>
      <p style={{ color: "#8b949e", marginBottom: 24, lineHeight: 1.6 }}>
        Framework-first RAG Memory engine. LangGraph orchestration · LlamaIndex.TS retrieval ·
        Mem0 memory · OpenAI generation · Ragas-shaped evaluation · Langfuse observability.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/playground"
          style={{
            background: "#238636",
            color: "white",
            textDecoration: "none",
            padding: "10px 18px",
            borderRadius: 4,
            display: "inline-block",
          }}
        >
          Open MVP playground →
        </Link>
        <Link
          href="/compare"
          style={{
            background: "#1f6feb",
            color: "white",
            textDecoration: "none",
            padding: "10px 18px",
            borderRadius: 4,
            display: "inline-block",
          }}
        >
          Pipeline compare →
        </Link>
        <Link
          href="/eval"
          style={{
            background: "#6e40c9",
            color: "white",
            textDecoration: "none",
            padding: "10px 18px",
            borderRadius: 4,
            display: "inline-block",
          }}
        >
          Golden eval →
        </Link>
        <Link
          href="/rag-memory-playground"
          style={{
            background: "#21262d",
            color: "#c9d1d9",
            textDecoration: "none",
            padding: "10px 18px",
            borderRadius: 4,
            display: "inline-block",
            border: "1px solid #30363d",
          }}
        >
          Framework debug →
        </Link>
      </div>
      <p style={{ marginTop: 24, color: "#8b949e", fontSize: 13 }}>
        API endpoint:{" "}
        <code style={{ background: "#161b22", padding: "2px 6px", borderRadius: 3 }}>
          POST /api/rag-memory/framework-run
        </code>
      </p>
    </main>
  );
}
