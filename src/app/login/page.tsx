import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <PageShell><AuthForm mode="login" /></PageShell>;
}
