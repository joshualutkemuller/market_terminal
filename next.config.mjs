/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The terminal is a fully client-rendered, data-dense application; we lean on
  // deterministic mock generators so the whole platform runs with zero backend.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
