import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-cream p-6 text-ink shadow-card ring-1 ring-black/5 ${className}`}>{children}</div>;
}
