/* ---------- features list & guided tour ---------- */
const FEATURES = [
  { t: "Map of the whole territory", v: "map", d: "102,000 parcels across Split, Solin, Klis, Stobreč, Podstrana and the Kaštela edge. Zoomed out, one stage-coloured dot per parcel; zoomed in, boundaries and numbers. Click any parcel for area, owners known, and links to Google, Street View and the state registry.", h: "Pan and zoom; use Filters for municipality, stage, size, zoning, owners known, score. The map remembers where you left off." },
  { t: "Search: addresses, buildings, parcels", v: "map", d: "One box, four sources: our own parcels (type a number like 1924/4), the state address register (exact house numbers with the parcel under them), named buildings and businesses, and OpenStreetMap.", h: "Type and wait a moment — results drop down. Click to fly there; ⚑ Flag adds it to the pipeline in one click." },
  { t: "Area selection", v: "map", d: "Draw a rectangle and every parcel inside becomes one prospect — for a hillside, a street, or a family's scattered plots.", h: "Press ▭ Area, drag on the map, name the selection. Escape cancels." },
  { t: "Research queue", v: "research", d: "Unread parcels, workable sizes first. Open the land-registry portal from each card, read sheet B, type the owners. Saving records the folio, links it, and feeds the map colours and scoring.", h: "Owners one per line as Name | share | flags (no-oib, deceased, abroad)." },
  { t: "People — the person registry", v: "people", m: "people", d: "Every enrolled holder gathered from the cadastre and your extracts, one row per real person, biggest holdings first. Names are matched across spellings and word order.", h: "Search by name, address or parcel number — the drop-down shows which municipalities have that parcel so you pick the right one. Click a name to unfold folios and parcels; ⚑ flags a parcel; 👁 watches a person." },
  { t: "Families", v: "people", m: "families", d: "Surname clusters per municipality with people, folios, parcels and area held. Inheritance splits land along family lines — one family gathering can settle twenty letters.", h: "Click a family to list its people." },
  { t: "Hot folios", v: "people", m: "hot", d: "Folios ranked by opportunity: size, fragmentation, building zoning, likely-deceased or abroad holders — institutions pull a folio down.", h: "Open a folio's history, watch it (👁), locate it, or open the registry from the row." },
  { t: "Match review", v: "people", m: "review", d: "Holder lines the matcher could not tie to one person on its own. Link to the right suggestion or create a new person.", h: "Empty means every line is resolved." },
  { t: "Share ledger (in a prospect's file)", v: "ops", d: "Per folio: every holder with share, source and flags, matched to a person with a status, and a three-colour bar — known / contacted / agreed. Agreed 100% is the buying trigger.", h: "Operations → click a prospect name. Add holders as you read extracts; set statuses on the rows." },
  { t: "Activity — change watch", v: "activity", m: "timeline", d: "After the first pass, every parcel is re-read about every two weeks. When a possession sheet's holders change, the event appears here with the exact before and after — a probate just concluded is the best moment to make contact.", h: "Filter by municipality and period. 👁 on any folio, person or parcel makes its changes ring the bell." },
  { t: "Look up a folio", v: "activity", m: "lookup", d: "A folio's full story: parcels, holders now, holders who left the sheet, and every change we have seen.", h: "Type a folio or parcel number, choose the municipality from the drop-down." },
  { t: "Watchlist", v: "activity", m: "watch", d: "Everything you are watching, with the last change seen on each.", h: "Stop watching from the list." },
  { t: "Cadastre vs. land registry", v: "activity", m: "conflicts", d: "Folios where the cadastre and the land registry disagree — each one a title-settlement lead.", h: "Appears as land-registry extracts get saved in Research." },
  { t: "Operations & Sales", v: "ops", d: "The pipeline in 15 stages, from Territory chosen to Exit. Operations is the working list; Sales is the money book from valuation onward.", h: "Change a stage in place — it is journalled. Open a prospect's file for ledger, heirs, pledge letters and the document vault." },
  { t: "Pledge letters & documents", v: "ops", d: "First-contact letters in Croatian, English, German and Italian built around the promise that nothing happens without a signature; a private vault for extracts, powers of attorney and pre-contracts.", h: "Inside a prospect's file. Copying a letter journals it." },
  { t: "Field dossier", v: "ops", d: "A printable one-page pack for a family visit: parcels, folios, holders and shares, heirs, and space for notes.", h: "Open a prospect → 🖨 Print dossier." },
  { t: "Court notices", v: "map", d: "Probate and title-correction notices harvested hourly from the courts, matched to parcels on the map with days-left-to-respond.", h: "Court notices button; blue rings on the map." },
  { t: "Notifications & sign-in", v: "map", d: "The bell shows every change since you last looked, plus court notices and watched-folio changes. Each team member signs in with their own Google account.", h: "Settings ⚙ for the shared Google Maps key (Street View in popups). Lock signs out." },
];
function renderFeatures() {
  document.getElementById("featList").innerHTML = FEATURES.map((f, i) => `<div class="fcard"><h4>${esc(f.t)}</h4><p>${esc(f.d)}</p><p class="muted" style="margin-top:6px"><b>How:</b> ${esc(f.h)}</p><button style="margin-top:8px;font-size:12px" onclick="featGo(${i})">Show me →</button></div>`).join("");
}
window.featGo = function (i) {
  const f = FEATURES[i];
  if (f.m && f.v === "people") { pplMode = f.m; document.querySelectorAll("#pplTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === f.m)); }
  if (f.m && f.v === "activity") { actMode = f.m; actUnit = null; document.querySelectorAll("#actTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === f.m)); }
  setView(f.v);
};
const TOUR = [0, 1, 4, 5, 6, 8, 9, 10, 13, 15];
let tourAt = -1;
function tourShow() {
  const card = document.getElementById("tourCard");
  if (tourAt < 0 || tourAt >= TOUR.length) { card.style.display = "none"; tourAt = -1; return; }
  const f = FEATURES[TOUR[tourAt]];
  featGo(TOUR[tourAt]);
  document.getElementById("tourTitle").textContent = f.t;
  document.getElementById("tourStep").textContent = `${tourAt + 1} / ${TOUR.length}`;
  document.getElementById("tourText").textContent = f.d + " " + f.h;
  document.getElementById("tourBack").style.visibility = tourAt ? "visible" : "hidden";
  document.getElementById("tourNext").textContent = tourAt === TOUR.length - 1 ? "Finish" : "Next →";
  card.style.display = "block";
}
document.getElementById("tourStart").onclick = () => { tourAt = 0; tourShow(); };
document.getElementById("tourNext").onclick = () => { tourAt++; if (tourAt >= TOUR.length) { tourAt = -1; document.getElementById("tourCard").style.display = "none"; setView("map"); } else tourShow(); };
document.getElementById("tourBack").onclick = () => { if (tourAt > 0) { tourAt--; tourShow(); } };
document.getElementById("tourEnd").onclick = () => { tourAt = -1; document.getElementById("tourCard").style.display = "none"; };

/* ---------- research (extract-reading queue) ---------- */
document.getElementById("rReload").onclick = loadWorklist;
document.getElementById("rKo").addEventListener("change", loadWorklist);
async function loadWorklist() {
  const el = document.getElementById("researchBody");
  el.innerHTML = `<p class="muted">Loading the queue…</p>`;
  // keep the KO chooser in sync with loaded data
  const rSel = document.getElementById("rKo");
  const cur = rSel.value;
  const kos = [...new Set(allParcels.features.map(f => f.properties.ko).filter(Boolean))].sort();
  rSel.innerHTML = `<option value="">All</option>` + kos.map(k => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("");
  rSel.value = cur;
  try {
    const items = await api(`what=worklist&limit=25${cur ? "&ko=" + encodeURIComponent(cur) : ""}`, KEY);
    if (!items.length) { el.innerHTML = `<div class="empty">Queue is empty for this selection — every loaded parcel here has been read.</div>`; return; }
    el.innerHTML = items.map(w => `<div class="card" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin-bottom:10px" id="wl-${w.parcel_id}">
      <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
        <b>Parcel ${esc(w.parcel_no)}</b><span class="muted">${esc(w.ko || "")} · ${fmtN(w.area_m2)} m²${w.prospect ? " · prospect: " + esc(w.prospect) : ""}</span>
        <span class="spacer" style="flex:1"></span>
        <a href="${esc(regUrl(w.nat_ref))}" target="_blank" rel="noopener">Registry: this parcel</a>
        <a href="https://ispu.mgipu.hr/" target="_blank" rel="noopener">Planning (ISPU)</a>
        <span class="loc" onclick="djLocate(${w.lat}, ${w.lon})">📍</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
        <input placeholder="folio no. (zk. ul.)" id="wu-${w.parcel_id}" style="width:130px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px">
        <label class="muted" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="wp-${w.parcel_id}"> plomba</label>
        <select id="wz-${w.parcel_id}" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px">
          <option value="">zoning…</option><option value="building">building</option><option value="agricultural">agricultural</option><option value="forest">forest</option><option value="mixed">mixed</option>
        </select>
        <input placeholder="encumbrances (sheet C), one line" id="we-${w.parcel_id}" style="flex:1;min-width:180px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:6px 8px">
      </div>
      <textarea placeholder="owners, one per line: Name | share | flags (no-oib, deceased, abroad)" id="wo-${w.parcel_id}" rows="3" style="width:100%;margin-top:8px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:8px;font:12.5px/1.5 ui-monospace,monospace"></textarea>
      <div style="margin-top:8px"><button class="add" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:7px 14px;border-radius:6px;cursor:pointer" onclick="djSaveExtract(${w.parcel_id}, this)">Save extract</button></div>
    </div>`).join("");
  } catch (e) {
    el.innerHTML = `<div class="empty">Could not load the queue: ${esc(e.message)}</div>`;
  }
}
window.djSaveExtract = async function (pid, btn) {
  const g = id => document.getElementById(id + "-" + pid);
  const owners = g("wo").value.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
    const parts = l.split("|").map(x => x.trim());
    const flags = (parts[2] || "").toLowerCase();
    return { name: parts[0], share: parts[1] || null,
             no_oib: flags.includes("no-oib") || flags.includes("no oib"),
             deceased: flags.includes("deceas"), abroad: flags.includes("abroad") };
  });
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=save_extract`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ parcel_id: pid, unit_no: g("wu").value, plomba: g("wp").checked,
        encumbrances: g("we").value, zoning: g("wz").value || null, owners })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    const card = document.getElementById("wl-" + pid);
    card.innerHTML = `<b style="color:var(--good)">Saved ✓</b> <span class="muted">folio recorded, ${d.owners_saved} owner line(s)</span>`;
    setTimeout(() => card.remove(), 1500);
    loadData();
  } catch (e) { btn.disabled = false; btn.textContent = "Failed — try again (" + e.message + ")"; }
};

/* ---------- place search (state address register + Photon + Nominatim) ---------- */
const sIn = document.getElementById("searchIn");
const sRes = document.getElementById("searchRes");
let sTimer = null, sSeq = 0;
sIn.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); if (e.key === "Escape") hideRes(); });
sIn.addEventListener("input", () => { clearTimeout(sTimer); if (sIn.value.trim().length > 3) sTimer = setTimeout(doSearch, 700); });
document.getElementById("searchGo").onclick = doSearch;
document.addEventListener("click", e => { if (!e.target.closest("#searchWrap")) hideRes(); });
function hideRes() { sRes.style.display = "none"; }
function srIcon(key, val) {
  if (key === "building" || val === "apartments" || val === "residential") return "🏢";
  if (key === "shop") return "🏪";
  if (key === "amenity") return "🏬";
  if (key === "tourism" || val === "hotel" || val === "apartment") return "🏨";
  if (key === "office") return "💼";
  if (key === "highway" || key === "address" || key === "place") return "📍";
  return "📍";
}
async function doSearch() {
  const q = sIn.value.trim();
  if (!q) return;
  const seq = ++sSeq;
  sRes.style.display = "block";
  sRes.innerHTML = `<div class="srnote muted">Searching…</div>`;
  // Three sources, best first: the STATE ADDRESS REGISTER (exact house numbers with
  // the parcel under each address — authoritative), then Photon (fuzzy names for
  // buildings/businesses, "Belatage" → Bel Étage), then Nominatim (OSM addresses).
  const c = map.getCenter();
  // Our own parcels first when the query looks like a parcel number ("1924/4", "*1/1")
  const pParcel = /^\*?\d+(\/\d+)?$/.test(q)
    ? api(`what=suggest&q=${encodeURIComponent(q)}&limit=12`, KEY)
        .then(d => (d.parcels || []).map(p => ({
          label: `Parcel ${p.parcel_no} · ${p.ko}`,
          detail: [p.area_m2 ? fmtN(p.area_m2) + " m²" : null, `${p.holders} holder(s) known`, p.prospect ? "prospect: " + p.prospect : null].filter(Boolean).join(" · "),
          icon: "▦", lat: p.lat, lon: p.lon
        }))).catch(() => [])
    : Promise.resolve([]);
  const pAddr = api(`what=addr&q=${encodeURIComponent(q)}`, KEY)
    .then(items => (items || []).map(a => ({
      label: a.address,
      detail: ["exact address", a.parcel_no ? "parcel " + a.parcel_no + (a.ko ? " (k.o. " + a.ko + ")" : "") : null].filter(Boolean).join(" · "),
      icon: "🏠",
      lat: a.lat, lon: a.lon
    }))).catch(() => []);
  const pPhoton = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lat=${c.lat.toFixed(4)}&lon=${c.lng.toFixed(4)}&bbox=16.00,43.30,17.05,43.80`)
    .then(r => r.json())
    .then(d => (d.features || []).map(f => ({
      label: f.properties.name || [f.properties.street, f.properties.housenumber].filter(Boolean).join(" ") || q,
      detail: [f.properties.osm_value !== "yes" ? f.properties.osm_value : f.properties.osm_key,
               [f.properties.street, f.properties.housenumber].filter(Boolean).join(" "),
               f.properties.city || f.properties.county].filter(Boolean).join(" · "),
      icon: srIcon(f.properties.osm_key, f.properties.osm_value),
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0]
    }))).catch(() => []);
  const pNomi = fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=hr&viewbox=16.10,43.72,16.90,43.38&q=${encodeURIComponent(q)}`,
    { headers: { "Accept-Language": "hr,en" } })
    .then(r => r.json())
    .then(items => (items || []).map(it => ({
      label: it.display_name.split(",").slice(0, 2).join(",").trim(),
      detail: it.display_name.split(",").slice(2, 5).join(",").trim(),
      icon: srIcon(it.class, it.type),
      lat: parseFloat(it.lat), lon: parseFloat(it.lon)
    }))).catch(() => []);
  const [pc, ad, ph, nm] = await Promise.all([pParcel, pAddr, pPhoton, pNomi]);
  if (seq !== sSeq) return; // a newer search superseded this one
  // merge: our parcels, then exact register addresses, then named places, then OSM
  // addresses; drop near-duplicates (~60 m)
  const results = [];
  for (const r of [...pc, ...ad, ...ph, ...nm]) {
    if (!isFinite(r.lat) || !isFinite(r.lon)) continue;
    if (results.some(x => Math.abs(x.lat - r.lat) < 0.0006 && Math.abs(x.lon - r.lon) < 0.0008)) continue;
    results.push(r);
    if (results.length >= 12) break;
  }
  if (!results.length) { sRes.innerHTML = `<div class="srnote muted">Nothing found — try adding the town, e.g. "…, Split".</div>`; return; }
  sRes.innerHTML = "";
  results.forEach((res, i) => {
    const d = document.createElement("div");
    d.className = "srrow";
    d.innerHTML = `<span>${res.icon}</span><span class="srmain"><b>${esc(res.label)}</b><span class="srdet">${esc(res.detail || "")}</span></span><button class="srflag" title="Flag as a Djedovina prospect">⚑ Flag</button>`;
    d.onclick = () => { hideRes(); pickResult(res); };
    d.querySelector(".srflag").onclick = (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget;
      btn.textContent = "…";
      djAdd(res.label + (res.detail ? " — " + res.detail : ""), res.lat, res.lon, btn);
      map.flyTo({ center: [res.lon, res.lat], zoom: 17.2 });
      setView("map");
    };
    sRes.appendChild(d);
  });
}
async function pickResult(it) {
  setView("map");
  const lat = it.lat, lon = it.lon;
  const label = it.label;
  map.flyTo({ center: [lon, lat], zoom: 17.2 });
  if (searchMarker) searchMarker.remove();
  searchMarker = new maplibregl.Marker({ color: "#D6845A" }).setLngLat([lon, lat]).addTo(map);
  let inner = `<b>${esc(label)}</b><br><span class="muted">${lat.toFixed(5)}, ${lon.toFixed(5)}</span>`;
  try {
    const d = await api(`what=parcel_at&lat=${lat}&lon=${lon}`, KEY);
    const m = (d.matches || [])[0];
    if (m) {
      inner += `<br>On parcel <b>${esc(m.parcel_no)}</b> (${esc(m.ko || "")}, ${m.area_m2 ? fmtN(m.area_m2) + " m²" : "?"})`;
      inner += m.prospect ? `<br>Already tracked: <b>${esc(m.prospect)}</b> (stage ${m.stage})` : "";
    } else {
      inner += `<br><span class="muted">Parcel not loaded here yet — it can still be saved as a pin.</span>`;
    }
    inner += `<br><a href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener">Google Maps</a> · <a href="https://www.google.com/maps?layer=c&cbll=${lat},${lon}" target="_blank" rel="noopener">Street View</a> · <a href="${esc(regUrl(m && m.nat_ref))}" target="_blank" rel="noopener">${m ? "Registry: this parcel" : "Land registry"}</a>`;
    if (!m || !m.prospect) {
      inner += `<br><button class="add" onclick="djAdd('${esc(label).replace(/'/g, "\\'")}', ${lat}, ${lon}, this)">+ Add to Djedovina</button>`;
    }
  } catch (e) {
    inner += `<br><span class="muted">Lookup failed: ${esc(e.message)}</span>`;
  }
  new maplibregl.Popup({ maxWidth: "300px" }).setLngLat([lon, lat]).setHTML(inner).addTo(map);
}

document.getElementById("noticesBtn").onclick = function () {
  document.getElementById("alertsSide").classList.remove("open");
  document.getElementById("bellBtn").classList.remove("on");
  const s = document.getElementById("side"); s.classList.toggle("open"); this.classList.toggle("on");
};
document.getElementById("refreshBtn").onclick = loadData;

/* ---------- notifications ---------- */
let notifyPref = { enabled: true, include_notices: true };
let alertItems = [];
const SEEN = "djedovina-alert-seen";
function seenSince() {
  let s = null; try { s = localStorage.getItem(SEEN); } catch (e) {}
  return s || new Date(Date.now() - 7 * 864e5).toISOString();
}
async function loadAlerts() {
  try {
    const d = await api(`what=alerts&since=${encodeURIComponent(seenSince())}`, KEY);
    notifyPref.enabled = !!d.enabled;
    alertItems = d.items || [];
    const badge = document.getElementById("bellN");
    if (notifyPref.enabled && alertItems.length && !document.getElementById("alertsSide").classList.contains("open")) {
      badge.textContent = alertItems.length > 99 ? "99+" : alertItems.length;
      badge.style.display = "block";
    } else {
      badge.style.display = "none";
    }
    renderAlerts();
  } catch (e) { /* quiet */ }
}
function renderAlerts() {
  document.getElementById("swOn").checked = notifyPref.enabled;
  document.getElementById("swNotices").checked = notifyPref.include_notices;
  const el = document.getElementById("alist");
  if (!notifyPref.enabled) { el.innerHTML = `<p class="muted">Notifications are switched off.</p>`; return; }
  el.innerHTML = alertItems.length ? alertItems.map(a =>
    `<div class="alert"><span class="when">${esc((a.at || "").replace("T", " ").slice(0, 16))} · ${a.kind === "notice" ? "court" : a.kind === "watch" ? "👁 watched" : "change"}</span><br>${esc(a.text)}</div>`
  ).join("") : `<p class="muted">Nothing new since you last looked.</p>`;
}
document.getElementById("bellBtn").onclick = function () {
  document.getElementById("side").classList.remove("open");
  document.getElementById("noticesBtn").classList.remove("on");
  const s = document.getElementById("alertsSide");
  const opening = !s.classList.contains("open");
  s.classList.toggle("open"); this.classList.toggle("on");
  if (opening) {
    renderAlerts();
  } else {
    try { localStorage.setItem(SEEN, new Date().toISOString()); } catch (e) {}
    document.getElementById("bellN").style.display = "none";
  }
};
async function pushNotifyPref() {
  const on = document.getElementById("swOn").checked ? "1" : "0";
  const nt = document.getElementById("swNotices").checked ? "1" : "0";
  try {
    const d = await api(`what=notify_set&on=${on}&notices=${nt}`, KEY);
    notifyPref = { enabled: d.enabled, include_notices: d.include_notices };
  } catch (e) {}
  loadAlerts();
}
document.getElementById("swOn").addEventListener("change", pushNotifyPref);
document.getElementById("swNotices").addEventListener("change", pushNotifyPref);
setInterval(() => { if (booted) loadAlerts(); }, 90000);
(async () => {
  // Supabase reports sign-in failures in the URL hash (#error=…&error_description=…): show them.
  try {
    const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hp.get("error")) {
      keyErr.textContent = "Google sign-in failed: " + (hp.get("error_description") || hp.get("error")).replace(/\+/g, " ") + " — use the team access key below.";
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
  if (KEY) {
    try { await api("what=status", KEY); boot(); return; } catch (e) { /* fall through to sign-in */ }
  }
  try {
    const { data } = SUPA ? await SUPA.auth.getSession() : { data: null };
    const session = data?.session;
    if (session) {
      AUTH_TOKEN = session.access_token;
      try { await api("what=status", ""); KEY = ""; boot(); return; }
      catch (e) {
        keyErr.textContent = (session.user?.email || "This account") +
          " is signed in but not on the team list — ask David to add it.";
      }
    }
  } catch (e) { /* no session */ }
  gate.style.display = "flex";
})();
