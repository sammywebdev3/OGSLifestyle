'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { signIn, signUp } from '@/features/auth/auth';
import { usePlayer } from '@/features/player/PlayerProvider';
import { AUTH_ERROR_MESSAGES, codeFromSupabaseError, type AuthErrorCode } from '@/features/auth/authErrors';
import { Spinner } from '@/components/ui/Spinner';

type Mode = 'login' | 'register';

export function AuthForm({ mode, errorCode = null }: { mode: Mode; errorCode?: AuthErrorCode | null }) {
  const router = useRouter();
  const { onlineAvailable, refresh, status, mode: playerMode } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorCode ? AUTH_ERROR_MESSAGES[errorCode] : null);
  const [info, setInfo] = useState<string | null>(null);

  // Some Supabase redirects put the error in the URL hash, which the server never sees.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = codeFromSupabaseError(hash.get('error_code'), hash.get('error'));
    if (code) setError(AUTH_ERROR_MESSAGES[code]);
  }, []);

  // Already signed in online? Go straight on. (Guests may still sign in here.)
  const signedInOnline = playerMode === 'online' && (status === 'ready' || status === 'no-character');
  useEffect(() => {
    if (signedInOnline) router.replace(status === 'ready' ? '/apartment' : '/create');
  }, [signedInOnline, status, router]);
  if (signedInOnline) return <Spinner label="You're already signed in…" />;

  if (!onlineAvailable) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-black">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}
        <div className="mt-4"><Notice tone="warn">Online accounts aren&apos;t set up on this server yet (Supabase isn&apos;t configured). You can still try the game as a guest — your progress stays in this browser only.</Notice></div>
        <ButtonLink href="/create?mode=guest" variant="primary" className="mt-5 w-full">Play as guest</ButtonLink>
      </Card>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    setError(null); setInfo(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    const result = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    if (result.needsConfirmation) return setInfo('Check your email to confirm your account, then come back and sign in.');
    await refresh();
    router.push(mode === 'login' ? '/apartment' : '/create');
  }

  return (
    <Card>
      <h1 className="font-display text-2xl font-black">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="mt-1 text-sm text-ink/70">{mode === 'login' ? 'Sign in to continue your life in Abeokuta.' : 'One account, one character, one life in Ogun State.'}</p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
        <label className="block text-sm font-semibold">Email
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" />
        </label>
        <label className="block text-sm font-semibold">Password
          <input name="password" type="password" required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-base outline-none focus:border-ogun-500 focus:ring-2 focus:ring-ogun-500/30" />
        </label>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {info ? <Notice tone="success">{info}</Notice> : null}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <p className="mt-4 text-center text-sm text-ink/70">
        {mode === 'login' ? <>New here? <Link className="font-bold text-ogun-600 underline" href="/register">Create an account</Link></> : <>Already have an account? <Link className="font-bold text-ogun-600 underline" href="/login">Sign in</Link></>}
      </p>
      <p className="mt-2 text-center text-sm"><Link className="text-ink/60 underline" href="/create?mode=guest">or try as a guest</Link></p>
    </Card>
  );
}
