# Live authentication test plan

Manual checks for the live site (`https://ogslifestyle.vercel.app`) against the live Supabase project, after the
dashboard settings and Vercel variables are in place and the code is deployed. Nothing here changes the database
schema. The SQL in step 9 runs inside `begin; … rollback;` and only reads.

Record each step as pass or fail with a screenshot. Live authentication counts as tested only once every step
passes.

## 0. Before you start

- **Supabase → Authentication → URL Configuration:**
  - Site URL `https://ogslifestyle.vercel.app`.
  - Redirect URLs `https://ogslifestyle.vercel.app/**` and `http://localhost:3000/**`.
  - Optionally add your preview pattern (see README).
- **Supabase → Authentication → Sign In / Providers → Email:**
  - **Confirm email ON.** Don't turn it off to make testing easier.
- **Email delivery:**
  - Supabase's built-in sender has a very low hourly limit and may only deliver to your Supabase organisation's
    team members.
  - For the two-account test (step 8), either set up custom SMTP (Authentication → Emails → SMTP Settings) or invite
    the second address to your Supabase organisation.
- **Vercel deployment:**
  - Open `https://ogslifestyle.vercel.app/api/health`. It must show `"onlineAccounts":true`.
  - If it shows `false`, the deployment was built before the variables were set: redeploy.
- **Browser:** use one normal browser, such as Chrome on your phone, not a private tab. Open the confirmation email
  link **in that same browser**. The sign-in flow (PKCE) keeps a one-time code in the browser that started the
  sign-up.

## 1. Registration

1. Open the site and tap **Play now**. You should land on **Create your account**.
2. Enter email A and a password of 8 or more characters, then tap **Create account**.
3. **Expected:** a green message: "Check your email to confirm your account, then come back and sign in."
4. **Supabase → Authentication → Users:** user A is listed as *waiting for verification* / not confirmed.

## 2. Email confirmation

1. Open the confirmation email. The link should point to `…supabase.co/auth/v1/verify…`.
2. Tap it in the same browser.
3. **Expected:** you land on `https://ogslifestyle.vercel.app/create`, signed in. You do **not** land on the homepage
   or a "This page doesn't exist" page.
4. **Supabase → Users:** user A now shows a *confirmed* date.

Failure cases, so you know what you're looking at:

- **Landed on the homepage instead of `/create`:** the redirect URL isn't allowed. Check the `/**` entries.
- **"We couldn't confirm that sign-in link":** the link was usually opened in a different browser. The email is
  still confirmed, so sign in normally.
- **"That link has expired or was already used":** the expected result when you tap the same link twice.

## 3. Character creation and starting balance

1. On `/create`, pick a name (3–20 letters; Yoruba names such as `Adéṣọlá` are allowed) and choose an avatar.
2. Confirm.
3. **Expected:**
   - You arrive at the apartment.
   - The cash badge shows **₦50,000**, with **no** "preview" label.
   - The inventory holds a basic phone ×1, an apartment key ×1 and water sachets ×3.
4. **Invalid name test:** before confirming, try `Ade123` or `<b>`. **Expected:** the form refuses it.

## 4. Duplicate character prevention

1. While signed in as A with a character, open `https://ogslifestyle.vercel.app/create` directly.
2. **Expected:** you're sent straight back to the apartment, and no second creation form is accepted.
3. The server enforces this too: the database allows one character per account (verified in `npm run test:db`).

## 5. Session persistence

1. On the apartment page, reload the page (pull down to refresh).
2. **Expected:** still signed in, same character, still ₦50,000.
3. Close the browser completely, reopen the site, and tap **Continue as <name>**. **Expected:** still signed in.

## 6. Logout

1. In the apartment, tap **Sign out**.
2. **Expected:** you return to the landing page, with **Play now** and **Try as guest** showing.
3. Open `/apartment` directly. **Expected:** you're sent to sign in, and A's character isn't shown.

## 7. Login

1. Tap **Play now**, then **Sign in**. Enter A's email and a **wrong** password.
2. **Expected:** an error, and you're not signed in.
3. Now use the correct password. **Expected:** you return to A's character with ₦50,000.

## 8. Two accounts and cross-user isolation

1. Sign out. Register **email B** (steps 1–3) and create a different character, B.
2. **Expected:** B sees only B's name and ₦50,000, with nothing of A's.
3. Sign out of B and sign in as A. **Expected:** A's character, unchanged.

## 9. Database-level isolation check (read-only, optional but recommended)

1. **Supabase → Authentication → Users:** copy the **User UID** of A and of B. A UID is an identifier, not a secret.
2. In **SQL Editor**, run this, replacing the UID with A's:

```sql
begin;
set local role authenticated;
-- auth.uid() reads one of these two settings depending on the project's version, so set both.
select set_config('request.jwt.claim.sub', u, true),
       set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
  from (select 'PASTE-USER-A-UID-HERE'::text as u) as who;
select character_name, cash, location from public.players;   -- expected: ONLY A's row
select count(*) from public.inventories;                      -- expected: 1
select count(*) from public.inventory_items;                  -- expected: 3
rollback;
```

3. Run it again with B's UID. **Expected:** only B's row.
4. As `postgres` (no `set role`), `select count(*) from public.players;` should show 2. The isolation comes from
   Row Level Security, not from missing data.
5. Run `supabase/verify/phase1_live_check.sql` again. **Expected:** all checks `true`, and row 15 shows
   `players=2 inventories=2 inventory_items=6`.

## 10. Guest mode

1. In a **private/incognito** tab, open the site and tap **Try as guest**.
2. Create a character.
3. **Expected:**
   - The cash badge shows ₦50,000 with a **preview** label.
   - Nothing new appears in Supabase (the player count stays the same).
4. Reload. **Expected:** the guest character is still there; it's stored in this browser only.
5. In the apartment, tap **Delete guest & start over** and confirm. **Expected:** you're back at the start.

## Afterwards

- The test accounts can stay, or you can delete them in **Authentication → Users**. Deleting a user also deletes
  their character, because of the database's `on delete cascade`.
- Before opening registration to the public:
  - set up custom SMTP;
  - review **Authentication → Rate Limits**.
