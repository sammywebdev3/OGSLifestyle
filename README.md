# OGS Lifestyle — Eko to the Gateway 🇳🇬

A life simulator set in **Ogun State, Nigeria**. Inspired by Lagos-style life sims, but you play on a
**real map**. You're born in an Ogun town, go through primary and secondary school, write WAEC and JAMB,
get into a university, polytechnic or college of education, serve with NYSC, build a career, marry,
buy land and maybe japa.

## Play

There's no build step. It's plain HTML, CSS and JavaScript.

```bash
npm start            # or: python3 -m http.server 8080
# open http://localhost:8080
```

You can also open `index.html` directly, or host the folder on GitHub Pages
(Settings → Pages → deploy from branch).
The map and live data need an internet connection.

## 🔥 Hustle Mode: "Eko to the Gateway" (MVP)

*"From Sapa to Stardom in the Gateway State."* You've just moved from your village to Abeokuta with
**₦50,000** and a 1-room self-contain. Your goal is to become the biggest name in Ogun State.
Each day runs **morning → hustle → evening → lifestyle**.

- **3 hustles:**
  - **Adire seller:** buy at Itoku and sell around Kuto/Panseke. You can also carry stock to Lagos
    for the best price, but watch for LASTMA. Prices change every day.
  - **Okada rider:** hire a bike (₦3,000 daily balance) or buy your own. Rush hours pay best.
    TRACE stops you, potholes throw you off.
  - **Influencer:** shoot content at Olumo Rock or skits in your area, sell adire online, and get
    brand deals every Saturday from 1,000 followers.
- **Watch ad to double hustle:** once a day, a 5-second sponsor ad doubles your last hustle income.
- **Sapa meter:** when money is low you trek instead of riding, clubs turn you away, and your
  partner "bills" you.
- **Weekly rent:** rent is due every Saturday. Miss it twice and the landlord **locks you out**:
  you sleep at the motor park until you pay the arrears.
- **TRACE / LASTMA stops:** bribe, run, or take the fine. They can impound your bike.
- **Family pressure:** on Sundays your family back home calls: *"When will you build house?"*
  Send money or your morale drops.
- **Saturday Owambe:** spray money for clout and followers and a chance at big contracts. Skip it
  and you lose clout. You'll need aso-oke to look the part.
- **Festivals:** the Egungun chase in Abeokuta, and the Ojude Oba mission to sell adire to the
  Ijebu-Ode crowd.
- **Level up:** Clout + Money = your level, in 14 ranks from *JJC (Johnny Just Come)* to *Ogun State
  legend*.
  - The 4 map zones open with your level: **Abeokuta** (capital, open from the start),
    **Ijebu** (luxury, level 5), **Sagamu/Remo** (industry, level 7) and **Ota/Agbara**
    (hustle, level 9).
- **Spend to level up:**
  - Food: ofada rice & ayamase, lafun, ikokore.
  - Drip: adire, Anago, corporate, aso-oke.
  - House: face-me-I-face-you → self-contain → **duplex in Ibara GRA**.
  - Ride: Benz.
  - Land in Obafemi-Owode (₦2M), then **build your house** (₦10M).
- **Transport:** trek, keke, okada, danfo, your own bike or car, or call an Uber/Bolt.

### 🌆 2D Abeokuta (open world)

In Hustle Mode the **Abeokuta** tab is a walkable top-down pixel-art town built with
[Phaser 3](https://phaser.io), which loads only when you open the tab.

- **Art:** every tile, character, building and vehicle is **drawn in code** (`js/world.js`), so there
  are no image files and the download stays tiny. It includes yellow danfos, kekes, okadas, palm
  trees, Olumo Rock, adire stalls, the motor park, a mosque, a church, an owambe hall, the TRACE
  office and ad billboards.
- **Controls:** walk with the on-screen joystick (or arrow keys / WASD). Stand at a door and tap the
  prompt (or press **E**) to use that place. For example, Itoku sells adire, the buka sells food,
  the okada park rents bikes, the motor park goes to Lagos, Olumo Rock is for content and your room
  is for sleeping.
- **Your character:** wears whatever drip you've bought: adire, Anago, corporate or aso-oke.
- **Life on the streets:** traders, area boys and TRACE officers walk around and talk to you, and
  traffic honks when you stand in the road. The town darkens at night.
- **Better art later:** a hired artist can replace the drawing functions with real sprite sheets
  without touching the game rules.

### 🧱 3D test street

The Abeokuta tab has a **2D / 3D** switch, with 3D as the default. The 3D view is a test street
built with [Three.js](https://threejs.org) (`js/world3d.js`), loaded only when you open it:

- **Lighting:** a real sky and sun that follow the game clock (sunrise ~6:24, golden hour, sunset
  ~18:48), soft shadows, reflections from the sky, street lights and window glow at night, and
  stars.
- **Textures** are all generated in code:
  - plastered walls with red-earth splash and rain streaks, rusty corrugated zinc, cracked
    asphalt with potholes, laterite, concrete;
  - adire and ankara cloth, palm fronds, granite.
- **Scenery:** your compound (GOD'S GRACE VILLA), Iya Basira buka with smoking pots, a storey
  building with a game centre and balcony, a mosque with a dome and minaret, a billboard, Itoku
  adire market, Kuto Motor Park with danfos, open gutters with slab crossings, power poles with
  sagging wires, and Olumo Rock behind the town.
- **Life:** a danfo ("No Condition Is Permanent"), a keke and an okada drive by. A trader walks with
  a basin on her head, and a TRACE officer watches you.
- **Controls:** joystick or WASD to walk, and drag to turn the camera. Doors open the same action
  sheet as the 2D town.

### Monetization hooks (not live yet)

- **Ads Board** (`js/adboard.js`): billboards appear on the map, in ad breaks and on the Today
  screen. Each ad runs from a start date to an end date, so a paid slot has a minimum run time.
  The entries in the file are **samples**. A live version needs a small backend where businesses
  book and pay for slots.
- **Store** (`js/store.js`): Ise Owo Pack (₦500 → ₦200k), Remove Ads (₦1,000). Purchases go through
  an `OGS.Payments` adapter, such as Google Play Billing in the Android build or
  Paystack/Flutterwave on the web. **None is connected yet, so nothing can be charged.**
- **Rewarded ads:** the "double hustle" ad is simulated with sponsor billboards. In the Android
  build you'd swap in AdMob rewarded ads.

### Android

The game is an installable **PWA**: it has a manifest, icons and an offline service worker, and
the whole app is well under 1 MB. On Android, open it in Chrome and tap **Add to Home screen**.
There are two ways to get it into the Play Store:

- Wrap it as a Trusted Web Activity (e.g. with Bubblewrap).
- Wrap it with Capacitor (needed for AdMob and Play Billing).

The design doc's Unity 3D / low-poly version would be a separate rebuild. The game rules here
(`js/hustle.js`, `js/life.js`) can be its spec, and their tests can be its test cases.

## How it plays

Like *Lagos Life*, you live **day by day** on a ticking clock. Press **▶** to start time and pick
1×, 3× or 10× speed. You keep five needs up: **hunger, energy, hygiene, fun and social**. Do that by
eating mama's food, amala at a buka or bread and akara, bathing, sleeping, going to school or work,
gisting at the junction, watching football at a viewing centre, clubbing and more. Pay arrives every
**Saturday**, and so do rent and bills. A year is 28 days (4 weeks). When it ends you have a birthday,
and the life-sim side moves on: school years, WAEC/JAMB, promotions, ageing and family.

- **🤖 Auto-routine:** when it's on, your character eats, sleeps and goes to school or work by
  themself, and you can still take over at any time. **⏭ Day** and **🎂 Year** fast-forward until
  something needs you.
- **Street encounters:** random moments interrupt the day and you choose how to react. They include
  police checkpoints, area boys, "one chance" buses, a wrong ₦250k transfer, a prophecy and a "seed",
  job leads, a crush at the bus stop, going viral, a "sure banker" bet, a fake iPhone at Sango,
  lecturers' "sorting", school bullies, OTP scammers, quit notices, kidnap threats, lotto and more.
- **Born into anything:** pick your start or let fate decide.
  - **Poor:** a face-me-I-face-you room.
  - **Middle-class.**
  - **Comfortable.**
  - **Rich:** a nepo baby.
  - **Politician's child:** your parent is a Senator, Commissioner or LG Chairman. Once a year
    "Daddy" can make a call to get you a job or out of a police cell. You also get kidnapping threats
    and EFCC wahala.
- **Crime & prison:**
  - 10 crimes, from shoplifting to armed robbery, each with its own payout and arrest risk.
    **Police heat** rises with every job.
  - When you're arrested, you can "settle" the officers, hire a lawyer, take legal aid, run, or call
    Daddy.
  - In court, you can plead guilty, fight the charge, or try to bribe the judge.
  - Sentences are served in real Ogun custodial centres (Ibara in Abeokuta, Ilaro, Ijebu-Ode,
    Sagamu). Prison life has its own day: workshop work (you can learn tailoring), NOUN study,
    fellowship, cell gangs, phone bribes, parole, escape attempts, jailbreak plots and the
    Governor's pardon.
  - Escapees become **wanted fugitives**.
- **Politics:**
  - Join a party (fictional ones, to stay neutral), or decamp to another.
  - Buy a nomination form and win a primary, by "settling" the delegates or on popularity.
  - Campaign with rallies, rice palliatives, door-to-door visits, OGBC radio interviews, thugs or a
    godfather.
  - Win local or general elections, all the way up to **Governor of Ogun State**.
  - In office, you choose whether to build projects or pocket the allowance. The EFCC, election
    tribunals and impeachments can follow.

## Deploy on Vercel (free)

It's a static site, so there's no build step and no server.

1. Push this repo to GitHub. It's already there.
2. Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub and **Import** the
   `OGSLifestyle` repo.
3. Use these project settings:
   - **Framework Preset:** *Other*
   - **Build Command:** leave empty
   - **Output Directory:** leave empty (Vercel serves the repo root)
   - **Install Command:** leave empty
4. Click **Deploy**. You'll get a URL like `https://ogs-lifestyle.vercel.app`.

From then on, every push to `main` redeploys automatically, and every pull request gets its own
preview URL. `vercel.json` stops the service worker and scripts from being cached for too long,
so updates reach players quickly. HTTPS is automatic, so players can install the game on Android
with **Add to Home screen**.

Alternatively, you can deploy from the command line with `npm i -g vercel && vercel` in the project folder.

## Features

- **Real map**: Leaflet with OpenStreetMap tiles and the real Ogun State boundary.
  - Markers for 28 towns across all 20 LGAs, plus universities, polytechnics, colleges, secondary
    schools, hospitals, landmarks, markets, places of worship and workplaces.
  - **📡 Live OSM places**: zoom into any town and load every school, nursery, college, hospital,
    clinic, market, bank, filling station, church/mosque, hotel and attraction that OpenStreetMap
    has in view (Overpass API).
  - **Search** for any place in Ogun State (Nominatim).
- **Education**:
  - Primary school, then the Common Entrance exam. Pass it well and you can get into unity schools
    (FGC Odogbolu, FGGC Sagamu, Navy School Abeokuta), or pick schools like Abeokuta Grammar
    School, Mayflower Ikenne or Remo Secondary School.
  - WAEC credits and a JAMB score out of 400. You can rewrite JAMB or resit WAEC through NECO/GCE.
  - **25 tertiary institutions**:
    - Universities: FUNAAB, OOU, TASUED, MAUSTECH, Covenant, Babcock, Bells, Crescent, Crawford,
      Mountain Top, Chrisland, McPherson, Hallmark, Christopher and Southwestern.
    - Polytechnics: Fed Poly Ilaro, GAPOSA, D.S. Adegbenro, Abraham Adesanya, OGITECH, RECTEM and
      Allover Central.
    - Colleges: FCE Osiele, TASCE and the Ogun College of Health Technology.
  - Each institution has its own courses, cut-offs and fees. You can go on to HND or M.Sc,
    ASUU/ASUP strikes can extend your programme, and you graduate with a CGPA and degree class.
- **NYSC**: a call-up to a random state, with the option to try redeploying to Ogun. Many graduate
  jobs ask for your discharge certificate.
- **Careers**: 37 jobs, from okada rider, adire dyer and Idiroko trader to plant engineer at the
  cement plants, doctor, lawyer (Law School required), lecturer and civil servant at Oke-Mosan.
  Jobs have promotions, raises, getting sacked, commuting costs and retirement.
- **Life**:
  - Relationships: dating, proposals, owambe weddings, children and divorce.
  - Assets: phones, generators, cars, land in Mowe, houses that bring in rent.
  - Housing: rent costs differ by town.
  - Trips: travel by danfo, keke, okada, ride-hailing or your own car.
- **Events with choices**: NEPA outages, IBEDC estimated bills, fuel scarcity, aso-ebi, floods,
  malaria, WAEC "expo", campus cults, yahoo-yahoo (watch out for EFCC), omo onile, Ponzi schemes,
  Ojude Oba, the Lisabi and Agemo festivals, black tax and more.
- **Saving**: the game autosaves in your browser. You can also export or import save files.
  Runs are deterministic, because the random seed is stored in the save.

## Project layout

| File | Purpose |
| --- | --- |
| `js/data.js` | Towns, LGAs, institutions, schools, places, jobs, assets, names |
| `js/engine.js` | Core life-sim rules (years, school, jobs, family, events). Pure functions with no DOM |
| `js/life.js` | Daily clock, needs, actions, auto-routine, weekly pay/rent, street encounters |
| `js/society.js` | Crime, police, courts, prison life, connections, parties and elections |
| `js/hustle.js` | Hustle Mode: 3 hustles, sapa, clout & levels, rent lock-out, TRACE, owambe, zones |
| `js/world.js` | 2D walkable Abeokuta (Phaser 3), with all pixel art drawn in code |
| `js/world3d.js` | 3D test street (Three.js), with procedural textures and a real-time sky, sun and shadows |
| `js/adboard.js`, `js/store.js` | Sponsor billboards and the store (payments adapter hook) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable, offline-capable PWA |
| `js/map.js` | Leaflet map, live OSM layer and search |
| `js/ui.js` | Rendering and input handling |
| `tests/` | Engine tests (`npm test`, Node 18+) |

## Data accuracy

Coordinates for the built-in locations are **approximate** (usually within 1–3 km). The *Live OSM*
layer always shows exact, up-to-date positions. Fees and salaries are rough 2025/26 Naira figures,
tuned for gameplay. To add or correct a school, town or job, edit `js/data.js`. `npm test`
checks that every reference still points at something real.

Map data © OpenStreetMap contributors.
