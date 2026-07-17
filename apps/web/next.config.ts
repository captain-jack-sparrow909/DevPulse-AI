import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The visual renderer loads this font through fontconfig at runtime. Include
  // it explicitly in every Vercel function trace; local machines often have
  // fallback fonts installed, while the serverless runtime does not.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
};

export default nextConfig;
