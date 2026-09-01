/* ---------- people: the person registry browser ---------- */
let koNames = [];
function fillKoSelect() {
  const s = document.getElementById("pko");
  const cur = s.value;
  s.innerHTML = `<option value="">All municipalities</option>` + koNames.map(k => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("");
  s.value = cur;
}
/* watch toggles (👁) — shared by every view */
window.djWatch = async function (kind, ref, label, el) {
  const on = !el.classList.contains("on");
  el.disabled = true;
  try {
    const d = await api(`what=watch_set&kind=${kind}&ref=${ref}&label=${encodeURIComponent(label || "")}&on=${on ? "1" : "0"}`, KEY);
    if (d.error) throw new Error(d.error);
    el.classList.toggle("on", on);
    el.title = on ? "Watching — changes ring the bell. Click to stop." : "Watch: changes to this will ring the bell";
  } catch (e) { alert("Could not update the watch: " + e.message); }
  el.disabled = false;
};
const jsSafe = s => String(s || "").replace(/['"<>&\\]/g, "");
// Select a municipality even if the KO list has not arrived yet (adds the option on the fly).
function setKo(selId, ko) {
  const s = document.getElementById(selId);
  if (ko && ![...s.options].some(o => o.value === ko)) s.add(new Option(ko, ko));
  s.value = ko || "";
}
function eyeBtn(kind, ref, label, on) {
  return `<button class="eye${on ? " on" : ""}" onclick="djWatch('${kind}', ${ref}, '${jsSafe(label)}', this)" title="${on ? "Watching — changes ring the bell. Click to stop." : "Watch: changes to this will ring the bell"}">👁</button>`;
}
function parcelChip(p, ko) {
  return `<span class="chip">${esc(p.parcel_no)} · ${fmtN(p.area_m2)} m² ` +
    (p.lat ? `<span class="loc" onclick="djLocate(${p.lat}, ${p.lon})" title="Show on the map">📍</span> ` : "") +
    `<a href="${esc(regUrl(p.nat_ref))}" target="_blank" rel="noopener" title="Open in the state registry">⚖</a> ` +
    (p.prospect ? `<span style="color:var(--good)" title="Already a prospect">${esc(p.prospect)}</span>`
                : (p.lat ? `<span class="loc" onclick="djAdd('Parcel ${esc(p.parcel_no)}, ${esc(ko || "")}', ${p.lat}, ${p.lon}, this)" title="Flag as a Djedovina prospect">⚑ flag</span>` : "")) +
    `</span>`;
}

/* autocomplete (People search and Activity look-up): parcels grouped by municipality + people */
function bindAutocomplete(inputId, boxId, koSelId, onPick) {
  const inp = document.getElementById(inputId), box = document.getElementById(boxId);
  let t = null, seq = 0;
  const hide = () => { box.style.display = "none"; box.innerHTML = ""; };
  inp.addEventListener("input", () => {
    clearTimeout(t);
    const q = inp.value.trim();
    if (q.length < 1) { hide(); return; }
    t = setTimeout(async () => {
      const my = ++seq;
      const ko = koSelId ? document.getElementById(koSelId).value : "";
      try {
        const d = await api(`what=suggest&q=${encodeURIComponent(q)}&ko=${encodeURIComponent(ko)}&limit=12`, KEY);
        if (my !== seq) return;
        const P = d.parcels || [], H = d.people || [];
        if (!P.length && !H.length) { hide(); return; }
        box.innerHTML =
          (P.length ? `<div class="h">Parcel ${esc(q)} — choose the municipality</div>` + P.map((p, i) =>
            `<div data-k="p" data-i="${i}"><b>${esc(p.parcel_no)}</b> · ${esc(p.ko)} <span class="muted">· ${fmtN(p.area_m2)} m² · ${p.holders} holder(s) known${p.prospect ? " · " + esc(p.prospect) : ""}</span></div>`).join("") : "") +
          (H.length ? `<div class="h">People</div>` + H.map((h, i) =>
            `<div data-k="h" data-i="${i}"><b>${esc(h.name)}</b> <span class="muted">· ${esc(h.address || "")}</span></div>`).join("") : "");
        box.style.display = "block";
        box.querySelectorAll("div[data-k]").forEach(row => {
          row.onclick = () => { hide(); onPick(row.dataset.k === "p" ? { parcel: P[+row.dataset.i] } : { person: H[+row.dataset.i] }); };
        });
      } catch (e) { hide(); }
    }, 220);
  });
  inp.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  document.addEventListener("click", e => { if (!e.target.closest("#" + boxId) && e.target !== inp) hide(); });
}

/* People view: four modes */
let pplMode = "people";
document.getElementById("pplTabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  pplMode = b.dataset.m;
  document.querySelectorAll("#pplTabs button").forEach(x => x.classList.toggle("on", x === b));
  loadPeople();
});
bindAutocomplete("pq", "pqAc", "pko", pick => {
  if (pick.parcel) { setKo("pko", pick.parcel.ko); document.getElementById("pq").value = pick.parcel.parcel_no; }
  else { document.getElementById("pq").value = pick.person.name; }
  if (pplMode !== "people") { pplMode = "people"; document.querySelectorAll("#pplTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === "people")); }
  loadPeople();
});
async function loadPeople() {
  const el = document.getElementById("peopleBody");
  const q = document.getElementById("pq").value.trim();
  const ko = document.getElementById("pko").value;
  const st = document.getElementById("pst").value;
  const fam = document.getElementById("pfam").checked;
  document.getElementById("pst").style.display = pplMode === "people" ? "" : "none";
  document.getElementById("pfam").parentElement.style.display = pplMode === "people" ? "" : "none";
  document.getElementById("pq").parentElement.style.display = pplMode === "people" ? "" : "none";
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    if (pplMode === "families") {
      const rows = await api(`what=families&ko=${encodeURIComponent(ko)}&limit=150`, KEY);
      document.getElementById("peopleN").textContent = rows.length ? `(${rows.length} families)` : "";
      el.innerHTML = `<p class="muted" style="margin-bottom:8px">Surname clusters per municipality — inheritance splits land along family lines, so one family gathering can settle what would otherwise be twenty letters. Click a family to list its people.</p>` +
        (rows.length ? `<div class="tblwrap"><table><thead><tr><th>Family</th><th>Municipality</th><th class="num">People</th><th class="num">Folios</th><th class="num">Parcels</th><th class="num">Area held m²</th></tr></thead><tbody>` +
        rows.map(f => `<tr><td><b class="loc" style="text-decoration:underline dotted" onclick="pplFamily('${jsSafe(f.surname)}', '${jsSafe(f.ko)}')">${esc(f.surname)}</b></td><td>${esc(f.ko)}</td><td class="num">${f.people}</td><td class="num">${f.folios}</td><td class="num">${f.parcels}</td><td class="num">${fmtN(f.area_held)}</td></tr>`).join("") +
        `</tbody></table></div>` : `<div class="empty">No families yet for this selection.</div>`);
      return;
    }
    if (pplMode === "hot") {
      const rows = await api(`what=hot_folios&ko=${encodeURIComponent(ko)}&limit=150`, KEY);
      document.getElementById("peopleN").textContent = rows.length ? `(${rows.length} folios)` : "";
      el.innerHTML = `<p class="muted" style="margin-bottom:8px">Folios ranked by opportunity: size (capped so mountain commons don't win), how many holders share it, building zoning, likely-deceased and abroad holders; institutional co-holders pull a folio down. "Known" is how much of the share we can already put a name to.</p>` +
        (rows.length ? `<div class="tblwrap"><table><thead><tr><th>Folio</th><th>Municipality</th><th class="num">Score</th><th class="num">Area m²</th><th class="num">Parcels</th><th class="num">Holders</th><th>Signals</th><th class="num">Known</th><th></th></tr></thead><tbody>` +
        rows.map(f => `<tr>
          <td><b class="loc" style="text-decoration:underline dotted" title="Open this folio's history" onclick="openFolio(${f.lr_unit_id})">Folio ${esc(f.unit_no)}</b></td>
          <td>${esc(f.ko)}</td><td class="num"><b>${f.score}</b></td><td class="num">${fmtN(f.area)}</td><td class="num">${f.parcels}</td><td class="num">${f.holders}</td>
          <td>${f.building ? `<span class="chip" style="color:var(--good)">building ×${f.building}</span>` : ""}${f.deceased ? `<span class="chip" style="color:var(--crit)">† ${f.deceased}</span>` : ""}${f.abroad ? `<span class="chip">abroad ${f.abroad}</span>` : ""}${f.inst ? `<span class="chip" style="color:var(--warn)">institution ${f.inst}</span>` : ""}${f.prospects ? `<span class="chip" style="color:var(--good)">in pipeline</span>` : ""}${f.agreed_n ? `<span class="chip" style="color:var(--good)">${f.agreed_n} agreed</span>` : ""}</td>
          <td class="num">${pctL(f.known)}%</td>
          <td style="white-space:nowrap">${eyeBtn("folio", f.lr_unit_id, "Folio " + f.unit_no + " · " + f.ko, f.watched)} ${f.sample_parcel && f.sample_parcel.lat ? `<span class="loc" onclick="djLocate(${f.sample_parcel.lat}, ${f.sample_parcel.lon})" title="Show on the map">📍</span> <a href="${esc(regUrl(f.sample_parcel.nat_ref))}" target="_blank" rel="noopener" title="State registry">⚖</a>` : ""}</td>
        </tr>`).join("") + `</tbody></table></div>` : `<div class="empty">No folios with 2+ holders yet for this selection.</div>`);
      return;
    }
    if (pplMode === "review") {
      const rows = await api(`what=match_queue&limit=100`, KEY);
      document.getElementById("peopleN").textContent = rows.length ? `(${rows.length} to review)` : "";
      el.innerHTML = `<p class="muted" style="margin-bottom:8px">Holder lines the matcher could not tie to one person on its own — usually because two people share the normalized name. Link to the right suggestion, or create a new person.</p>` +
        (rows.length ? rows.map(r => `<div class="notice" id="mq-${r.entry_id}"><b>${esc(r.name)}</b>${r.share ? ` · ${esc(r.share)}` : ""} <span class="muted">· Folio ${esc(r.unit_no)} · ${esc(r.ko)} · <span class="chip">${esc(r.source)}</span>${r.address ? " · " + esc(r.address) : ""}</span><br>` +
          (r.suggest || []).map(s => `<button onclick="djLinkQ(${r.entry_id}, ${s.id}, this)" style="font-size:12px;margin:3px 4px 0 0">link: ${esc(s.name)}${s.address ? " — " + esc(s.address) : ""} (${Math.round((s.sim || 0) * 100)}%)</button>`).join("") +
          `<button onclick="djNewPerson(${r.entry_id}, this)" style="font-size:12px;margin-top:3px">+ new person</button></div>`).join("")
        : `<div class="empty">Nothing to review — every holder line is tied to a person. ✓</div>`);
      return;
    }
    const rows = await api(`what=people&q=${encodeURIComponent(q)}&ko=${encodeURIComponent(ko)}&status=${encodeURIComponent(st)}&all=${fam ? "0" : "1"}&limit=200`, KEY);
    document.getElementById("peopleN").textContent = rows.length ? `(${rows.length}${rows.length >= 200 ? "+" : ""} shown)` : "";
    if (!rows.length) { el.innerHTML = `<div class="empty">No people match — the owner harvest is still running; try a wider search.</div>`; return; }
    el.innerHTML = `<div class="tblwrap"><table><thead><tr>
      <th>Person</th><th>Address (as registered)</th><th>Status</th><th class="num">Folios</th><th class="num">Parcels</th><th class="num">Area held m²</th><th>Where</th><th></th>
    </tr></thead><tbody>` + rows.map(p => `<tr id="pr-${p.id}">
      <td><b class="loc" style="text-decoration:underline dotted" title="Open folios and parcels" onclick="togglePerson(${p.id})">${esc(p.name)}</b></td>
      <td class="muted">${esc(p.address || "")}</td>
      <td><select class="stgsel" style="max-width:130px" onchange="djPersonStatusQuiet(${p.id}, this)">${PERSON_STATUSES.map(s => `<option value="${s}"${s === p.status ? " selected" : ""}>${s}</option>`).join("")}</select></td>
      <td class="num">${p.folios}</td><td class="num">${p.parcels}</td><td class="num">${fmtN(p.area_held)}</td>
      <td>${(p.kos || []).map(k => `<span class="chip">${esc(k)}</span>`).join("")}</td>
      <td>${eyeBtn("person", p.id, p.name, false)}</td>
    </tr>`).join("") + `</tbody></table></div>`;
  } catch (e) { el.innerHTML = `<div class="empty">Could not load: ${esc(e.message)}</div>`; }
}
window.pplFamily = function (surname, ko) {
  pplMode = "people";
  if (!document.getElementById("peopleView").classList.contains("open")) setView("people");
  document.querySelectorAll("#pplTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === "people"));
  document.getElementById("pq").value = surname; setKo("pko", ko);
  loadPeople();
};
window.djLinkQ = async function (entryId, personId, btn) {
  btn.disabled = true; btn.textContent = "linking…";
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=stake_link`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ entry_id: entryId, person_id: personId })
    });
    const d = await r.json(); if (d.error) throw new Error(d.error);
    const row = document.getElementById("mq-" + entryId); if (row) row.remove();
  } catch (e) { alert("Could not link: " + e.message); btn.disabled = false; btn.textContent = "link"; }
};
window.djNewPerson = async function (entryId, btn) {
  btn.disabled = true;
  try { const d = await api(`what=entry_new_person&entry=${entryId}`, KEY); if (d.error) throw new Error(d.error);
    const row = document.getElementById("mq-" + entryId); if (row) row.remove();
  } catch (e) { alert("Could not create the person: " + e.message); btn.disabled = false; }
};
window.togglePerson = async function (id) {
  const row = document.getElementById("pr-" + id);
  const next = row.nextElementSibling;
  if (next && next.classList.contains("phold")) { next.remove(); return; }
  const tr = document.createElement("tr"); tr.className = "phold";
  tr.innerHTML = `<td colspan="7" class="muted">Loading holdings…</td>`;
  row.after(tr);
  try {
    const h = await api(`what=person_holdings&id=${id}`, KEY);
    tr.innerHTML = `<td colspan="8" style="background:var(--panel2)">` + (h.length ? h.map(f =>
      `<div class="notice"${f.ended_at ? ' style="opacity:.55"' : ""}><b class="loc" style="text-decoration:underline dotted" title="Open this folio's history" onclick="openFolio(${f.lr_unit_id})">Folio ${esc(f.unit_no)}</b> ${eyeBtn("folio", f.lr_unit_id, "Folio " + f.unit_no + " · " + f.ko, f.watched)} <span class="muted">· k.o. ${esc(f.ko)} · share ${esc(f.share_text || "?")}${f.share_frac != null ? ` (${pctL(f.share_frac)}%)` : ""} · ${f.co_holders} co-holder(s) · <span class="chip">${esc(f.source)}</span>${f.address ? ` · ${esc(f.address)}` : ""}${f.ended_at ? ` · <b class="drem">no longer on the sheet since ${esc(String(f.ended_at).slice(0, 10))}</b>` : ""}</span><br>` +
      (f.parcels || []).map(p => parcelChip(p, f.ko)).join(" ") + `</div>`).join("") : `<span class="muted">No holdings recorded.</span>`) + `</td>`;
  } catch (e) { tr.innerHTML = `<td colspan="7" class="muted">Could not load holdings: ${esc(e.message)}</td>`; }
};
window.djPersonStatusQuiet = async function (id, sel) {
  sel.disabled = true;
  try { const d = await api(`what=person_status&id=${id}&status=${encodeURIComponent(sel.value)}`, KEY); if (d.error) throw new Error(d.error); }
  catch (e) { alert("Could not save the status: " + e.message); }
  sel.disabled = false;
};
document.getElementById("pGo").onclick = loadPeople;
document.getElementById("pq").addEventListener("keydown", e => { if (e.key === "Enter") loadPeople(); });
for (const id of ["pko", "pst", "pfam"]) document.getElementById(id).addEventListener("change", loadPeople);

/* ---------- activity: change watch timeline, folio look-up, watchlist, conflicts ---------- */
let actMode = "timeline", actUnit = null;
document.getElementById("actTabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  actMode = b.dataset.m; actUnit = null;
  document.querySelectorAll("#actTabs button").forEach(x => x.classList.toggle("on", x === b));
  loadActivity();
});
document.getElementById("actGo").onclick = () => { actUnit = null; loadActivity(); };
document.getElementById("actQ").addEventListener("keydown", e => { if (e.key === "Enter") { actUnit = null; loadActivity(); } });
for (const id of ["actKo", "actSince", "actWatched"]) document.getElementById(id).addEventListener("change", () => { actUnit = null; loadActivity(); });
bindAutocomplete("actQ", "actAc", "actKo", pick => {
  if (pick.parcel) { setKo("actKo", pick.parcel.ko); document.getElementById("actQ").value = pick.parcel.parcel_no; }
  else { document.getElementById("actQ").value = pick.person.name; }
  actMode = "lookup"; actUnit = null;
  document.querySelectorAll("#actTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === "lookup"));
  loadActivity();
});
function fillActKo() {
  const s = document.getElementById("actKo"); const cur = s.value;
  s.innerHTML = `<option value="">All municipalities</option>` + koNames.map(k => `<option ${k === cur ? "selected" : ""}>${esc(k)}</option>`).join("");
  s.value = cur;
}
const fmtWhen = t => t ? String(t).replace("T", " ").slice(0, 16) : "";
function diffChips(ev) {
  return (ev.added || []).map(a => `<span class="chip dadd">+ ${esc(a.name)}${a.share ? " " + esc(a.share) : ""}</span>`).join(" ") + " " +
    (ev.removed || []).map(a => `<span class="chip drem">− ${esc(a.name)}${a.share ? " " + esc(a.share) : ""}</span>`).join(" ") + " " +
    (ev.changed || []).map(a => `<span class="chip dchg">~ ${esc(a.name)} ${esc(a.from || "?")} → ${esc(a.to || "?")}</span>`).join(" ");
}
window.openFolio = function (unitId) {
  actMode = "lookup"; actUnit = unitId;
  document.querySelectorAll("#actTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === "lookup"));
  setView("activity");
};
async function loadActivity() {
  const el = document.getElementById("actBody");
  if (koNames.length && document.getElementById("actKo").options.length <= 1) fillActKo();
  const isTL = actMode === "timeline", isLK = actMode === "lookup";
  document.getElementById("actSince").style.display = isTL ? "" : "none";
  document.getElementById("actWatchedWrap").style.display = isTL ? "" : "none";
  document.getElementById("actQWrap").style.display = isLK ? "" : "none";
  document.getElementById("actGo").style.display = isLK ? "" : "none";
  document.getElementById("actKo").style.display = (isTL || isLK) ? "" : "none";
  el.innerHTML = `<p class="muted">Loading…</p>`;
  const ko = document.getElementById("actKo").value;
  try {
    if (isTL) {
      const days = document.getElementById("actSince").value;
      const since = days ? new Date(Date.now() - (+days) * 864e5).toISOString() : "";
      const w = document.getElementById("actWatched").checked ? "1" : "0";
      const rows = await api(`what=changes&ko=${encodeURIComponent(ko)}&since=${encodeURIComponent(since)}&watched=${w}&limit=200`, KEY);
      document.getElementById("actN").textContent = rows.length ? `(${rows.length} events)` : "";
      if (!rows.length) {
        el.innerHTML = `<div class="empty">No changes recorded yet${w === "1" ? " on watched items" : ""} in this period.<br><span class="muted">Change events only start once a parcel has been read a second time — the first full pass is still running; re-reads begin two weeks after each parcel's first read. Add 👁 watches now so the first changes ring the bell.</span></div>`;
        return;
      }
      el.innerHTML = rows.map(ev => `<div class="evt">
        <span class="when">${fmtWhen(ev.at)}</span> ${ev.watched ? `<span class="chip" style="color:var(--warn)">👁 watched</span>` : ""}<br>
        <b class="loc" style="text-decoration:underline dotted" onclick="openFolio(${ev.lr_unit_id})">Folio ${esc(ev.unit_no)}</b> ${eyeBtn("folio", ev.lr_unit_id, "Folio " + ev.unit_no + " · " + ev.ko, ev.watched)} <span class="muted">· ${esc(ev.ko)}</span> — ${esc(ev.summary || "")}<br>
        <div style="margin:6px 0">${diffChips(ev)}</div>
        <div>${(ev.parcels || []).map(p => parcelChip(p, ev.ko)).join(" ")}</div>
      </div>`).join("");
      return;
    }
    if (isLK) {
      if (!actUnit) {
        const q = document.getElementById("actQ").value.trim();
        if (!q) { el.innerHTML = `<div class="empty">Type a folio number or a parcel number, pick the municipality, and the folio's full story appears: who is on it now, who left it, and every change we have seen.</div>`; return; }
        const list = await api(`what=folio_lookup&q=${encodeURIComponent(q)}&ko=${encodeURIComponent(ko)}`, KEY);
        if (!list.length) { el.innerHTML = `<div class="empty">No folio matches "${esc(q)}"${ko ? " in " + esc(ko) : ""}. Folios appear here once the harvest has read a parcel that belongs to them.</div>`; return; }
        if (list.length > 1) {
          el.innerHTML = `<p class="muted">"${esc(q)}" names ${list.length} folios — choose one:</p>` + list.map(f => `<div class="notice"><b class="loc" style="text-decoration:underline dotted" onclick="openFolio(${f.lr_unit_id})">Folio ${esc(f.unit_no)}</b> <span class="muted">· ${esc(f.ko)}</span></div>`).join("");
          return;
        }
        actUnit = list[0].lr_unit_id;
      }
      const h = await api(`what=folio_history&unit=${actUnit}`, KEY);
      if (!h || h.error) throw new Error(h?.error || "not found");
      document.getElementById("actN").textContent = "";
      el.innerHTML = `<div class="evt">
        <h3 style="font-size:16px">Folio ${esc(h.unit_no)} <span class="muted" style="font-weight:400">· ${esc(h.ko)}</span> ${eyeBtn("folio", h.lr_unit_id, "Folio " + h.unit_no + " · " + h.ko, h.watched)}${h.plomba ? ` <span class="chip" style="color:var(--crit)">⚠ plomba</span>` : ""}</h3>
        <div class="muted" style="font-size:12px;margin:4px 0 8px">first seen ${fmtWhen(h.first_seen) || "—"} · last read ${fmtWhen(h.last_scanned) || "—"}${h.read_at ? " · LR extract read " + fmtWhen(h.read_at) : ""}</div>
        <div>${(h.parcels || []).map(p => parcelChip(p, h.ko)).join(" ")}</div>
        <h4 style="margin-top:12px;font-size:13.5px">Holders now (${(h.active || []).length})</h4>
        <div class="tblwrap"><table><thead><tr><th>Name</th><th>Share</th><th>Address</th><th>Source</th><th>Since</th><th>Status</th></tr></thead><tbody>` +
        (h.active || []).map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.share || "?")}${a.share_frac != null ? ` <span class="muted">(${pctL(a.share_frac)}%)</span>` : ""}</td><td class="muted">${esc(a.address || "")}</td><td><span class="chip">${esc(a.source)}</span></td><td class="muted">${fmtWhen(a.since).slice(0, 10)}</td><td>${a.status ? `<span class="chip">${esc(a.status)}</span>` : ""}</td></tr>`).join("") +
        `</tbody></table></div>` +
        ((h.ended || []).length ? `<h4 style="margin-top:12px;font-size:13.5px">No longer on the sheet (${h.ended.length})</h4>` +
          h.ended.map(a => `<div class="notice"><span class="drem">${esc(a.name)}${a.share ? " " + esc(a.share) : ""}</span> <span class="muted">· ${fmtWhen(a.since).slice(0, 10)} → ${fmtWhen(a.until).slice(0, 10)} · <span class="chip">${esc(a.source)}</span></span></div>`).join("") : "") +
        `<h4 style="margin-top:12px;font-size:13.5px">Change history (${(h.events || []).length})</h4>` +
        ((h.events || []).length ? h.events.map(ev => `<div class="notice"><span class="when muted">${fmtWhen(ev.at)}</span> — ${esc(ev.summary || "")}<div style="margin-top:4px">${diffChips(ev)}</div></div>`).join("")
          : `<p class="muted">No changes seen yet — this folio has been read once. It will be re-read about two weeks after its first read.</p>`) +
      `</div>`;
      return;
    }
    if (actMode === "watch") {
      const rows = await api(`what=watch_list`, KEY);
      document.getElementById("actN").textContent = rows.length ? `(${rows.length} watched)` : "";
      el.innerHTML = rows.length ? `<div class="tblwrap"><table><thead><tr><th>Watching</th><th>Kind</th><th>Last change</th><th>Since</th><th></th></tr></thead><tbody>` +
        rows.map(w => `<tr><td><b class="loc" style="text-decoration:underline dotted" onclick="${w.kind === "folio" ? `openFolio(${w.ref_id})` : w.kind === "person" ? `pplFamily('${jsSafe(w.detail)}', '')` : `setView('activity')`}">${esc(w.detail || w.label || "")}</b></td><td><span class="chip">${esc(w.kind)}</span></td><td class="muted">${w.last_change ? fmtWhen(w.last_change) : "none yet"}</td><td class="muted">${fmtWhen(w.created_at).slice(0, 10)}</td><td><button class="eye on" onclick="djWatch('${w.kind}', ${w.ref_id}, '', this); setTimeout(loadActivity, 400)" title="Stop watching">👁 stop</button></td></tr>`).join("") +
        `</tbody></table></div>` : `<div class="empty">Nothing watched yet. Click 👁 next to any folio, person or parcel — in the prospect ledger, the People list, Hot folios, or a folio's history — and its changes will ring the bell.</div>`;
      return;
    }
    if (actMode === "conflicts") {
      const rows = await api(`what=conflicts&limit=200`, KEY);
      document.getElementById("actN").textContent = rows.length ? `(${rows.length} folios)` : "";
      el.innerHTML = `<p class="muted" style="margin-bottom:8px">Folios where the cadastre's possessors and the land-registry owners (from your extracts) do not agree. Every one is a title-settlement lead: the family has a problem they usually don't know about, and you arrive with the fix.</p>` +
        (rows.length ? rows.map(c => `<div class="evt"><b class="loc" style="text-decoration:underline dotted" onclick="openFolio(${c.lr_unit_id})">Folio ${esc(c.unit_no)}</b> <span class="muted">· ${esc(c.ko)}</span><br>
          <div style="margin-top:6px"><span class="muted">Only in the cadastre:</span> ${(c.only_cadastre || []).map(n => `<span class="chip dchg">${esc(n)}</span>`).join(" ") || "—"}</div>
          <div><span class="muted">Only in the land registry:</span> ${(c.only_lr || []).map(n => `<span class="chip dchg">${esc(n)}</span>`).join(" ") || "—"}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">Cadastre: ${(c.cad_names || []).map(esc).join("; ")}<br>Land registry: ${(c.lr_names || []).map(esc).join("; ")}</div></div>`).join("")
        : `<div class="empty">No disagreements found yet — conflicts appear once land-registry extracts are saved in Research for folios the cadastre harvest has already read.</div>`);
    }
  } catch (e) { el.innerHTML = `<div class="empty">Could not load: ${esc(e.message)}</div>`; }
}

/* ---------- field dossier (print) ---------- */
let lastLedger = [];
document.getElementById("ppPrint").onclick = () => {
  if (!ppCur) return;
  const o = ppCur, heirs = o.__heirs || [];
  const w = window.open("", "_blank");
  if (!w) { alert("Allow pop-ups to print the dossier."); return; }
  const parcels = (o.parcels || []).map(p => `${esc(p.parcel_no)} · ${esc(p.ko || "")} · ${fmtN(p.area_m2)} m²`).join("<br>");
  const folios = lastLedger.map(f => `<h3>Folio ${esc(f.unit_no || "?")} · ${esc(f.ko || "")}${f.plomba ? " · ⚠ plomba" : ""}</h3>
    <p class="m">known ${pctL(Math.min(1, f.known || 0))}% · contacted ${pctL(Math.min(1, f.contacted || 0))}% · agreed ${pctL(Math.min(1, f.agreed || 0))}%${f.parcels && f.parcels.length ? " · parcels " + f.parcels.map(esc).join(", ") : ""}</p>
    <table><tr><th>Holder</th><th>Share</th><th>Address (as registered)</th><th>Source</th><th>Status</th><th>Notes</th></tr>` +
    (f.entries || []).map(en => `<tr><td>${esc(en.name)}</td><td>${esc(en.share_text || "?")}${en.share_frac != null ? ` (${pctL(en.share_frac)}%)` : ""}</td><td>${esc(en.address || "")}</td><td>${esc(en.source || "")}</td><td>${esc(en.person?.status || "")}</td><td>${esc(en.person?.notes || "")}</td></tr>`).join("") + `</table>`).join("");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Djedovina — dossier — ${esc(o.name)}</title>
    <style>body{font:12.5px/1.45 Georgia,serif;color:#222;margin:28px;max-width:900px}h1{font-size:22px;margin:0}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}h3{font-size:13.5px;margin:12px 0 2px}.m{color:#666;font-size:11.5px;margin:0 0 6px}table{border-collapse:collapse;width:100%;font-size:11.5px}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}.foot{margin-top:24px;color:#777;font-size:11px}@media print{body{margin:12mm}}</style></head><body>
    <h1>${esc(o.name)}</h1><p class="m">${o.address && o.address !== o.name ? esc(o.address) + " · " : ""}stage ${o.stage} — ${esc(STAGE_NAMES[o.stage] || "")} · dossier printed ${new Date().toISOString().slice(0, 10)}</p>
    <h2>Parcels</h2><p>${parcels || "<span class='m'>pin only — no parcel linked yet</span>"}</p>
    <h2>Share ledger</h2>${folios || "<p class='m'>No folio recorded yet.</p>"}
    <h2>Heirs &amp; contacts (${heirs.length})</h2>${heirs.length ? `<table><tr><th>Name</th><th>Relation</th><th>Share</th><th>Country · language</th><th>Contact</th><th>POA</th><th>Consent</th></tr>` +
      heirs.map(h => `<tr><td>${esc(h.name)}</td><td>${esc(h.relation || "")}</td><td>${esc(h.share || "")}</td><td>${[h.country, h.language].filter(Boolean).map(esc).join(" · ")}</td><td>${[h.phone, h.email].filter(Boolean).map(esc).join(" · ")}</td><td>${esc(h.poa || "none")}</td><td>${esc(h.consent || "unknown")}</td></tr>`).join("") + `</table>` : "<p class='m'>None recorded yet.</p>"}
    <h2>Visit notes</h2><div style="height:150px;border:1px dashed #aaa"></div>
    <p class="foot">Djedovina — private working document. Personal data from public registers; handle under the company's data-protection rules.</p>
    <script>setTimeout(function(){window.print()},300)<\/script></body></html>`);
  w.document.close();
};

