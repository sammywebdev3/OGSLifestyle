import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicSupabaseEnv } from './env.ts';

const KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
  const saved = KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, values);
  try { fn(); } finally { for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

test('not configured without values or with .env.example placeholders', () => {
  withEnv({}, () => assert.equal(getPublicSupabaseEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://your-project-ref.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'your-publishable-key' }, () => assert.equal(getPublicSupabaseEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' }, () => assert.equal(getPublicSupabaseEnv(), null));
});

test('publishable key is preferred, anon key still works', () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy' },
    () => assert.deepEqual(getPublicSupabaseEnv(), { url: 'https://abc.supabase.co', publicKey: 'sb_publishable_x' }));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon' },
    () => assert.equal(getPublicSupabaseEnv()?.publicKey, 'legacy-anon'));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'your-publishable-key', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon' },
    () => assert.equal(getPublicSupabaseEnv()?.publicKey, 'legacy-anon'));
});

test('rejects malformed or non-https URLs (except localhost)', () => {
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'not a url', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' }, () => assert.equal(getPublicSupabaseEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://abc.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' }, () => assert.equal(getPublicSupabaseEnv(), null));
  withEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' }, () => assert.notEqual(getPublicSupabaseEnv(), null));
});
