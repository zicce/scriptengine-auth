import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  experimental: {
    proxyClientMaxBodySize: "80mb",
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  },
  poweredByHeader: false,
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/images/logo-icon.png", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/((?!demo).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The public demo panel may be embedded by the marketing site.
        source: "/demo/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://scriptengine.gg https://www.scriptengine.gg http://localhost:*" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
