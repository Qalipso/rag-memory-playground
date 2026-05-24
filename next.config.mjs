/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
