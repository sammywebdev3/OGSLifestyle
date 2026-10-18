import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/AuthForm';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return <PageShell><AuthForm mode="register" /></PageShell>;
}
