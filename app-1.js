const ENDPOINT = "https://zoojmmcdnyciadzktqnx.supabase.co/functions/v1/map-data";
const LS = "djedovina-map-key";
let KEY = null; try { KEY = localStorage.getItem(LS); } catch (e) {}

/* ---------- per-user sign-in (Google via Supabase Auth) ---------- */
// If the auth library fails to load (CDN hiccup), the app still works with the team key.
const SUPA = window.supabase ? window.supabase.createClient(
  "https://zoojmmcdnyciadzktqnx.supabase.co",
  "sb_publishable_WBg0HcY2C_vj8JYfxa4wDQ_siiYMRGt"
) : null;
let AUTH_TOKEN = null;
if (SUPA) SUPA.auth.onAuthStateChange((_ev, s) => { AUTH_TOKEN = s?.access_token ?? null; });
function authHeaders(extra) {
  const h = Object.assign({}, extra || {});
  if (AUTH_TOKEN) h.authorization = "Bearer " + AUTH_TOKEN;
  return h;
}

const gate = document.getElementById("gate");
const keyErr = document.getElementById("keyErr");
document.getElementById("keyGo").onclick = tryKey;
document.getElementById("keyIn").addEventListener("keydown", e => { if (e.key === "Enter") tryKey(); });

async function api(qs, key) {
  const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key ?? "")}&${qs}`, { headers: authHeaders() });
  if (r.status === 401) throw new Error("unauthorized");
  if (!r.ok) throw new Error("server " + r.status);
  return r.json();
}
async function tryKey() {
  const k = document.getElementById("keyIn").value.trim();
  if (!k) return;
  keyErr.textContent = "checking…";
  try {
    await api("what=status", k);
    KEY = k; try { localStorage.setItem(LS, k); } catch (e) {}
    keyErr.textContent = "";
    boot();
  } catch (e) {
    keyErr.textContent = e.message === "unauthorized" ? "That key is not right." : "Could not reach the database: " + e.message;
  }
}
document.getElementById("lockBtn").onclick = () => {
  try { localStorage.removeItem(LS); } catch (e) {}
  if (!SUPA) { location.reload(); return; }
  SUPA.auth.signOut().catch(() => {}).finally(() => location.reload());
};
document.getElementById("gGo").onclick = async () => {
  if (!SUPA) { keyErr.textContent = "Sign-in library did not load — use the team key or reload."; return; }
  keyErr.textContent = "checking Google sign-in…";
  // Ask Supabase whether the Google provider is switched on before redirecting —
  // otherwise the redirect lands on a blank error page.
  try {
    const r = await fetch("https://zoojmmcdnyciadzktqnx.supabase.co/auth/v1/settings", { headers: { apikey: "sb_publishable_WBg0HcY2C_vj8JYfxa4wDQ_siiYMRGt" } });
    const s = await r.json();
    if (s && s.external && s.external.google === false) {
      keyErr.textContent = "Google sign-in is not switched on yet — the Google provider still has to be enabled in Supabase (Authentication → Providers → Google). Use the team access key below for now.";
      return;
    }
  } catch (e) { /* cannot tell — try the redirect anyway */ }
  keyErr.textContent = "sending you to Google…";
  const { error } = await SUPA.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) keyErr.textContent = "Google sign-in is not switched on yet — use the team key. (" + error.message + ")";
};

let map, booted = false, searchMarker = null, satOn = false;
let allParcels = { type: "FeatureCollection", features: [] };
let opsData = [];
let appConfig = {};
document.getElementById("baseBtn").onclick = function () {
  if (!map) return;
  satOn = !satOn;
  map.setLayoutProperty("esri", "visibility", satOn ? "visible" : "none");
  map.setLayoutProperty("osm", "visibility", satOn ? "none" : "visible");
  this.textContent = satOn ? "Streets" : "Satellite";
  this.classList.toggle("on", satOn);
};
document.getElementById("settingsBtn").onclick = function () {
  for (const [aid, bid] of [["side","noticesBtn"],["alertsSide","bellBtn"]]) {
    document.getElementById(aid).classList.remove("open");
    document.getElementById(bid).classList.remove("on");
  }
  const s = document.getElementById("settingsSide");
  s.classList.toggle("open"); this.classList.toggle("on");
  document.getElementById("cfgGKey").value = appConfig.google_maps_key || "";
};
document.getElementById("cfgSave").onclick = async function () {
  const msg = document.getElementById("cfgMsg");
  msg.textContent = "saving…";
  try {
    const v = document.getElementById("cfgGKey").value.trim();
    await api(`what=config_set&k=google_maps_key&v=${encodeURIComponent(v)}`, KEY);
    appConfig.google_maps_key = v;
    msg.textContent = v ? "saved ✓ — Street View is now embedded in parcel popups" : "saved ✓ (key cleared)";
  } catch (e) { msg.textContent = "failed: " + e.message; }
};
const STAGE_NAMES = {1:"Territory chosen",2:"Extract read",3:"Notice watch",4:"Site visit",5:"Family tree",6:"First contact",7:"Heir eligibility",8:"Title fixing",9:"Valuation",10:"Pre-contract",11:"Share purchases",12:"Contract & registration",13:"Tax",14:"Consolidation",15:"Exit / hold"};
function stageColor(s) {
  if (s == null) return "#5c6a75";
  if (s <= 4) return "#7FB4C4";
  if (s === 5) return "#93A467";
  if (s <= 7) return "#D9B25E";
  if (s === 8) return "#D6845A";
  if (s <= 13) return "#8FBF7F";
  return "#E9E0C9";
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtN(n) { return n == null ? "—" : Math.round(n).toLocaleString(); }
// Deep link into the state registry: resolves the parcel's possession sheet
// server-side and redirects; falls back to the registry's search page.
function regUrl(natRef) {
  return natRef
    ? `${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=registry&ref=${encodeURIComponent(natRef)}`
    : "https://oss.uredjenazemlja.hr/public-services/search-cad-parcel";
}

/* ---------- views ---------- */
const vtabs = document.getElementById("vtabs");
vtabs.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  setView(b.dataset.v);
});
function setView(v) {
  vtabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  document.getElementById("opsView").classList.toggle("open", v === "ops");
  document.getElementById("salesView").classList.toggle("open", v === "sales");
  document.getElementById("researchView").classList.toggle("open", v === "research");
  document.getElementById("peopleView").classList.toggle("open", v === "people");
  document.getElementById("activityView").classList.toggle("open", v === "activity");
  document.getElementById("helpView").classList.toggle("open", v === "help");
  document.getElementById("helpBtn").classList.toggle("on", v === "help");
  document.getElementById("prospectPanel").classList.remove("open");
  document.getElementById("legend").style.display = v === "map" ? "block" : "none";
  if (v === "ops") renderOps();
  if (v === "sales") renderSales();
  if (v === "research") loadWorklist();
  if (v === "people") loadPeople();
  if (v === "activity") loadActivity();
  if (v === "help") renderFeatures();
}
document.getElementById("helpBtn").onclick = () => setView(document.getElementById("helpView").classList.contains("open") ? "map" : "help");
window.djLocate = function (lat, lon) {
  setView("map");
  map.flyTo({ center: [lon, lat], zoom: 17 });
  if (searchMarker) searchMarker.remove();
  searchMarker = new maplibregl.Marker({ color: "#D6845A" }).setLngLat([lon, lat]).addTo(map);
};

/* ---------- parcel-number labels toggle ---------- */
document.getElementById("lblBtn").onclick = function () {
  if (!map || !map.getLayer("parcel-labels")) return;
  const on = map.getLayoutProperty("parcel-labels", "visibility") !== "none";
  map.setLayoutProperty("parcel-labels", "visibility", on ? "none" : "visible");
  this.classList.toggle("on", !on);
};

/* ---------- rectangle area selection ---------- */
let drawMode = false, drawA = null;
const areaBtn = document.getElementById("areaBtn");
function boxGeo(a, b) {
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [[
    [a.lng, a.lat], [b.lng, a.lat], [b.lng, b.lat], [a.lng, b.lat], [a.lng, a.lat]
  ]] }, properties: {} };
}
function drawCleanup() {
  drawMode = false; drawA = null;
  areaBtn.classList.remove("on");
  if (map) {
    map.dragPan.enable();
    map.getCanvas().style.cursor = "";
    if (map.getSource("drawbox")) map.getSource("drawbox").setData({ type: "FeatureCollection", features: [] });
  }
}
areaBtn.onclick = function () {
  if (!map) return;
  setView("map");
  if (drawMode) { drawCleanup(); return; }
  drawMode = true;
  this.classList.add("on");
  map.dragPan.disable();
  map.getCanvas().style.cursor = "crosshair";
  if (!map.getSource("drawbox")) {
    map.addSource("drawbox", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "drawbox-fill", type: "fill", source: "drawbox", paint: { "fill-color": "#D6845A", "fill-opacity": 0.15 } });
    map.addLayer({ id: "drawbox-line", type: "line", source: "drawbox", paint: { "line-color": "#D6845A", "line-width": 2, "line-dasharray": [2, 2] } });
  }
};
document.addEventListener("keydown", e => { if (e.key === "Escape" && drawMode) drawCleanup(); });
function bindDraw() {
  map.on("mousedown", e => { if (drawMode) { drawA = { lngLat: e.lngLat, point: e.point }; } });
  map.on("mousemove", e => {
    if (drawMode && drawA) map.getSource("drawbox").setData(boxGeo(drawA.lngLat, e.lngLat));
  });
  map.on("mouseup", async e => {
    if (!drawMode || !drawA) return;
    const a = drawA.point, b = e.point;
    const feats = map.queryRenderedFeatures([
      [Math.min(a.x, b.x), Math.min(a.y, b.y)],
      [Math.max(a.x, b.x), Math.max(a.y, b.y)]
    ], { layers: ["parcel-fill"] });
    const seen = new Map();
    for (const f of feats) if (f.id != null && !seen.has(f.id)) seen.set(f.id, f.properties.parcel_no);
    drawCleanup();
    if (!seen.size) { alert("No parcels inside the rectangle (zoom in until parcels are visible, then draw)."); return; }
    if (seen.size > 500) { alert(`${seen.size} parcels in the box — that is too many for one selection (limit 500). Draw a smaller rectangle.`); return; }
    const def = `Area selection ${new Date().toISOString().slice(0, 10)} (${seen.size} parcels)`;
    const label = prompt(`${seen.size} parcel(s) inside the rectangle.\nName this selection:`, def);
    if (label === null) return;
    try {
      const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=add_area`, {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ label: label || def, parcel_ids: [...seen.keys()] })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      loadData();
      setTimeout(() => alert(`Saved ✓ — ${d.parcels_linked} parcel(s) linked to "${label || def}". Find it in Operations and in the Research queue.`), 100);
    } catch (err) { alert("Could not save the selection: " + err.message); }
  });
}

/* ---------- boot & data ---------- */
const VIEW_LS = "djedovina-map-view";
async function boot() {
  gate.style.display = "none";
  if (booted) { return loadData(); }
  booted = true;
  let savedView = null;
  try { savedView = JSON.parse(localStorage.getItem(VIEW_LS) || "null"); } catch (e) {}
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap contributors · Imagery © Esri · Geocoding © Nominatim & DGU" },
        esri: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }
      },
      layers: [
        { id: "osm", type: "raster", source: "osm" },
        { id: "esri", type: "raster", source: "esri", layout: { visibility: "none" } }
      ]
    },
    center: (savedView && isFinite(savedView.lng) && isFinite(savedView.lat)) ? [savedView.lng, savedView.lat] : [16.524, 43.557],
    zoom: (savedView && isFinite(savedView.zoom)) ? savedView.zoom : 13.5
  });
  map.addControl(new maplibregl.NavigationControl());
  bindDraw();
  map.on("moveend", () => {
    try {
      const c = map.getCenter();
      localStorage.setItem(VIEW_LS, JSON.stringify({ lng: +c.lng.toFixed(5), lat: +c.lat.toFixed(5), zoom: +map.getZoom().toFixed(2) }));
    } catch (e) {}
    clearTimeout(vpTimer); vpTimer = setTimeout(loadViewportParcels, 300);
  });
  map.on("load", loadData);
}
async function loadData() {
  try {
    const [status, notices, pins, ops, npins] = await Promise.all([
      api("what=status", KEY), api("what=notices", KEY), api("what=pins", KEY), api("what=ops", KEY), api("what=notice_pins", KEY)
    ]);
    opsData = ops || [];
    if (status.notify) notifyPref = status.notify;
    appConfig = status.config || {};
    document.getElementById("stats").textContent =
      `${status.parcels ?? 0} parcels · owners scanned ${status.owners_done ?? 0}/${status.owners_total ?? 0} · ${status.persons ?? 0} people · ${status.changes_7d ?? 0} changes/7d · ${opsData.length} prospects · ${status.notices ?? 0} notices`;
    if (Array.isArray(status.kos) && status.kos.length) { koNames = status.kos; fillKoSelect(); }
    const pinGeo = { type: "FeatureCollection", features: (pins || []).map(p => ({
      type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { name: p.name, stage: p.stage, address: p.address || "" }
    })) };
    const noticeGeo = { type: "FeatureCollection", features: (npins || []).map(n => ({
      type: "Feature", geometry: { type: "Point", coordinates: [n.lon, n.lat] },
      properties: { case_no: n.case_no || "", kind: n.kind || "", title: n.title || "", expires_at: n.expires_at || "", parcel_no: n.parcel_no || "" }
    })) };
    if (map.getSource("parcels")) {
      applyFilters();
      map.getSource("pins").setData(pinGeo);
      map.getSource("npins").setData(noticeGeo);
    } else {
      map.addSource("parcels", { type: "geojson", data: allParcels });
      map.addLayer({ id: "parcel-fill", type: "fill", source: "parcels",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.42 } });
      map.addLayer({ id: "parcel-line", type: "line", source: "parcels",
        paint: { "line-color": ["get", "color"], "line-width": 1.2 } });
      map.addLayer({ id: "parcel-labels", type: "symbol", source: "parcels", minzoom: 16,
        layout: { "text-field": ["get", "parcel_no"], "text-font": ["Open Sans Semibold"], "text-size": 11,
                  "text-allow-overlap": false, "text-padding": 1 },
        paint: { "text-color": "#E9E0C9", "text-halo-color": "#141F26", "text-halo-width": 1.3 } });
      map.addSource("pins", { type: "geojson", data: pinGeo });
      map.addLayer({ id: "pin-dots", type: "circle", source: "pins",
        paint: { "circle-radius": 7, "circle-color": "#D6845A", "circle-stroke-color": "#141F26", "circle-stroke-width": 2 } });
      map.on("click", "pin-dots", e => {
        const p = e.features[0].properties;
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
          `<b>${esc(p.name)}</b><br><span class="muted">Saved pin · stage ${esc(p.stage)}</span>` +
          (p.address ? `<br>${esc(p.address)}` : "")).addTo(map);
      });
      map.addSource("npins", { type: "geojson", data: noticeGeo });
      map.addLayer({ id: "notice-dots", type: "circle", source: "npins",
        paint: { "circle-radius": 8, "circle-color": "#7FB4C4", "circle-stroke-color": "#141F26", "circle-stroke-width": 2 } });
      map.on("click", "notice-dots", e => {
        const p = e.features[0].properties;
        const dl = daysLeft(p.expires_at);
        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(
          `<b>⚖ ${esc(p.case_no)}</b> — ${p.kind === "probate" ? "heirs sought" : "title correction"}<br>${esc(p.title)}` +
          `<br><span class="muted">parcel ${esc(p.parcel_no)}</span>` +
          (dl != null ? `<br><b style="color:${dl <= 10 ? "var(--crit)" : "var(--warn)"}">${dl} days left to respond</b>` : "")).addTo(map);
      });
      map.on("click", "parcel-fill", e => { if (!drawMode) openParcelPopup(e.features[0].properties, e.lngLat); });
      for (const l of ["parcel-fill", "pin-dots", "notice-dots"]) {
        map.on("mouseenter", l, () => { if (!drawMode) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", l, () => { if (!drawMode) map.getCanvas().style.cursor = ""; });
      }
      applyFilters();
    }
    loadDots();
    lastVpKey = "";
    loadViewportParcels();
    renderNotices(notices);
    loadAlerts();
    if (document.getElementById("opsView").classList.contains("open")) renderOps();
    if (document.getElementById("salesView").classList.contains("open")) renderSales();
  } catch (e) {
    document.getElementById("stats").textContent = "load failed: " + e.message;
  }
}

/* ---------- filters ---------- */
document.getElementById("filtersBtn").onclick = function () {
  document.getElementById("filters").classList.toggle("open");
  this.classList.toggle("on");
};
for (const id of ["fKo", "fStage", "fOwn", "fZon", "fFrag"]) document.getElementById(id).addEventListener("change", applyFilters);
for (const id of ["fMin", "fMax", "fScore"]) document.getElementById(id).addEventListener("input", () => { clearTimeout(window.__ft); window.__ft = setTimeout(applyFilters, 400); });
document.getElementById("fClear").onclick = () => {
  for (const id of ["fKo", "fStage", "fOwn", "fZon", "fFrag"]) document.getElementById(id).value = "";
  for (const id of ["fMin", "fMax", "fScore"]) document.getElementById(id).value = "";
  applyFilters();
};
function buildKoOptions() {
  const sel = document.getElementById("fKo");
  const cur = sel.value;
  const kos = [...new Set(allParcels.features.map(f => f.properties.ko).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All</option>` + kos.map(k => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("");
}
function applyFilters() {
  if (!map || !map.getSource("parcels")) return;
  const ko = document.getElementById("fKo").value;
  const st = document.getElementById("fStage").value;
  const min = parseFloat(document.getElementById("fMin").value);
  const max = parseFloat(document.getElementById("fMax").value);
  const own = document.getElementById("fOwn").value;
  const feats = allParcels.features.filter(f => {
    const p = f.properties;
    if (ko && p.ko !== ko) return false;
    if (st === "none" && p.stage != null) return false;
    if (st === "tracked" && p.stage == null) return false;
    if (st && st !== "none" && st !== "tracked") {
      const [a, b] = st.split("-").map(Number);
      if (p.stage == null || p.stage < a || p.stage > b) return false;
    }
    const zn = document.getElementById("fZon").value;
    if (zn === "unset" && p.zoning) return false;
    if (zn && zn !== "unset" && !(p.zoning || "").toLowerCase().startsWith(zn === "building" ? "building" : zn)) return false;
    if (isFinite(min) && !(p.area_m2 >= min)) return false;
    if (isFinite(max) && !(p.area_m2 <= max)) return false;
    if (own !== "") {
      const n = p.owners_known ?? 0;
      if (own === "0" && n !== 0) return false;
      if (own !== "0" && n < parseInt(own)) return false;
    }
    const sc = parseFloat(document.getElementById("fScore").value);
    if (isFinite(sc) && !((p.score ?? 0) >= sc)) return false;
    const fr = document.getElementById("fFrag").value;
    if (fr && !((p.frag ?? 0) >= parseInt(fr))) return false;
    return true;
  });
  map.getSource("parcels").setData({ type: "FeatureCollection", features: feats });
  document.getElementById("fcount").textContent =
    feats.length === allParcels.features.length ? `${feats.length} parcels` : `${feats.length} of ${allParcels.features.length} parcels`;
}

/* ---------- parcel loading: dots overview + viewport polygons ----------
   The territory holds ~100,000 parcels — far too many to ship as polygons in one
   response. Zoomed out, every parcel is one stage-colored dot (a single compact
   load); past POLY_ZOOM the full polygons for the visible area are fetched and
   refreshed as the map moves. */
const POLY_ZOOM = 14.6;
let vpTimer = null, vpSeq = 0, lastVpKey = "";
function stageColorExpr() {
  return ["case",
    ["<", ["get", "s"], 0], "#5c6a75",
    ["<=", ["get", "s"], 4], "#7FB4C4",
    ["==", ["get", "s"], 5], "#93A467",
    ["<=", ["get", "s"], 7], "#D9B25E",
    ["==", ["get", "s"], 8], "#D6845A",
    ["<=", ["get", "s"], 13], "#8FBF7F",
    "#E9E0C9"];
}
async function loadDots() {
  try {
    const d = await api("what=parcel_dots", KEY);
    const geo = { type: "FeatureCollection", features: (d || []).map(a => ({
      type: "Feature", geometry: { type: "Point", coordinates: [a[0], a[1]] }, properties: { s: a[2] } })) };
    if (map.getSource("dotsrc")) { map.getSource("dotsrc").setData(geo); }
    else {
      map.addSource("dotsrc", { type: "geojson", data: geo });
      map.addLayer({ id: "parcel-overview", type: "circle", source: "dotsrc", maxzoom: POLY_ZOOM,
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.1, 12, 1.8, 14.5, 3.2],
                 "circle-color": stageColorExpr(), "circle-opacity": 0.75 } },
        map.getLayer("parcel-fill") ? "parcel-fill" : undefined);
    }
  } catch (e) { /* overview is best-effort */ }
}
async function loadViewportParcels() {
  if (!map || map.getZoom() < POLY_ZOOM) return;
  const b = map.getBounds();
  const px = (b.getEast() - b.getWest()) * 0.25, py = (b.getNorth() - b.getSouth()) * 0.25;
  const key = [b.getWest() - px, b.getSouth() - py, b.getEast() + px, b.getNorth() + py].map(v => v.toFixed(3)).join(",");
  if (key === lastVpKey) return;
  const seq = ++vpSeq;
  const q = `what=parcels&minlon=${(b.getWest() - px).toFixed(5)}&minlat=${(b.getSouth() - py).toFixed(5)}&maxlon=${(b.getEast() + px).toFixed(5)}&maxlat=${(b.getNorth() + py).toFixed(5)}`;
  try {
    const d = await api(q, KEY);
    if (seq !== vpSeq) return; // a newer viewport superseded this request
    lastVpKey = key;
    for (const f of d.features) f.properties.color = stageColor(f.properties.stage);
    allParcels = d;
    buildKoOptions();
    applyFilters();
  } catch (e) { /* keep whatever is already loaded */ }
}

