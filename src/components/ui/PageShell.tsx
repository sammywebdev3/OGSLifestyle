import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';

/** Dark adire-blue backdrop used by the menu screens (auth, character, apartment). */
export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-dvh bg-adire-900 bg-adire-dots text-cream [background-size:22px_22px]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Home"><Logo compact /></Link>
      </header>
      <div className={`mx-auto px-4 pb-16 sm:px-6 ${wide ? 'max-w-5xl' : 'max-w-md'}`}>{children}</div>
    </main>
  );
}
