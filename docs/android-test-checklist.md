# Android test checklist: character lab

**Status: not yet run on any Android device.** Every number in `docs/character-sprites-test-report.md` and every
`npm run test:lab:perf` result is a **simulation**: headless desktop Chromium with software WebGL. Phone viewport, pixel
ratio, touch and `navigator.deviceMemory` are emulated, but CPU, GPU, memory limits, thermal behaviour and network
are the host's. Do not report Android results until this checklist has been run on a real phone and its results
recorded below.

## Simulated vs real: what each can tell us

| Question | Simulated browser (`test:lab`, `test:lab:perf`) | Real Android |
| --- | --- | --- |
| Is the right atlas quality picked for a given `deviceMemory`? | ✅ tested | confirm: the real `deviceMemory` value |
| Is each atlas loaded once and shared? Does a failed atlas break the game? | ✅ tested | – |
| Is the lab inert in a normal build? | ✅ tested | – |
| Frame time and fps | relative only (SwiftShader runs on the CPU) | **needed** |
| GPU texture upload stalls when atlases arrive | ❌ not visible | **needed** |
| Real memory use, tab reloads under memory pressure | estimate only (texture size × 4 bytes) | **needed** |
| Download time on mobile networks | ❌ localhost | **needed** (or throttled) |
| How SD and HD look on the actual screen | screenshots at DPR 2 | **needed** |
| Heat and throttling over 10+ minutes | ❌ | **needed** |

## Devices

Test at least one of each. Record the exact model, Android version, Chrome version and RAM.

| Tier | Examples | RAM | Expected atlas |
| --- | --- | --- | --- |
| Low end | Samsung Galaxy A05/A15, Tecno Spark, Infinix Hot, itel | 2–4 GB | SD (`deviceMemory` ≤ 4) |
| Mid range | Samsung Galaxy A35/A55, Redmi Note 13, Tecno Camon | 6–8 GB | HD |

Chrome reports `navigator.deviceMemory` rounded to 0.25/0.5/1/2/4/8. A 6 GB phone usually reports 4 GB and gets SD. Record the value.

## Setup (one time, about 15 minutes)

1. **Build the lab version on a computer** on the same Wi-Fi as the phone:
   ```sh
   NEXT_PUBLIC_CHARACTER_LAB=1 npm run build
   npx next start -H 0.0.0.0 -p 3200
   ```
   The phone opens `http://<computer-LAN-IP>:3200/play?lab=characters`.
   - Leave Supabase unset: guest mode, no production data.
   - **Do not use a Vercel Preview URL.** Previews share the production database.
2. **Phone settings:**
   1. Enable Developer options (Settings → About phone → tap *Build number* 7 times).
   2. Turn on *USB debugging*.
   3. Use Chrome stable, and close other apps.
3. **Remote DevTools:** connect the phone by USB, open `chrome://inspect/#devices` in desktop Chrome, accept the prompt on
   the phone, then click *inspect* on the lab tab.
4. Charge the phone above 50%, turn battery saver off, and let it cool if it is warm.

## Test runs

Run each URL on each phone. Before each run, close the tab and open a new one.

| # | URL (append to `http://<ip>:3200`) | What it checks |
| --- | --- | --- |
| A | `/play?lab=painted` | baseline: today's characters |
| B | `/play?lab=characters` | 3D, automatic quality |
| C | `/play?lab=characters&labq=sd` | low-memory atlases |
| D | `/play?lab=characters&labq=hd` | HD on this phone |
| E | `/play?lab=characters&labmix=1&labn=20` | 21 characters, layered looks |
| F | `/play?lab=painted&labn=20` | 21 painted characters (baseline for E) |

For each run, record:

1. **Quality picked:** in the remote console, `navigator.deviceMemory`, and which `-hd`/`-sd` files load in the Network panel.
2. **Load:**
   - the time until the world is visible;
   - the time until every character is drawn instead of a placeholder shadow (Network panel: the last atlas finishes).
3. **Frame rate:**
   1. In DevTools → Performance, record 10 s while walking in a square.
   2. Note the average fps, the number of long tasks and any frames over 50 ms.
   3. Save the trace (*Save profile*) as `android-<phone>-<run>.json`.
4. **Memory:**
   - DevTools → Memory → *Take heap snapshot* size;
   - Android Settings → Developer options → *Running services* / *Memory* for Chrome's total use after 2 minutes.
5. **Network:** repeat B and E with DevTools network throttling set to *Fast 4G* and then *Slow 4G*. Record the time until all
   characters are drawn. The world itself must not wait.
6. **Visual:**
   - Screenshots at normal zoom (power + volume down).
   - Are the outfits recognisable at SD?
   - Any flicker, jumps when turning, or characters drawn in front of buildings they are behind?
7. **Endurance (B and E only):** play for 10 minutes. Did fps drop, did the phone get hot, did the tab reload?

## Pass criteria (proposed; to be confirmed after the first run)

- No crash, reload or blank characters in any run. Placeholders may show for a few seconds while atlases load.
- **Frame cost:**
  - Low end: runs B and C hold at least the fps of run A, minus 10%.
  - Mid range: run E holds at least the fps of run F, minus 10%.
- **Memory:** run B on the low-end phone adds no more than about 15 MB over run A (SD).
- **Load:** on *Slow 4G*, all characters are drawn within 10 s and the world within the same time as today.
- **Visual:** testers can name each character's outfit at SD on the low-end phone.

## Results

| Date | Phone (model, RAM, Android, Chrome) | `deviceMemory` | Run | Quality | World ms | All characters ms | fps | Long tasks | Memory | Notes | Tester |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| – | *not yet tested* | | | | | | | | | | |

Attach the saved traces and screenshots to the PR or issue, not to the repository.
