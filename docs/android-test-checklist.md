# Android device test procedure: character lab

**Status: not yet run on any Android device.** Every number in `docs/character-sprites-test-report.md` and every
`npm run test:lab:perf` result is a **simulation**: headless desktop Chromium with software WebGL and an emulated phone
viewport. Do not report Android results until this procedure has been run on real phones and the results table below
is filled in.

Time needed: about 15 min of setup, then about 45 min per phone.

## What the phones must tell us that the simulation cannot

| Question | Simulated (`test:lab`, `test:lab:perf`) | Real phone |
| --- | --- | --- |
| Right atlas quality for the device's memory; each atlas loaded once; failed atlas recovers; lab inert in a normal build | ✅ tested | confirm the real `deviceMemory` |
| Frame rate with 5 and about 20 characters | relative only (CPU rendering) | **needed** |
| Stalls when atlases arrive or are freed (GPU upload) | ❌ invisible | **needed** |
| Real memory use; tab reloads under memory pressure | estimate only | **needed** |
| Download time on mobile data | ❌ localhost | **needed** |
| How HD and low-memory (SD) look on the actual screen | screenshots | **needed** |
| Heat and throttling over 10 minutes | ❌ | **needed** |

## 0. You need

- **Phones:**
  - one **low-end** Android phone (2–4 GB RAM, e.g. Galaxy A05/A15, Tecno Spark, Infinix Hot, itel);
  - one **mid-range** phone (6–8 GB, e.g. Galaxy A35/A55, Redmi Note 13, Tecno Camon).
- **Software:** both phones on Chrome stable.
- **Computer:** a computer with this branch, Node 20+, desktop Chrome and a USB cable, on the **same Wi-Fi** as the phones.
- **Never use a Vercel Preview URL.** Previews share the production database. Everything here runs on your computer
  in offline guest mode.

## 1. Setup (once)

On the computer, in the repository:

```sh
git checkout feat/character-3d-prototype && npm ci
NEXT_PUBLIC_CHARACTER_LAB=1 NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build
npx next start -H 0.0.0.0 -p 3200
```

Find the computer's LAN address, e.g. `192.168.1.20`:

- macOS: `ipconfig getifaddr en0`
- Linux: `hostname -I`
- Windows: `ipconfig`

Below, `$H` means `http://<that address>:3200`.

On each phone:

1. **Prepare the phone.** Charge above 50%, turn battery saver off, close other apps, and let it cool if it is warm.
2. **Enable debugging.** Settings → About phone → tap *Build number* 7 times. Then Developer options → turn on *USB debugging*.
3. **Connect.** Plug into the computer and accept the prompt. Open desktop Chrome at `chrome://inspect/#devices`.
4. **Open the lab.** In the phone's Chrome, open `$H/play?lab=painted`. If it doesn't load, check the Wi-Fi and the computer's
   firewall for port 3200.
5. **Record the phone's details** in the results table:
   - model, RAM, Android version and Chrome version (`chrome://version` on the phone);
   - `navigator.deviceMemory`: on the computer, click *inspect* on the phone's tab, then type
     `navigator.deviceMemory` in the Console.

Every URL below adds **`&labhud=1`**, which shows a small readout in the top-left corner:

```
fps 58  q sd
drawn 5/5
atlases 4  9.7 MB
loads 4 unloads 0 fail 0
```

- **fps:** frames per second.
- **q:** the atlas quality picked, `hd` or `sd`.
- **drawn:** characters drawn from their atlases, out of all characters.
- **atlases:** character atlases in memory, and their texture size.
- **loads / unloads / fail:** atlas loads, unloads and failed downloads so far.

A phone screenshot (power + volume down) of the readout is the main evidence. The DevTools steps add detail.

## 2. Runs (on each phone)

Before **every** run: close the tab and open the URL in a new tab, so nothing is reused from the previous run.

| Run | URL (after `$H/play?`) | What it compares |
| --- | --- | --- |
| A | `lab=painted&labhud=1` | today's renderer, 5 characters |
| B | `lab=characters&labhud=1` | new renderer, 5 characters, automatic quality |
| C | `lab=characters&labq=sd&labhud=1` | new, forced **low-memory** atlases |
| D | `lab=characters&labq=hd&labhud=1` | new, forced **HD** atlases |
| E | `lab=painted&labn=20&labhud=1` | today's renderer, 21 characters |
| F | `lab=characters&labmix=1&labn=20&labhud=1` | new, 21 characters with layered outfits, automatic quality |
| G | `lab=characters&labmix=1&labcycle=3&labhud=1` | outfit changes every 3 s |
| H | `lab=characters&labmix=1&labhud=1` + the console steps below | off-screen unloading and reloading |
| I | run F again with DevTools → Network → throttling *Slow 4G* | loading on a slow connection |

Runs **A–F**, each phone:

1. Open the URL. With a stopwatch, note two times: when the street appears, and when `drawn` reaches its total (for
   example `5/5`). Placeholders (a soft shadow under a name tag) are allowed until then.
2. Take a **screenshot** of the HUD at rest.
3. Walk with the on-screen pad for 30 s: a square round the street, then past the building corner, so characters go
   behind and in front of it.
4. Note the **lowest and typical fps** shown while walking, and take a second screenshot mid-walk.
5. Optional, for detail: in DevTools → Performance, record 10 s of walking, then *Save profile* as
   `<phone>-<run>.json`.
6. Write down any **glitch**:
   - a character flickering or blinking out;
   - a jump when turning;
   - feet sliding;
   - a character drawn in front of a building it is behind;
   - a body gap or a missing piece of clothing;
   - a placeholder that never resolves.

Run **G** (outfit changes, with **2 minutes** of standing and walking):

- The player's outfit changes every 3 s. It must **never disappear or blink**. The old outfit stays until the new one
  is ready.
- At the end, screenshot the HUD. `fail` must be `0`. `atlases` must not keep growing: it settles once all looks have
  been seen.

Run **H** (off screen and back): in the DevTools Console on the phone's tab, paste:

```js
const sc = __oslLab.scene.scenes[0], cam = sc.cameras.main;
window.__b = cam.getBounds(); cam.stopFollow(); cam.removeBounds();
cam.centerOn(sc.player.container.x + 5000, sc.player.container.y + 5000);   // look away from everyone
```

1. Wait **15 s**, then screenshot the HUD. Expect `unloads` to rise and `atlases` / MB to fall, to only the player's atlas.
2. Then paste:
   ```js
   cam.setBounds(__b.x, __b.y, __b.width, __b.height); cam.startFollow(sc.player.container, true, 0.12, 0.12);
   ```
3. Note how long until `drawn` is back to its total, and screenshot. Every character must come back drawn.
4. In the Network panel, note whether the re-requested atlases came from the cache (*Size* column).

Run **I** (slow network): with *Slow 4G* throttling, the street must appear about as fast as run E. Note the time until
`drawn` is complete.

**Failed downloads**, mid-range phone only: in DevTools → Network, right-click a `zainab-*.webp` request → *Block request URL*.

1. Reload run B. Zainab stays a placeholder and everything else works; `fail` shows ≥ 1.
2. Unblock the request, then do run H's two console steps. Zainab must come back drawn.

**Endurance**, runs B and F only: leave the game running for 10 minutes with occasional walking. Note any fps drop,
heat, or a tab reload.

**Memory**, runs A, B, F and H: on the computer, chrome://inspect → *inspect* → Memory → *Take heap snapshot*. Note the
size. The HUD's MB figure is the character texture estimate.

## 3. Evidence to send back

For each phone:

- [ ] Phone details (model, RAM, Android, Chrome, `deviceMemory`).
- [ ] HUD screenshots: at rest and mid-walk for A–F, the end of G, during and after H, and the end of I.
- [ ] Times to street and to all characters drawn: A–F and I.
- [ ] Typical and lowest fps: A–F.
- [ ] Glitch notes, each with run, direction, character and what happened. Video if possible.
- [ ] Results of the blocked download and the 10-minute endurance runs.
- [ ] Optional: saved Performance profiles and heap snapshot sizes.

Attach traces, screenshots and video to the PR, not to the repository.

## 4. Pass criteria (proposed; to be confirmed after the first run)

- No crash, tab reload, blank character, or placeholder that never resolves.
- **Frame cost:** new-renderer runs hold at least the fps of the matching painted run, minus 10%. That means B, C and D against A,
  and F against E, on both phones.
- **Quality:**
  - the low-end phone picks `sd`;
  - testers can name each outfit at SD at normal zoom;
  - note whether HD looks visibly sharper than SD on the mid-range phone (if not, SD could be used everywhere).
- **Outfit changes (G):** 0 blinks, 0 failures, a bounded `atlases` count.
- **Off screen (H):** memory falls when away, and everyone is drawn again on return.
- **Slow 4G (I):** the street appears as fast as today, and all characters are drawn within 10 s.

## 5. Results

| Date | Phone (model, RAM, Android, Chrome) | `deviceMemory` | Run | Quality | Street s | All drawn s | fps typical / low | Memory | Glitches | Tester |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| – | *not yet tested* | | | | | | | | | |
