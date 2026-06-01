import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone output cho Docker — copy minimal runtime + server.js
  output: 'standalone',

  // Cho phép máy khác trong LAN truy cập dev resources (HMR, _next/static)
  // Thêm IP mới vào đây nếu đổi subnet
  allowedDevOrigins: ['192.168.0.99', '192.168.0.126'],

  // Inject env vào client bundle (Turbopack đọc từ đây thay vì .env.local)
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5005',
  },
};

export default nextConfig;
