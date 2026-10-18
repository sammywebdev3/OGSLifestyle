# OGUN STATE LIFESTYLE

A browser-based **2.5D isometric life simulation** set in Ogun State, Nigeria. Create a character, step out of
your starter apartment in Kuto (Abeokuta), and explore the neighbourhood. This repository is the **Phase 1
foundation**:

- the app shell;
- accounts;
- character creation;
- a playable Phaser prototype;
- a secure data layer that later phases build on.

> Virtual money only — it has no real-world value.

## Tech stack

| Area | Choice |
| --- | --- |
| App | Next.js 15 (App Router) with React 19 and TypeScript (strict) |
| Game | Phaser 3.90, loaded **only in the browser** |
| Styling | Tailwind CSS 3 |
| Backend | Supabase: Auth, Postgres and Row Level Security |
| Hosting | Vercel |

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

You don't need any credentials to run it.

- **Without Supabase credentials**, the app runs in **offline guest mode**. Your character is saved in your browser's
  `localStorage`, and its cash is shown with a **"preview"** label. It is not an authoritative balance.
- **With Supabase credentials** (see below), you get real accounts, and characters are stored server-side.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (what Vercel runs) |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests with Node's built-in runner (validation and isometric maths) |

Node 20.9 or newer is required. `npm test` uses Node's `--experimental-strip-types` flag, which needs **Node 22.6 or newer**.

## Environment variables

Copy `.env.example` to `.env.local` and fill it in. **Never commit `.env.local`**; it is already git-ignored.

| Variable | Where it's used | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Only for online accounts |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server. This is a public key; Row Level Security protects the data. | Only for online accounts |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Reserved for future trusted jobs; Phase 1 does not use it. | No |
| `NEXT_PUBLIC_SITE_URL` | Auth email redirect base (for example `https://your-app.vercel.app`) | Recommended in production |

If these variables are missing, or still hold the placeholder values from `.env.example`, the app detects that and falls back to guest mode. It does not crash.

## Setting up Supabase (online accounts)

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration in the SQL editor: paste the contents of `supabase/migrations/20261018000000_phase1_players.sql`.
   Alternatively, use the Supabase CLI: `supabase db push`.
3. In **Authentication → URL Configuration**:
   - set **Site URL** to your app's URL;
   - add `<your-url>/auth/callback` to the **Redirect URLs**.
4. Put the project URL and the **anon** key in `.env.local`, or in your Vercel project's environment variables.
5. Restart the app. **Sign in** and **Create account** now work, and characters are saved in Postgres.

## Deploying to Vercel

1. Import the GitHub repo in Vercel. It detects Next.js automatically; no `vercel.json` is needed.
2. Add the environment variables above under **Project → Settings → Environment Variables**. Skip them to deploy in guest-only mode.
3. Deploy. `npm run build` must pass, and it does at the time of writing.

## Project structure

```
src/
  app/                      Next.js routes (pages, layouts, API)
    page.tsx                Landing screen
    login/ register/        Auth screens
    create/                 Character creation
    apartment/              Starter apartment (game entry)
    play/                   The Phaser world + HUD
    api/player/route.ts     GET my character · POST create character (server-validated)
    api/health/route.ts     Liveness + whether online accounts are configured (no secrets)
    auth/callback/route.ts  Email-confirmation code exchange
  middleware.ts             Refreshes the Supabase session (no-op in guest mode)
  components/
    brand/                  Logo, isometric SVG kit, landing illustration
    ui/                     Button, Card, Notice, Spinner, PageShell
    auth/ character/ apartment/ player/   Screen components
    game/                   GameScreen, GameCanvas (client-only), Hud, inventory, prompts, touch D-pad
  game/                     Phaser code (browser-only)
    createGame.ts           Entry point — dynamically imports Phaser
    events.ts               Typed event bus between React and Phaser
    iso/isoMath.ts          Pure isometric projection + collision (unit-tested)
    world/starterArea.ts    Map data: tiles, buildings, props, interactables
    render/                 Isometric drawing helpers, buildings & props (placeholder art)
    entities/PlayerAvatar.ts
    scenes/StarterAreaScene.ts
  features/
    player/                 PlayerProvider (React context), API client, guest store
    auth/                   Sign-in / sign-up helpers
  lib/
    supabase/               env detection, browser/server clients, admin (server-only), DB types
    validation/             Shared input validation (client + server)
  server/                   Server-side game services (import 'server-only')
    services/playerService.ts
    mappers/player.ts
  config/game.ts            Game constants (avatar options, items, starter values)
  types/                    Shared TypeScript types (player, inventory, game events)
supabase/migrations/        SQL schema, RLS policies, create_character()
```

## Gameplay prototype

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD or arrow keys. Movement follows the screen: "up" walks up the screen. | On-screen D-pad (phones and tablets) |
| Interact | **E**, Space or Enter, near a glowing ring | The yellow prompt button |
| Inventory | **I** | 🎒 button |
| Back to the apartment | — | 🏠 button, or interact with the apartment door |

- **The map:** a Kuto street corner with Kuto Court (your apartment), Iya Basira Buka, Blessed POS, Mama T Stores,
  an okada park and a notice board.
- **Rendering:** everything is drawn in code as placeholder art. The map data (`src/game/world/starterArea.ts`) is
  separate from the drawing code (`src/game/render/`), so either can be replaced with real tilesets and sprites
  without changing the other.

## Security model (and what is *not* done yet)

- **Server authority.** The browser never decides balances, rewards or ownership.
  - Character creation sends only a name and an avatar. Any other fields, such as `cash`, are ignored.
  - The input is validated in the API route (`src/server/services/playerService.ts`) and again inside the
    database function `create_character()`. That function alone sets the starting cash (₦50,000) and the starter
    items.
- **Row Level Security** is on for every table.
  - Players can **read** only their own rows.
  - There are **no client write policies**, and insert, update and delete privileges are revoked from `anon` and
    `authenticated`.
- **Service-role key.** It is only read in `src/lib/supabase/admin.ts`, which imports `server-only`; the build
  fails if client code imports it. Phase 1 does not use it.
- **Sessions.** Server code validates the session with `auth.getUser()` and never trusts a cookie on its own.
- **Guest mode** data is local and untrusted by design. It is clearly labelled and is never sent to the server as a balance.

**Not yet secure or implemented:**
- There is no economy yet: earning, spending, transfers and trading are all still to come. Those future actions need
  their own transactional, server-side functions and tests before the economy can be called secure.
- Rate limiting, abuse protection and multiplayer authority are Phase 2+ work.
- The SQL migration and RLS policies were written for this phase but **have not been run against a live Supabase
  project from this repository's CI**. Apply them and test with two accounts before relying on them.

## Roadmap — Phase 2 and beyond

- Apply the migration to a real Supabase project, with end-to-end tests covering two users and RLS checks.
- Persist the player's position and location server-side, so you can travel between areas.
- Server-side economy actions (jobs and pay, shops, rent) as transactional database functions, with an audit log.
- Needs and time of day, and interiors you can enter (the apartment as a Phaser scene).
- Multiplayer presence with Supabase Realtime (other players moving around Kuto), plus chat with moderation.
- Real art: an isometric tileset, building sprites and an animated character spritesheet.
- More of Ogun State: Itoku, Panseke, Ibara, Oke-Mosan, then Ijebu-Ode, Sagamu and Ota.
