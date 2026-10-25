# Development tooling audit and recommendations

Date: 2026-10-25. Scope: the character pipeline, browser testing, performance profiling, documentation lookup and
error monitoring for OGS Lifestyle (Next.js 15.5, React 19, Phaser 3.90, TypeScript 5.9, Blender, GitHub, Vercel,
Supabase). **Status (2026-10-25): items 1a, 1b and 1c are implemented on `feat/character-3d-prototype`, as approved (without
the SessionStart hook); see "Implementation status" at the end. Everything else is still a proposal: nothing else has
been installed, configured, purchased or deployed.**

## 1. What already exists (checked, not assumed)

| Area | Available now | Where | Gap |
| --- | --- | --- | --- |
| GitHub | GitHub MCP server (PRs, CI logs, files) | Claude Code session | No CI workflow in the repo (`.github/workflows` is absent), so nothing runs tests on a push |
| Vercel | Vercel MCP server (deployments, logs, env names) | Claude Code session | – |
| Supabase | Supabase MCP server (SQL, advisors, migrations, logs) | Claude Code session | – |
| Browser automation | Playwright **1.56.1** library + Chromium 1194, preinstalled globally (`/opt/node22/lib/node_modules/playwright`, `/opt/pw-browsers`) | cloud container | Not a project dependency. The milestone harness (`lab2.cjs`) lives in a scratch folder, not the repo. |
| Blender | `bpy` **5.2.3 LTS** (headless Blender as a Python module), Pillow 13, numpy 2.5 | a Python 3.13 venv in the session scratchpad | **Not reproducible.** The venv and the MakeHuman/MPFB2 data clones disappear with the container, and nothing in the repo recreates them. |
| Chrome DevTools | DevTools Protocol, reachable through Playwright (`context.newCDPSession`, tracing) | cloud container | No trace capture is scripted. A real Android phone has never been connected. |
| Docs lookup | Web search/fetch; exact library types in `node_modules` (Phaser's `phaser.d.ts`, Next, Supabase) | session | No version-pinned docs service |
| Error monitoring | none | – | No client or server error reporting in production |
| Lint/format | ESLint and Prettier exist only as global CLIs | container | No project lint config or script |
| Claude Code project config | none (`.mcp.json`, `.claude/settings.json` and hooks absent) | – | Each cloud session starts without the pipeline environment |

No Playwright MCP, Chrome DevTools MCP, Context7, Blender MCP or Sentry is installed. Nothing below duplicates an
existing tool.

## 2. Recommendations by phase

### Phase 1: immediately useful for the character prototype (all free)

#### 1a. Make the Blender pipeline reproducible (requirements file + SessionStart hook)

- **Problem.** Every render in PR #19 depended on a hand-built scratch venv. A new session, or another developer, cannot re-run
  `sprites.py`, which blocks the body-layer fix and future outfits.
- **Proposal.**
  - Add `tools/character-pipeline/requirements.txt`, pinning `bpy==5.2.3`, `Pillow` and `numpy`.
  - Add a `setup.sh` that creates the venv and shallow-clones the CC0 MakeHuman and MPFB2 data at a pinned commit.
  - Optionally add a Claude Code **SessionStart hook** (`.claude/settings.json`) that runs `setup.sh` in cloud sessions.
- **Works with Claude Code.** Yes. Hooks are a built-in Claude Code feature, and the scripts are plain shell and Python.
- **Install and config.**
  - Requires Python 3.13; `bpy` wheels exist only for the Python version Blender pins.
  - About 400 MB of disk for the `bpy` wheel and about 300 MB for the data.
  - The first setup takes 2–4 minutes on a cloud container.
- **Cost.** Free. Blender is GPL; the MakeHuman and MPFB2 assets used are CC0. Rendered sprites are our own output.
- **Permissions.**
  - Needs network access to PyPI and github.com during setup; the current environment already allows both.
  - A hook runs shell commands at session start, so the hook file must be reviewed like code.
- **Risks.**
  - Supply chain: mitigate by pinning exact versions and commits, and optionally pip hashes.
  - No secrets are involved.
- **Verify.**
  1. In a fresh session, `bash tools/character-pipeline/setup.sh`.
  2. `python -c "import bpy; print(bpy.app.version_string)"` prints `5.2.3 LTS`.
  3. `SAMPLES=4 VIEWS=front python turnaround.py -- tunde` renders an image.
  4. `python check_anchors.py` passes on a fresh sprite render.

#### 1b. Playwright as a project dev dependency + committed lab tests

- **Problem.** The atlas-selection, loading, sharing, unloading and screenshot checks exist only as scratch scripts, so they
  cannot be re-run or reviewed.
- **Proposal.**
  - Add `@playwright/test` pinned to **1.56.1**, the version whose browsers are already installed, so nothing extra downloads.
  - Add `tests/lab/*.spec.ts` with desktop and phone projects, plus a `test:lab` script that builds with
    `NEXT_PUBLIC_CHARACTER_LAB=1` and serves the build locally.
  - Add a flag-off spec asserting zero `prototype-characters` requests and no `window.__oslLab`.
  - Capture network failures through `page.on('requestfailed')` and `response.status() >= 400`.
- **Works with Claude Code.** Yes. Claude runs `npx playwright test` and reads the HTML/JSON report and screenshots.
- **Install and config.** `npm i -D @playwright/test@1.56.1` and a `playwright.config.ts`. On machines without the preinstalled
  browser, also run `npx playwright install chromium` (about 150 MB).
- **Cost.** Free (Apache-2.0).
- **Permissions.** Local only. The tests run as a guest against a local build and never touch Supabase production data.
- **Risks.**
  - Low. Never point these tests at a Preview URL that shares the production database with economy-changing actions.
  - The lab specs only walk and look.
- **Verify.** `npm run test:lab` passes, and a deliberately broken atlas URL makes the network-error assertion fail.

> **Playwright MCP (`@playwright/mcp`)** gives Claude interactive control of a browser through accessibility snapshots
> (`claude mcp add playwright -- npx @playwright/mcp@latest --headless --isolated`). It helps explore UI by hand, but it
> **duplicates** what the Playwright library already does here, and Phaser draws to a canvas that accessibility
> snapshots cannot see. **Not recommended now.** Revisit it for DOM-heavy UI work (HUD, phone apps, forms).

#### 1c. Chrome DevTools traces through Playwright, and real-device DevTools for Android

- **Problem.** Simulated runs give frame time and texture estimates, but not GPU texture upload cost, garbage-collection
  pauses or real memory on a phone.
- **Proposal.**
  1. **Simulated:** in the Playwright lab test, capture a Chrome performance trace (`browser.startTracing` with the
     `devtools.timeline` and `disabled-by-default-devtools.timeline.frame` categories). Also record
     `performance.memory` and CDP `Memory.getDOMCounters` / `HeapProfiler` heap size, and save `trace.json`, which
     opens in the DevTools Performance panel.
  2. **Real Android:** use Chrome **remote debugging** (`chrome://inspect` on a desktop, USB debugging on the phone)
     to record the same trace and a memory snapshot on the device. Steps are in `docs/android-test-checklist.md`.
- **Works with Claude Code.**
  - Step 1 runs inside Claude Code.
  - Step 2 needs a person with the phone and a desktop Chrome. Claude can then analyse the exported trace files.
- **Install and config.** None for step 1. For step 2: a USB cable, Developer options plus USB debugging on the phone, and desktop
  Chrome.
- **Cost.** Free.
- **Permissions and risks.**
  - USB debugging gives the connected computer full control of the phone's browser.
  - Use a test phone or test profile, and switch USB debugging off afterwards.
  - Traces can contain URLs and page text, so don't share traces from logged-in production accounts.
- **Verify.** `trace.json` opens in DevTools and shows frames, and the phone appears in `chrome://inspect`.

> **Chrome DevTools MCP (`chrome-devtools-mcp`, official, by the Chrome team)** lets Claude start Chrome, record
> performance traces (`performance_start_trace`/`performance_stop_trace`) and get insight summaries
> (`claude mcp add chrome-devtools -- npx chrome-devtools-mcp@latest`). It needs Node 20.19+/22.12+ and a stable Chrome.
> It is free, but in public preview. It is **useful on a developer's own machine**, where it can drive the real Chrome
> and, through that Chrome, an Android device. In this cloud container it would duplicate Playwright's CDP access.
> **Phase 2, optional, local only.**

### Phase 2: workflow and quality (free)

#### 2a. GitHub Actions CI

- **Problem.** Typecheck, unit tests, build and the flag-off check run only when someone remembers to run them.
- **Proposal.** Add `.github/workflows/ci.yml`:
  - on pull requests: `npm ci`, `npm run typecheck`, `npm test`, `next build` (flag off), the flag-off Playwright spec, and
    `pyflakes` on the pipeline;
  - no secrets needed: the build uses placeholder public env values.
- **Works with Claude Code.** Yes. The GitHub MCP already reads check runs and job logs, so Claude can fix failures.
- **Cost.** Free for public repositories. For private repositories, GitHub's free minutes per month apply. This run is about 4–6 minutes.
  Check the account's Actions usage before enabling it.
- **Permissions.** The workflow token is limited to `contents: read`. It never deploys and never talks to Supabase.
- **Risks.** Do not add production secrets to CI. Pin actions to commit SHAs.
- **Verify.** Open a test PR and see the check go green, then red when a test is deliberately broken.

#### 2b. Context7 (version-specific documentation)

- **Problem.** Phaser 3.90, Next 15.5 and Supabase JS APIs differ by version, and model memory can be stale.
- **Works with Claude Code.** Yes, as an MCP server (`claude mcp add context7 -- npx -y @upstash/context7-mcp --api-key $CONTEXT7_API_KEY`).
  It resolves a library and returns version-specific docs.
- **Cost.**
  - Without a key: a small hourly allowance, suitable only for testing.
  - With a free key: a monthly request cap, reported at about 1,000 requests per month (it was briefly cut to 500 in January 2026).
    Each lookup uses about 2 requests.
  - Paid plans exist. **Confirm on context7.com/plans before relying on it.**
- **Permissions.**
  - An API key, stored in the developer's environment, never in the repo or `.mcp.json` committed with a value.
  - Queries, meaning library names and questions, go to Upstash's servers.
- **Risks.** Low. Don't paste proprietary code into queries.
- **Alternative already available at no cost.**
  - The exact type definitions in `node_modules` (`phaser/types/phaser.d.ts` is authoritative for 3.90).
  - The pinned official docs, fetched on demand.
- **Recommendation.** **Optional.** Add it only if version mismatches cause real mistakes.
- **Verify.** Ask for "Phaser 3.90 `Textures.TextureManager.remove`" and check the answer against `phaser.d.ts`.

#### 2c. Project lint (ESLint flat config + `next lint` replacement)

- **Problem.** There is no lint step. `eslint` exists only globally, at an unpinned version.
- **Proposal.** `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` as dev dependencies, a minimal flat config, and a `lint` script.
- **Cost.** Free. **Risk:** none.
- **Verify.** `npm run lint` is clean in CI.

### Phase 3: before production launch

#### 3a. Sentry (or an equivalent) for error monitoring

- **Problem.** Once real players arrive, client crashes (WebGL context loss, atlas load failures on bad networks) and API
  errors are invisible.
- **Works with Claude Code.**
  - Sentry offers an official MCP server for reading issues and stack traces.
  - The `@sentry/nextjs` SDK instruments the app, with Phaser errors reaching it through the browser SDK.
- **Install and config.**
  - `npx @sentry/wizard -i nextjs` creates the config files.
  - It needs a **DSN**, which is public by design, and a **`SENTRY_AUTH_TOKEN`** for source-map upload. The token is secret
    and goes in Vercel env vars, never in the client.
  - Set `sendDefaultPii: false` and keep tracing and replay sampling low.
- **Cost.**
  - Free single-user "Developer" plan with limited monthly events.
  - Team plan reported at $26/month.
  - **Confirm on sentry.io/pricing. Requires your approval before sign-up.**
- **Permissions.** A Sentry project, Vercel env vars, and source maps uploaded to Sentry.
- **Privacy.**
  - Error events can contain URLs, user agents, IPs and player names. Disable PII, scrub character names and chat text, and mention it in the privacy notice (Nigeria NDPA 2023).
  - Session Replay records the screen; keep it off or mask everything.
- **Alternatives.**
  - Vercel's built-in runtime logs, already reachable through the Vercel MCP, for server errors.
  - A self-hosted GlitchTip, which is Sentry-compatible and free but needs a server.
- **Verify.** A deliberate test error from a **Preview** build appears in Sentry with a readable stack trace and no personal data.

#### 3b. Not recommended

| Tool | Why not now |
| --- | --- |
| **Blender MCP servers** (community projects such as `blender-mcp`) | They let Claude run arbitrary Python inside Blender, mainly for interactive scene editing in a desktop Blender. Our pipeline is already script-driven and headless, which is more repeatable and reviewable. They add an unaudited third-party server with full code execution, and no maintained one offers anything the scripts lack. Revisit only for interactive look-development on a desktop. |
| Playwright MCP | Duplicates the installed Playwright library and cannot see inside the Phaser canvas (see 1b). |
| Paid cloud render farms or GPU services | Faster renders, but they cost money. Propose only when the wardrobe grows (a 4-core CPU takes about 4–19 min per character and about 26 min per layer set). |
| Git LFS for atlases and images | Not needed yet: the 9 atlases are about 5 MB. Reconsider when there are dozens of outfits. LFS bandwidth is metered on GitHub. |

## 3. Proposed order and approvals

| Step | What | Cost | Needs approval for |
| --- | --- | --- | --- |
| 1a | Pipeline `requirements.txt` + `setup.sh` (+ optional SessionStart hook) | free | Adding the hook file. It runs on every cloud session start. |
| 1b | `@playwright/test@1.56.1` + `tests/lab` + `test:lab` script | free | Adding a dev dependency |
| 1c | Trace and memory capture in the lab test; Android checklist | free | – (docs and test code only) |
| 2a | GitHub Actions CI | free (minutes) | Enabling Actions on the repo |
| 2b | Context7 | free tier, metered | Creating an account and key |
| 2c | ESLint config | free | – |
| 3a | Sentry | free tier, paid tiers | Account, DSN and auth token in Vercel, privacy review |

Nothing in phases 1–2 touches production settings, production data, migrations or deployments.

## Implementation status

| Item | Done | Verified |
| --- | --- | --- |
| 1a. Reproducible Blender pipeline | `tools/character-pipeline/requirements.txt` (all packages pinned), `setup.sh` (MakeHuman and MPFB2 pinned to commits), `smoke_test.sh`, `README.md` (disk, time, update procedure). **No SessionStart hook**, as requested. | Fresh folder: setup took 71 s; smoke test passed in 294 s (96 frames, anchors OK, turnaround, atlases). Anchors identical to the committed render. |
| 1b. Playwright tests in the repository | `@playwright/test` **1.56.1**, exact pin, the same version as the preinstalled browsers, so nothing extra is downloaded. `playwright.config.ts`, `tests/lab/*.spec.ts`, `scripts/test-lab.sh`, `npm run test:lab`. | 24/24 lab tests and 1/1 flag-off test passed. The flag-off test fails against a lab build, as it should. |
| 1c. Chrome traces and Android checklist | `tests/lab/perf.spec.ts` (`npm run test:lab:perf`): 8 scenarios, a trace each, `summary.md`. `docs/android-test-checklist.md`. | Traces load as Chrome trace JSON. Numbers are in the test report § 10, labelled simulated. **No Android device tested.** |

## Sources

- Playwright MCP for Claude Code: <https://playwright.dev/mcp/clients/claude-code>, <https://claudelog.com/claude-code-mcps/playwright-mcp>
- Chrome DevTools MCP: <https://claudelog.com/claude-code-mcps/chrome-devtools-mcp>, <https://glama.ai/mcp/servers/@ChromeDevTools/chrome-devtools-mcp>
- Context7 limits: <https://www.mintlify.com/upstash/context7/mcp/configuration>, <https://blog.devgenius.io/context7-quietly-slashed-its-free-tier-by-92-16fa05ddce03>
- Blender MCP servers: <https://github.com/sandraschi/blender-mcp>, <https://glama.ai/mcp/servers/@cwahlfeldt/blender-mcp>
- Sentry pricing and MCP (third-party summaries, to confirm on sentry.io): <https://aitoolsatlas.ai/tools/sentry-mcp/pricing>, <https://mcpservers.org/pt-BR/servers/getsentry/sentry-mcp>
