import type { ReactNode } from "react";

export const metadata = {
  title: "RAG Memory Playground",
  description: "LangGraph + LlamaIndex.TS + Mem0 + Langfuse + Ragas-shaped evaluation",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0d1117", color: "#e6edf3" }}>{children}</body>
    </html>
  );
}
