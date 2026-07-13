import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@trigger.dev/sdk"],
  experimental: {
    // Los uploads de CV/informe viajan como base64 dentro de un Server Action.
    // El default de 1MB se queda corto (un PDF de ~1MB → ~1.3MB en base64) y
    // hacía explotar la página con "Algo se rompió cargando esta cuenta".
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
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
