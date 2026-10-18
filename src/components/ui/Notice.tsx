import type { ReactNode } from 'react';

const tones = {
  info: 'bg-adire-900/5 text-adire-900 ring-adire-900/15',
  warn: 'bg-palm-300/40 text-ink ring-palm-700/30',
  error: 'bg-laterite-300/40 text-laterite-700 ring-laterite-700/30',
  success: 'bg-ogun-100 text-ogun-700 ring-ogun-600/30',
};

export function Notice({ tone = 'info', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-sm ring-1 ${tones[tone]}`}>{children}</div>;
}
