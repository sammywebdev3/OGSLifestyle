import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { PageShell } from '@/components/ui/PageShell';
import { toAuthErrorCode } from '@/features/auth/authErrors';

export const metadata: Metadata = { title: 'Forgot password' };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <PageShell><ForgotPasswordForm errorCode={toAuthErrorCode(error)} /></PageShell>;
}
