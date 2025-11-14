import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Enable Turbopack filesystem caching for faster dev server restarts
    // Stores compiler artifacts on disk between runs for significantly faster compile times
    turbopackFileSystemCacheForDev: true,
    // Note: turbopackFileSystemCacheForBuild requires Next.js canary version
    // Removed for compatibility with Next.js 16.0.1 stable
    // Forward browser console logs and runtime errors to the development server terminal
    browserDebugInfoInTerminal: true,
  },
};

export default nextConfig;
