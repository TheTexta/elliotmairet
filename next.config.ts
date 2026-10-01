import type { NextConfig } from "next";

const r2PublicUrlValue = process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL?.trim();
const r2PublicUrl = r2PublicUrlValue ? new URL(r2PublicUrlValue) : null;

if (r2PublicUrl && r2PublicUrl.protocol !== "https:") {
  throw new Error("NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL must use HTTPS.");
}

const nextConfig: NextConfig = {
  images: {
    deviceSizes: [
      320, 480, 640, 768, 960, 1200, 1600, 2048, 2560, 3200, 3840, 5120,
    ],
    loader: "custom",
    loaderFile: "./app/supabase-image-loader.ts",
    qualities: [74, 82],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dextery.dev",
        pathname: "/storage/v1/object/public/elliotmairet/**",
      },
      {
        protocol: "https",
        hostname: "api.dextery.dev",
        pathname: "/storage/v1/render/image/public/elliotmairet/**",
      },
      ...(r2PublicUrl
        ? [{
            protocol: "https" as const,
            hostname: r2PublicUrl.hostname,
            port: r2PublicUrl.port,
            pathname: `${r2PublicUrl.pathname.replace(/\/$/, "")}/**`,
            search: "",
          }]
        : []),
    ],
  },
};

export default nextConfig;
