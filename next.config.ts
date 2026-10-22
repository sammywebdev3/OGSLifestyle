import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/http/securityHeaders';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Phaser is only ever loaded in the browser (see src/components/game/GameCanvas.tsx).
  transpilePackages: [],
  // Security headers on every route (CSP is report-only for now; see src/lib/http/securityHeaders.ts).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL) }];
  },
};

export default nextConfig;
