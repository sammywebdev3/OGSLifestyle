import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PlayerProvider } from '@/features/player/PlayerProvider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'OGUN STATE LIFESTYLE', template: '%s · OGUN STATE LIFESTYLE' },
  description: 'A 2.5D isometric life simulation set in Ogun State, Nigeria. Build your life in Abeokuta — from a starter apartment in Kuto.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111a3d',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
