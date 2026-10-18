import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold';

const styles: Record<Variant, string> = {
  primary: 'bg-ogun-500 text-white hover:bg-ogun-600 shadow-pop active:translate-y-0.5 active:shadow-none',
  gold: 'bg-palm-500 text-ink hover:bg-palm-300 shadow-pop active:translate-y-0.5 active:shadow-none',
  secondary: 'bg-white/90 text-adire-900 ring-1 ring-adire-900/15 hover:bg-white',
  ghost: 'bg-transparent text-current hover:bg-white/10',
};
const base = 'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-palm-500';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ href, variant = 'primary', className = '', children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={`${base} ${styles[variant]} ${className}`}>{children}</Link>;
}
