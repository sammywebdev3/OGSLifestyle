'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { Spinner } from '@/components/ui/Spinner';
import { updatePassword } from '@/features/auth/auth';
import { getBrowserSupabase } from '@/lib/supabase/client';
import { PASSWORD_MIN, validateNewPassword } from '@/lib/validation/password';

/**
 * Choose a new password. The reset link (via /auth/callback) has already signed
 * the player in; without that session this page only offers a new link.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const [session, setSession] = useState<'checking' | 'yes' | 'no'>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) { setSession('no'); return; }
    // getUser() asks Supabase Auth, so an expired or revoked session counts as none.
    void supabase.auth.getUser().then(({ data }) => setSession(data.user ? 'yes' : 'no'));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password') ?? '');
    const check = validateNewPassword(password, String(fd.get('confirm') ?? ''));
    setError(null);
    if (!check.ok) return setError(check.error);
    setBusy(true);
    const result = await updatePassword(password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setDone(true);
  }

  if (session === 'checking') return <Spinner label="Checking your reset link…" />;
  if (session === 'no') {
    return (
      <Card>
        <h1 className="font-display text-2xl font-black">Reset link needed</h1>
        <div className="mt-4"><Notice tone="warn">This page only works from a password-reset link, opened in the browser that asked for it. The link may have expired or already been used.</Notice></div>
        <ButtonLink href="/forgot-password" className="mt-5 w-full">Send a new reset link</ButtonLink>
      </Card>
    );
  }
  if (done) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-black">Password changed</h1>
        <div className="mt-4"><Notice tone="success">Your new password is saved. You&apos;re signed in.</Notice></div>
        <Button className="mt-5 w-full" onClick={() => router.push('/apartment')}>Continue to the game</Button>
      </Card>
    );
  }
  return (
    <Card>
      <h1 className="font-display text-2xl font-black">Choose a new password</h1>
      <p className="mt-1 text-sm text-ink/70">At least {PASSWORD_MIN} characters.</p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <label className="block text-sm font-semibold">New password
          <input name="password" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" />
        </label>
        <label className="block text-sm font-semibold">Type it again
          <input name="confirm" type="password" required minLength={PASSWORD_MIN} autoComplete="new-password" className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" />
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save new password'}</Button>
      </form>
      <p className="mt-4 text-center text-sm"><Link className="text-ink/60 underline" href="/login">Back to sign in</Link></p>
    </Card>
  );
}
