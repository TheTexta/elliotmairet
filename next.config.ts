import type { NextConfig } from "next";

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
    ],
  },
};

export default nextConfig;
