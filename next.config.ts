import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Phaser is only ever loaded in the browser (see src/components/game/GameCanvas.tsx).
  transpilePackages: [],
};

export default nextConfig;
