'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { requestPasswordReset } from '@/features/auth/auth';
import { usePlayer } from '@/features/player/PlayerProvider';
import { AUTH_ERROR_MESSAGES, type AuthErrorCode } from '@/features/auth/authErrors';
import { looksLikeEmail } from '@/lib/validation/password';

/** "Forgot password": sends a reset link. The answer never says whether the e-mail has an account. */
export function ForgotPasswordForm({ errorCode = null }: { errorCode?: AuthErrorCode | null }) {
  const { onlineAvailable } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorCode ? AUTH_ERROR_MESSAGES[errorCode] : null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setError(null);
    if (!looksLikeEmail(email)) return setError('Enter the e-mail address you signed up with.');
    setBusy(true);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setSentTo(email);
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-black">Forgot your password?</h1>
      <p className="mt-1 text-sm text-ink/70">Enter your e-mail and we&apos;ll send you a link to choose a new password.</p>
      {!onlineAvailable ? (
        <div className="mt-4"><Notice tone="warn">Online accounts aren&apos;t set up on this server yet.</Notice></div>
      ) : sentTo ? (
        <div className="mt-5 space-y-3" aria-live="polite">
          <Notice tone="success">If an account exists for <strong>{sentTo}</strong>, a reset link is on its way. Open it in <strong>this browser</strong>. It works once and expires soon.</Notice>
          <p className="text-sm text-ink/70">No e-mail after a few minutes? Check your spam folder, or try again.</p>
          <Button variant="secondary" className="w-full" onClick={() => setSentTo(null)}>Send again</Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <label className="block text-sm font-semibold">Email
            <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" />
          </label>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending…' : 'Send reset link'}</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-ink/70">Remembered it? <Link className="font-bold text-ogun-600 underline" href="/login">Sign in</Link></p>
    </Card>
  );
}
