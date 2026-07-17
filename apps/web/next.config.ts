import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The visual renderer loads this font through fontconfig at runtime. Include
  // it explicitly in every Vercel function trace; local machines often have
  // fallback fonts installed, while the serverless runtime does not.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
