# OGS Lifestyle 🇳🇬

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
| `js/engine.js` | Game rules. Pure functions with no DOM, so they also run in Node |
| `js/map.js` | Leaflet map, live OSM layer and search |
| `js/ui.js` | Rendering and input handling |
| `tests/` | Engine tests (`npm test`, Node 18+) |

## Data accuracy

Coordinates for the built-in locations are **approximate** (usually within 1–3 km). The *Live OSM*
layer always shows exact, up-to-date positions. Fees and salaries are rough 2025/26 Naira figures,
tuned for gameplay. To add or correct a school, town or job, edit `js/data.js`. `npm test`
checks that every reference still points at something real.

Map data © OpenStreetMap contributors.
