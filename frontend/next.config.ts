import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone output cho Docker — copy minimal runtime + server.js
  output: 'standalone',
};

export default nextConfig;
