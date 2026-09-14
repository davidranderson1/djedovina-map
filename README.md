# Djedovina · Karta

Internal property-layer map for the Split hinterland: cadastral parcels colour-coded by pipeline stage, live court-notice leads, Google Maps / Street View / land-registry links per parcel.

Data is served by a key-gated endpoint; the page asks for the team access key on first load. No credentials live in this repository.

Site: https://davidranderson1.github.io/djedovina-map/

v19 (14 Sep 2026): Contacts — people and organisations we meet, meetings and calls, documents, named places, and "Ask" in plain words. Backend sources under `supabase/`.

Publishing: GitHub Pages serves the `gh-pages` branch. A release is pushed to `main` (source of record, incl. `supabase/`) and the site files (`index.html`, `app-1..5.js`, `open-items.html`, `landing/`, `README.md`, `.nojekyll`) to `gh-pages`; verify each file by blob SHA on both branches, then load the live URL. Open Items item 21 tracks moving the Pages source to `main`.
