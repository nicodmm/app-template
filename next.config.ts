import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@trigger.dev/sdk"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
