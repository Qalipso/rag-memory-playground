import type { ReactNode } from "react";
import "./globals.css";
import { Shell } from "@/components/Shell";

export const metadata = {
  title: "RAG Memory Playground",
  description:
    "Framework-first RAG Memory engine — LangGraph · LlamaIndex.TS · Mem0 · OpenAI · Ragas-shaped eval · Langfuse",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-bg" />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
