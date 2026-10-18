import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { PageShell } from '@/components/ui/PageShell';
import { toAuthErrorCode } from '@/features/auth/authErrors';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <PageShell><AuthForm mode="login" errorCode={toAuthErrorCode(error)} /></PageShell>;
}
