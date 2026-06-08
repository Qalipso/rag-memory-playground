/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Repo has its own lockfile; pin tracing root so Next does not climb to the monorepo parent.
  outputFileTracingRoot: import.meta.dirname,
  // llamaindex drags heavy native/ML deps (onnx, sharp, huggingface, transformers)
  // that the OpenAI + lexical retrieval path never loads. Exclude from function
  // bundles to stay under Vercel's 250 MB serverless limit. Real-provider paths
  // that need these are not used in the deployed demo; stub fallback covers them.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/**",
      "node_modules/@huggingface/**",
      "node_modules/@xenova/**",
      "node_modules/sharp/**",
      "node_modules/@img/**",
      "node_modules/@anush008/**",
      "node_modules/@napi-rs/**",
      "node_modules/**/*.node.map",
      "node_modules/**/prebuilds/**",
    ],
  },
  // Framework engine pulls in llamaindex / mem0ai / langfuse / openai / pg
  // which are Node-only. Keep them external so webpack does not try to inline.
  serverExternalPackages: [
    "llamaindex",
    "mem0ai",
    "@langchain/langgraph",
    "@langchain/core",
    "langfuse",
    "openai",
    "pg",
  ],
  webpack(config) {
    // NodeNext-style imports use ".js" extensions even in .ts source.
    // Tell webpack to resolve those to the matching .ts/.tsx file.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
