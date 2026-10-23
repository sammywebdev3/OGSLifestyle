import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { PageShell } from '@/components/ui/PageShell';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return <PageShell><ResetPasswordForm /></PageShell>;
}
