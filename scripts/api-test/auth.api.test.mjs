// Password reset, end to end over HTTP, against the real production build and a DISPOSABLE local
// Auth server whose e-mails go to a test-only SMTP sink. Run with `npm run test:api`.
//
// The browser side is emulated with @supabase/ssr and a cookie jar, exactly as the app's browser
// client stores its PKCE code verifier and session; the reset page's own UI is checked separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServerClient } from '@supabase/ssr';

const { APP_URL, SUPABASE_URL, ANON_KEY, MAIL_DIR } = process.env;
assert.ok(APP_URL && SUPABASE_URL && ANON_KEY && MAIL_DIR, 'run through scripts/test-api.sh');
assert.match(SUPABASE_URL, /^http:\/\/127\.0\.0\.1:/, 'tests only ever talk to a local stack');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** `next start -H 127.0.0.1` reports itself as localhost in request.url; both name this same machine. */
const site = (u) => { const x = new URL(u, APP_URL); if (x.hostname === 'localhost') x.hostname = '127.0.0.1'; return x; };
const OLD = 'old-password-123'; const NEW = 'brand-new-password-456';

/** A "browser": a Supabase client whose cookies live in a jar, plus helpers to send that jar to the app. */
function browser() {
  const jar = new Map();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => { for (const { name, value, options } of list) { if (!value || options?.maxAge === 0) jar.delete(name); else jar.set(name, value); } },
    },
  });
  const cookie = () => [...jar].map(([n, v]) => `${n}=${v}`).join('; ');
  /** Store the app's Set-Cookie answers in the jar (what a browser does). */
  const absorb = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim(); const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a.trim()));
      if (!value || expired) jar.delete(name); else jar.set(name, value);
    }
  };
  return { client, jar, cookie, absorb };
}

const mailFiles = () => (fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).filter((f) => f.endsWith('.eml')).sort() : []);
/** Undo quoted-printable soft line breaks and =XX escapes (the reset link is inside an HTML body). */
const unQP = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
async function nextMail(after, to) {
  for (let i = 0; i < 100; i++) {
    const fresh = mailFiles().filter((f) => f > (after ?? ''));
    for (const f of fresh) {
      const text = unQP(fs.readFileSync(path.join(MAIL_DIR, f), 'utf8'));
      if (text.toLowerCase().includes(to.toLowerCase())) return { file: f, text };
    }
    await sleep(100);
  }
  throw new Error(`no e-mail to ${to}`);
}
const resetLink = (text) => {
  const m = text.match(/https?:\/\/[^"'\s<>]+verify\?[^"'\s<>]+/);
  assert.ok(m, 'the e-mail contains a verify link');
  return m[0].replace(/&amp;/g, '&');
};

async function signIn(email, password) {
  const b = browser();
  const { error } = await b.client.auth.signInWithPassword({ email, password });
  return error;
}

let email; let firstLink;

test('set-up: an account with a known password', async () => {
  email = `reset-${Date.now()}@api.test`;
  const b = browser();
  const { error } = await b.client.auth.signUp({ email, password: OLD });
  assert.equal(error, null, error?.message);
  assert.equal(await signIn(email, OLD), null);
});

test('requesting a reset for an unknown e-mail looks the same and sends nothing', async () => {
  const before = mailFiles().at(-1);
  const b = browser();
  const { error } = await b.client.auth.resetPasswordForEmail('nobody-here@api.test', { redirectTo: `${APP_URL}/auth/callback?next=/reset-password` });
  assert.equal(error, null, 'no error, so the answer does not reveal whether an account exists');
  await sleep(1500);
  assert.equal(mailFiles().filter((f) => f > (before ?? '')).length, 0, 'no e-mail was sent');
});

test('full reset: e-mail link -> /auth/callback -> /reset-password signed in -> new password works, old one does not', async () => {
  const b = browser();
  const before = mailFiles().at(-1);
  const { error } = await b.client.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth/callback?next=/reset-password` });
  assert.equal(error, null, error?.message);
  assert.ok([...b.jar.keys()].some((k) => k.endsWith('-code-verifier')), 'PKCE: a one-time code verifier is kept in this browser');

  const mail = await nextMail(before, email);
  firstLink = resetLink(mail.text);
  // The Auth server verifies the token and sends the browser to our callback with a one-time code.
  const verify = await fetch(firstLink, { redirect: 'manual' });
  assert.equal(verify.status, 303, `verify answered ${verify.status}`);
  const toCallback = new URL(verify.headers.get('location'));
  assert.equal(`${toCallback.origin}${toCallback.pathname}`, `${APP_URL}/auth/callback`);
  assert.equal(toCallback.searchParams.get('next'), '/reset-password');
  assert.ok(toCallback.searchParams.get('code'), 'PKCE code present');

  // Our callback exchanges the code (using this browser's verifier) and lands on /reset-password.
  const cb = await fetch(toCallback, { redirect: 'manual', headers: { cookie: b.cookie() } });
  assert.equal(cb.status, 307);
  assert.equal(site(cb.headers.get('location')).href, `${APP_URL}/reset-password`);
  b.absorb(cb);
  const page = await fetch(`${APP_URL}/reset-password`, { headers: { cookie: b.cookie() } });
  assert.equal(page.status, 200);

  // The page's action: set the new password with the session the link created.
  const { data: who } = await b.client.auth.getUser();
  assert.equal(who.user?.email, email, 'the reset link signed in the right account');
  const upd = await b.client.auth.updateUser({ password: NEW });
  assert.equal(upd.error, null, upd.error?.message);

  assert.ok(await signIn(email, OLD), 'the old password no longer works');
  assert.equal(await signIn(email, NEW), null, 'the new password works');
});

test('a reset link works only once: reusing it ends on "forgot password" with a clear message', async () => {
  const again = await fetch(firstLink, { redirect: 'manual' });
  const loc = new URL(again.headers.get('location'));
  // The Auth server reports the error to our callback; our callback sends the player to request a new link.
  const cb = await fetch(loc, { redirect: 'manual' });
  const final = site(cb.headers.get('location') ?? loc.toString());
  assert.equal(final.origin, APP_URL);
  assert.equal(final.pathname, '/forgot-password');
  assert.match(final.searchParams.get('error') ?? '', /^reset-(link-expired|callback)$/);
});

test('a reset link opened in a different browser cannot be used (no code verifier there)', async () => {
  const b = browser();
  const before = mailFiles().at(-1);
  await sleep(1500); // the local Auth server allows one reset e-mail per user per second
  const sent = await b.client.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth/callback?next=/reset-password` });
  assert.equal(sent.error, null, sent.error?.message);
  const link = resetLink((await nextMail(before, email)).text);
  const verify = await fetch(link, { redirect: 'manual' });
  const toCallback = new URL(verify.headers.get('location'));
  const other = browser(); // a different browser: no verifier cookie
  const cb = await fetch(toCallback, { redirect: 'manual', headers: { cookie: other.cookie() } });
  assert.equal(site(cb.headers.get('location')).pathname, '/forgot-password');
  assert.equal(await signIn(email, NEW), null, 'password unchanged');
});

test('the callback never redirects off-site', async () => {
  for (const next of ['//evil.example/x', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)']) {
    const res = await fetch(`${APP_URL}/auth/callback?code=bogus&next=${encodeURIComponent(next)}`, { redirect: 'manual' });
    assert.equal(site(res.headers.get('location')).origin, APP_URL, `next=${next} stayed on this site`);
  }
});

test('the reset page without a reset session only offers a new link (server answers 200, nothing leaks)', async () => {
  const res = await fetch(`${APP_URL}/reset-password`);
  assert.equal(res.status, 200);
  const forgot = await fetch(`${APP_URL}/forgot-password`);
  assert.equal(forgot.status, 200);
});
