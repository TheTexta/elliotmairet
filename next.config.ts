import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dextery.dev",
        pathname: "/storage/v1/render/image/public/elliotmairet/**",
      },
    ],
  },
};

export default nextConfig;
