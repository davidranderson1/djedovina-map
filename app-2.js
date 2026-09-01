/* ---------- notices ---------- */
function daysLeft(d) {
  if (!d) return null;
  return Math.ceil((new Date(d + "T23:59:59") - Date.now()) / 864e5);
}
function renderNotices(notices) {
  const nl = document.getElementById("nlist");
  document.getElementById("ncount").textContent = `(${notices.length} live)`;
  nl.innerHTML = notices.map(n => {
    const dl = daysLeft(n.expires_at);
    const urgency = dl != null && dl <= 10 ? ` <span style="color:var(--crit);font-weight:700">${dl} days left</span>` : dl != null ? ` <span class="muted">${dl} days left</span>` : "";
    n.__urg = urgency;
    return n;
  }).map(n =>
    `<div class="notice"><span class="k ${esc(n.kind)}">${n.kind === "probate" ? "heirs sought" : n.kind === "correction-procedure" ? "title correction" : esc(n.kind)}</span>` +
    ` <span class="muted">${esc(n.published_at || "")}</span><br>` +
    `<b>${esc(n.case_no || "")}</b> ${esc(n.title || "")}<br>` +
    `<span class="muted">${esc(n.court || "")}${n.ko_hint ? " · k.o. " + esc(n.ko_hint) : ""}</span>${n.__urg || ""}` +
    `${n.matched_parcel ? ` · <b style="color:var(--sea)">on our map</b>` : ""}` +
    `${n.source_url && !n.source_url.includes("#") ? ` · <a href="${esc(n.source_url)}" target="_blank" rel="noopener">record</a>` : ""}</div>`
  ).join("") || `<p class="muted">No live notices.</p>`;
}

/* ---------- parcel popup / add ---------- */
function openParcelPopup(p, lngLat) {
  const g = `https://www.google.com/maps?q=${p.lat},${p.lon}`;
  const sv = `https://www.google.com/maps?layer=c&cbll=${p.lat},${p.lon}`;
  const hasProspect = p.prospect && p.prospect !== "null";
  const svEmbed = appConfig.google_maps_key
    ? `<iframe style="width:100%;height:150px;border:0;border-radius:6px;margin-top:6px" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(appConfig.google_maps_key)}&location=${p.lat},${p.lon}&fov=90"></iframe>` : "";
  new maplibregl.Popup({ maxWidth: "320px" }).setLngLat(lngLat).setHTML(
    `<b>Parcel ${esc(p.parcel_no)}</b> — ${esc(p.ko || "")}<br>` +
    `${p.area_m2 ? fmtN(p.area_m2) + " m²" : ""}` +
    `${p.score != null ? ` · score <b>${p.score}</b>` : ""}${p.frag > 1 ? ` · family of ${p.frag} split parcels` : ""}` +
    `${hasProspect ? "<br>Prospect: <b>" + esc(p.prospect) + "</b> (stage " + p.stage + ")" : "<br><span style='color:#A99F87'>Not researched yet</span>"}` +
    `<br>Owners recorded: ${p.owners_known ?? 0}${p.zoning ? " · zoning: " + esc(p.zoning) : ""}${p.read ? " · <span style='color:var(--good)'>extract read ✓</span>" : ""}` +
    svEmbed +
    `<br><a href="${g}" target="_blank" rel="noopener">Google Maps</a> · <a href="${sv}" target="_blank" rel="noopener">Street View</a> · <a href="${esc(regUrl(p.nat_ref))}" target="_blank" rel="noopener" title="Opens this parcel's possession sheet in the state registry">Registry: this parcel</a>` +
    (!hasProspect ? `<br><button class="add" onclick="djAdd('Parcel ${esc(p.parcel_no)}, ${esc(p.ko || "")}', ${p.lat}, ${p.lon}, this)">+ Add to Djedovina</button>` : "")
  ).addTo(map);
}
window.djAdd = async function (label, lat, lon, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const r = await api(`what=add_prospect&label=${encodeURIComponent(label)}&lat=${lat}&lon=${lon}`, KEY);
    if (btn) btn.textContent = r.linked_parcel ? `Saved — linked to parcel ${r.linked_parcel} ✓` : "Saved as pin ✓";
    loadData();
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Failed — try again (" + e.message + ")"; }
  }
};
window.djStage = async function (id, stage, sel) {
  sel.disabled = true;
  try {
    await api(`what=set_stage&prospect=${id}&stage=${stage}`, KEY);
    await loadData();
  } catch (e) { alert("Stage change failed: " + e.message); }
  sel.disabled = false;
};

/* ---------- operations view ---------- */
function stageSelect(o) {
  return `<select class="stgsel" onchange="djStage(${o.id}, this.value, this)">` +
    Object.entries(STAGE_NAMES).map(([n, l]) => `<option value="${n}" ${+n === o.stage ? "selected" : ""}>${n}. ${l}</option>`).join("") +
    `</select>`;
}
function parcelChips(o) {
  if (!o.parcels || !o.parcels.length) return `<span class="muted">pin only — parcel loads automatically</span>`;
  return o.parcels.map(p => `<span class="chip">${esc(p.parcel_no)} · ${esc(p.ko || "")} · ${fmtN(p.area_m2)} m²</span>`).join("");
}
function renderOps() {
  const el = document.getElementById("opsBody");
  if (!opsData.length) { el.innerHTML = `<div class="empty">No prospects yet — add them from the map with search or by clicking a parcel.</div>`; return; }
  el.innerHTML = `<div class="tblwrap"><table><thead><tr>
    <th>Prospect</th><th>Stage</th><th>Parcels</th><th class="num">Owners on title</th>
    <th>Tasks</th><th class="num">Spent / budget €</th><th>Last note</th><th></th>
  </tr></thead><tbody>` + opsData.map(o => `<tr>
    <td><b class="loc" style="cursor:pointer;text-decoration:underline dotted" title="Open the file: heirs, letters, documents" onclick="openProspect(${o.id})">${esc(o.name)}</b>${o.address && o.address !== o.name ? `<br><span class="muted">${esc(o.address)}</span>` : ""}<br><span class="muted">${o.heirs ?? 0} heir(s) · ${o.docs ?? 0} document(s)</span></td>
    <td>${stageSelect(o)}</td>
    <td>${parcelChips(o)}</td>
    <td class="num">${o.owners_count ?? "—"}</td>
    <td>${o.open_tasks ? `${o.open_tasks} open${o.next_due ? " · next " + esc(o.next_due) : ""}` : `<span class="muted">none</span>`}</td>
    <td class="num">${fmtN(o.spent)} / ${fmtN(o.budget)}</td>
    <td class="muted" style="max-width:260px">${esc(o.last_note || "")}</td>
    <td>${o.lat ? `<span class="loc" onclick="djLocate(${o.lat}, ${o.lon})" title="Show on the map">📍</span>` : ""}</td>
  </tr>`).join("") + `</tbody></table></div>`;
}

/* ---------- sales view ---------- */
function renderSales() {
  const el = document.getElementById("salesBody");
  const deals = opsData.filter(o => o.stage >= 9);
  if (!deals.length) {
    el.innerHTML = `<div class="empty">Nothing in deal stages yet. When a prospect reaches stage 9 (Valuation) it appears here — with its parcels, budget line and closing steps.</div>`;
    return;
  }
  const totArea = deals.reduce((s, o) => s + (o.parcels || []).reduce((a, p) => a + (+p.area_m2 || 0), 0), 0);
  const totSpent = deals.reduce((s, o) => s + (+o.spent || 0), 0);
  const totOffer = deals.reduce((s, o) => s + (+o.offer_eur || 0), 0);
  el.innerHTML = `<div class="tblwrap"><table><thead><tr>
    <th>Deal</th><th>Stage</th><th>Parcels & area</th><th>Model</th>
    <th class="num">Market €/m²</th><th class="num">Offer €</th>
    <th class="num">Spent €</th><th>Next step</th><th></th>
  </tr></thead><tbody>` + deals.map(o => {
    const area = (o.parcels || []).reduce((a, p) => a + (+p.area_m2 || 0), 0);
    const hint = area && o.market_eur_m2 ? `<br><span class="muted">${fmtN(area)} m² × market = ${fmtN(area * o.market_eur_m2)} €</span>` : "";
    return `<tr>
    <td><b class="loc" style="cursor:pointer;text-decoration:underline dotted" title="Open the file: heirs, letters, documents" onclick="openProspect(${o.id})">${esc(o.name)}</b></td>
    <td>${o.stage}. ${STAGE_NAMES[o.stage] || ""}</td>
    <td>${parcelChips(o)}</td>
    <td>${esc(o.model || "undecided")}</td>
    <td class="num"><input class="mkt" id="mk-${o.id}" type="number" min="0" step="1" value="${o.market_eur_m2 ?? ""}" placeholder="€/m²"></td>
    <td class="num"><input class="mkt" id="of-${o.id}" type="number" min="0" step="100" value="${o.offer_eur ?? ""}" placeholder="€">
      <button class="add" style="margin-left:4px;padding:4px 8px" onclick="djOffer(${o.id}, this)">Save</button>${hint}</td>
    <td class="num">${fmtN(o.spent)}</td>
    <td>${o.open_tasks ? `${o.open_tasks} task(s)${o.next_due ? " · " + esc(o.next_due) : ""}` : `<span class="muted">set the next task</span>`}</td>
    <td>${o.lat ? `<span class="loc" onclick="djLocate(${o.lat}, ${o.lon})" title="Show on the map">📍</span>` : ""}</td>
  </tr>`; }).join("") + `</tbody><tfoot><tr>
    <th>Total: ${deals.length} deal(s)</th><th></th><th class="num">${fmtN(totArea)} m²</th><th></th>
    <th></th><th class="num">${fmtN(totOffer)}</th>
    <th class="num">${fmtN(totSpent)}</th><th></th><th></th>
  </tr></tfoot></table></div>`;
}
window.djOffer = async function (id, btn) {
  const mk = document.getElementById("mk-" + id).value;
  const of = document.getElementById("of-" + id).value;
  btn.disabled = true; btn.textContent = "…";
  try {
    const d = await api(`what=set_offer&prospect=${id}&market=${encodeURIComponent(mk)}&offer=${encodeURIComponent(of)}`, KEY);
    if (d.error) throw new Error(d.error);
    btn.textContent = "✓";
    const o = opsData.find(x => x.id === id);
    if (o) { o.market_eur_m2 = mk ? +mk : null; o.offer_eur = of ? +of : null; }
    setTimeout(() => { btn.disabled = false; btn.textContent = "Save"; renderSales(); }, 800);
  } catch (e) { btn.disabled = false; btn.textContent = "Save"; alert("Save failed: " + e.message); }
};

/* ---------- prospect file: heirs, pledge letters, documents ---------- */
let ppCur = null;
window.openProspect = function (id) {
  const o = opsData.find(x => x.id === id); if (!o) return;
  ppCur = o;
  for (const v of ["opsView", "salesView", "researchView", "peopleView", "activityView", "helpView"]) document.getElementById(v).classList.remove("open");
  document.getElementById("prospectPanel").classList.add("open");
  document.getElementById("ppTitle").textContent = o.name;
  document.getElementById("plOut").value = "";
  document.getElementById("plMsg").textContent = "";
  document.getElementById("hMsg").textContent = "";
  document.getElementById("docMsg").textContent = "";
  document.getElementById("lhMsg").textContent = "";
  loadLedger(); loadHeirs(); loadDocs();
};
document.getElementById("ppBack").onclick = () => setView("ops");

/* ---------- share ledger: per-folio ownership, completeness, person matching ---------- */
const PERSON_STATUSES = ["unknown", "tracing", "located", "contacted", "responded", "agreed", "declined", "deceased"];
function pctL(x) { return Math.round((x || 0) * 1000) / 10; }
function ledgerRow(en) {
  const flags = [
    en.deceased ? `<span class="chip" style="color:var(--crit)">† likely deceased</span>` : "",
    en.no_oib ? `<span class="chip">no OIB</span>` : "",
    en.abroad ? `<span class="chip">abroad</span>` : ""
  ].filter(Boolean).join(" ");
  const shr = en.share_frac != null ? ` · <b>${pctL(en.share_frac)}%</b>` : "";
  let person;
  if (en.person) {
    person = `<select onchange="djPersonStatus(${en.person.id}, this)" style="font-size:12px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:5px;padding:2px 4px">` +
      PERSON_STATUSES.map(s => `<option value="${s}"${s === en.person.status ? " selected" : ""}>${s}</option>`).join("") + `</select>` +
      ([en.person.phone, en.person.email].filter(Boolean).length ? ` <span class="muted">${[en.person.phone, en.person.email].filter(Boolean).map(esc).join(" · ")}</span>` : "");
  } else if (en.suggest && en.suggest.length) {
    person = `<span class="muted" style="font-size:12px">same person?</span> ` +
      en.suggest.map(s => `<button onclick="djLink(${en.entry_id}, ${s.id}, this)" style="font-size:11.5px">link: ${esc(s.name)} (${Math.round((s.sim || 0) * 100)}%)</button>`).join(" ");
  } else {
    person = `<span class="muted" style="font-size:12px">not yet linked to a person</span>`;
  }
  return `<div class="notice"><b>${esc(en.name)}</b>${en.share_text ? ` · ${esc(en.share_text)}` : ""}${shr} <span class="chip">${esc(en.source || "?")}</span>${flags ? " " + flags : ""}<br>` +
    (en.address ? `<span class="muted">${esc(en.address)}</span><br>` : "") + person + `</div>`;
}
async function loadLedger() {
  const el = document.getElementById("ppLedger");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const d = await api(`what=ledger&prospect=${ppCur.id}`, KEY);
    const folios = d.folios || [];
    lastLedger = folios;
    document.getElementById("ppLedN").textContent = folios.length ? `(${folios.length} folio${folios.length > 1 ? "s" : ""})` : "";
    if (folios.length && !document.getElementById("lhUnit").value) document.getElementById("lhUnit").value = folios[0].unit_no || "";
    if (!folios.length) { el.innerHTML = `<p class="muted">No land-registry folio recorded yet — add the first holder below and the folio is created automatically.</p>`; return; }
    el.innerHTML = folios.map(f => {
      const known = Math.min(1, f.known || 0), contacted = Math.min(known, f.contacted || 0), agreed = Math.min(contacted, f.agreed || 0);
      const segs = [[agreed, "var(--good)"], [contacted - agreed, "var(--warn)"], [known - contacted, "var(--sea)"], [1 - known, "#5c6a75"]];
      const bar = `<div style="display:flex;height:12px;border-radius:6px;overflow:hidden;border:1px solid var(--line);margin:8px 0 3px">` +
        segs.map(([w, c]) => w > 0.0005 ? `<i style="flex:${w};background:${c}"></i>` : "").join("") + `</div>` +
        `<div class="muted" style="font-size:11.5px;margin-bottom:4px">known ${pctL(known)}% · contacted ${pctL(contacted)}% · agreed ${pctL(agreed)}%` +
        (known < 0.999 ? ` · <b style="color:var(--terra)">missing ${pctL(1 - known)}%</b>` : agreed > 0.999 ? ` · <b style="color:var(--good)">ready to buy ✓</b>` : ` · all holders known ✓`) + `</div>`;
      return `<div style="border:1px solid var(--line);border-radius:8px;padding:10px;margin-top:10px">` +
        `<b class="loc" style="text-decoration:underline dotted" title="Open this folio's history in Activity" onclick="openFolio(${f.lr_unit_id})">Folio ${esc(f.unit_no || "?")}</b> ${eyeBtn("folio", f.lr_unit_id, "Folio " + (f.unit_no || "?") + " · " + (f.ko || ""), !!f.watched)} <span class="muted">· k.o. ${esc(f.ko || "?")}${f.parcels && f.parcels.length ? ` · parcel ${f.parcels.map(esc).join(", ")}` : ""}</span>` +
        (f.plomba ? ` <span class="chip" style="color:var(--crit)">⚠ plomba</span>` : "") +
        (f.read_at ? ` <span class="muted" style="font-size:11px">extract read ${esc(String(f.read_at).slice(0, 10))}</span>` : "") +
        bar + ((f.entries || []).map(ledgerRow).join("") || `<p class="muted" style="margin-top:6px">No holders recorded on this folio yet.</p>`) + `</div>`;
    }).join("");
  } catch (e) { el.innerHTML = `<p class="muted">Could not load the ledger: ${esc(e.message)}</p>`; }
}
window.djPersonStatus = async function (id, sel) {
  sel.disabled = true;
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=person_set`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ id, status: sel.value })
    });
    const d = await r.json(); if (d.error) throw new Error(d.error);
  } catch (e) { alert("Could not save the status: " + e.message); }
  loadLedger();
};
window.djLink = async function (entryId, personId, btn) {
  btn.disabled = true; btn.textContent = "linking…";
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=stake_link`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }), body: JSON.stringify({ entry_id: entryId, person_id: personId })
    });
    const d = await r.json(); if (d.error) throw new Error(d.error);
  } catch (e) { alert("Could not link: " + e.message); }
  loadLedger();
};
document.getElementById("lhAdd").onclick = async function () {
  const g = id => document.getElementById(id).value.trim();
  const msg = document.getElementById("lhMsg");
  const name = g("lhName");
  if (!name) { msg.textContent = "the holder's name is required"; return; }
  this.disabled = true; msg.textContent = "saving…";
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=ledger_add`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prospect_id: ppCur.id, unit_no: g("lhUnit") || null, name,
        share: g("lhShare") || null, address: g("lhAddr") || null, source: document.getElementById("lhSource").value })
    });
    const d = await r.json(); if (d.error) throw new Error(d.error);
    msg.textContent = "saved ✓";
    for (const id of ["lhName", "lhShare", "lhAddr"]) document.getElementById(id).value = "";
    loadLedger();
  } catch (e) { msg.textContent = "failed: " + e.message; }
  this.disabled = false;
};

async function loadHeirs() {
  const el = document.getElementById("ppHeirs");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const heirs = await api(`what=heirs&prospect=${ppCur.id}`, KEY);
    document.getElementById("ppHeirN").textContent = `(${heirs.length})`;
    ppCur.__heirs = heirs;
    el.innerHTML = heirs.length ? heirs.map(h =>
      `<div class="notice"><b>${esc(h.name)}</b>${h.share ? ` · ${esc(h.share)}` : ""}${h.relation ? ` <span class="muted">— ${esc(h.relation)}</span>` : ""}<br>` +
      `<span class="muted">${[h.country, h.language, h.phone, h.email].filter(Boolean).map(esc).join(" · ")}</span><br>` +
      `<span class="chip">POA: ${esc(h.poa || "none")}</span> <span class="chip">${esc(h.consent || "unknown")}</span></div>`
    ).join("") : `<p class="muted">No heirs recorded yet — add the first below.</p>`;
  } catch (e) { el.innerHTML = `<p class="muted">Could not load heirs: ${esc(e.message)}</p>`; }
}
document.getElementById("hAdd").onclick = async function () {
  const g = id => document.getElementById(id).value.trim();
  const name = g("hName");
  const msg = document.getElementById("hMsg");
  if (!name) { msg.textContent = "name is required"; return; }
  const contact = g("hContact");
  this.disabled = true; msg.textContent = "saving…";
  try {
    const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=heir_add`, {
      method: "POST", headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prospect_id: ppCur.id, name, relation: g("hRel") || null, share: g("hShare") || null,
        country: g("hCountry") || null, language: g("hLang") || null,
        phone: contact && !contact.includes("@") ? contact : null,
        email: contact.includes("@") ? contact : null,
        poa: document.getElementById("hPoa").value, consent: document.getElementById("hConsent").value })
    });
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    msg.textContent = "saved ✓";
    for (const id of ["hName", "hRel", "hShare", "hCountry", "hLang", "hContact"]) document.getElementById(id).value = "";
    document.getElementById("hPoa").value = "none"; document.getElementById("hConsent").value = "unknown";
    loadHeirs(); loadData();
  } catch (e) { msg.textContent = "failed: " + e.message; }
  this.disabled = false;
};
const PLEDGE = {
  hr: (heir, prop) => `Poštovani/a ${heir},\n\nobraćamo Vam se u vezi zemljišta "${prop}" koje je, prema javnim knjigama, još uvijek upisano na Vašu obitelj. Mi smo Djedovina — obiteljska tvrtka iz Klisa koja sređuje stare zemljišne knjige u splitskom kraju.\n\nNaše obećanje: ništa se ne događa bez Vašeg potpisa. Prvo o našem trošku provjeravamo stanje u zemljišnim knjigama i pripremimo Vam jasan pregled — tko je upisan, s kojim udjelom i što bi trebalo srediti. Vi odlučujete želite li prodati, zadržati ili samo urediti upis na svoje ime.\n\nAko želite razgovarati, javite se — na hrvatskom ili jeziku koji Vam je draži.\n\nSa štovanjem,\nDjedovina`,
  en: (heir, prop) => `Dear ${heir},\n\nWe are writing about the land "${prop}", which the public land registry still records in your family's name. We are Djedovina, a family firm from Klis that settles old land-registry entries around Split.\n\nOur pledge: nothing happens without your signature. First, at our own cost, we check the land registry and prepare a clear summary for you — who is recorded, with what share, and what would need to be put in order. You then decide whether to sell, keep, or simply register the land properly in your own name.\n\nIf you would like to talk, write back in whichever language suits you.\n\nWith respect,\nDjedovina`,
  de: (heir, prop) => `Sehr geehrte/r ${heir},\n\nwir schreiben Ihnen wegen des Grundstücks "${prop}", das im öffentlichen Grundbuch noch auf Ihre Familie eingetragen ist. Wir sind Djedovina, ein Familienunternehmen aus Klis, das alte Grundbucheinträge in der Region Split bereinigt.\n\nUnser Versprechen: Ohne Ihre Unterschrift geschieht nichts. Zuerst prüfen wir auf eigene Kosten das Grundbuch und erstellen für Sie eine klare Übersicht — wer eingetragen ist, mit welchem Anteil, und was zu ordnen wäre. Sie entscheiden dann, ob Sie verkaufen, behalten oder das Land einfach auf Ihren Namen eintragen lassen möchten.\n\nWenn Sie sprechen möchten, antworten Sie gern auf Deutsch.\n\nMit freundlichen Grüßen,\nDjedovina`,
  it: (heir, prop) => `Gentile ${heir},\n\nLe scriviamo riguardo al terreno "${prop}", che il registro fondiario pubblico riporta ancora a nome della Sua famiglia. Siamo Djedovina, un'impresa familiare di Klis che sistema le vecchie iscrizioni tavolari nella zona di Spalato.\n\nIl nostro impegno: senza la Sua firma non accade nulla. Per prima cosa, a nostre spese, verifichiamo il registro fondiario e prepariamo per Lei un quadro chiaro — chi è iscritto, con quale quota, e cosa andrebbe sistemato. Sarà poi Lei a decidere se vendere, tenere, o semplicemente intestare il terreno a Suo nome.\n\nSe desidera parlarne, ci risponda pure in italiano.\n\nCordiali saluti,\nDjedovina`
};
document.getElementById("plGen").onclick = () => {
  const lang = document.getElementById("plLang").value;
  const heir = document.getElementById("plName").value.trim() || ((ppCur.__heirs || [])[0]?.name) || "…";
  document.getElementById("plOut").value = PLEDGE[lang](heir, ppCur.name);
  document.getElementById("plMsg").textContent = "";
};
document.getElementById("plCopy").onclick = async () => {
  const t = document.getElementById("plOut").value;
  const msg = document.getElementById("plMsg");
  if (!t) { msg.textContent = "generate a letter first"; return; }
  try { await navigator.clipboard.writeText(t); msg.textContent = "copied ✓ — journalled"; }
  catch (e) { document.getElementById("plOut").select(); document.execCommand("copy"); msg.textContent = "copied ✓ — journalled"; }
  const lang = document.getElementById("plLang").value;
  const heir = document.getElementById("plName").value.trim() || ((ppCur.__heirs || [])[0]?.name) || "?";
  try { await api(`what=journal_add&prospect=${ppCur.id}&text=${encodeURIComponent(`Pledge letter (${lang}) prepared for ${heir} — map app`)}`, KEY); } catch (e) {}
};
function fmtSize(b) { return b == null ? "" : b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB"; }
async function loadDocs() {
  const el = document.getElementById("ppDocs");
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const docs = await api(`what=docs&prospect=${ppCur.id}`, KEY);
    document.getElementById("ppDocN").textContent = `(${docs.length})`;
    el.innerHTML = docs.length ? docs.map(d =>
      `<div class="notice">${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener"><b>${esc(d.file_name)}</b></a>` : `<b>${esc(d.file_name)}</b>`}` +
      ` <span class="muted">${fmtSize(d.size_bytes)} · ${esc((d.uploaded_at || "").slice(0, 10))}</span></div>`
    ).join("") : `<p class="muted">Vault is empty — upload the first extract or power of attorney below.</p>`;
  } catch (e) { el.innerHTML = `<p class="muted">Could not load documents: ${esc(e.message)}</p>`; }
}
document.getElementById("docUp").onclick = function () {
  const f = document.getElementById("docFile").files[0];
  const msg = document.getElementById("docMsg");
  if (!f) { msg.textContent = "choose a file first"; return; }
  if (f.size > 15 * 1024 * 1024) { msg.textContent = "too large — 15 MB max"; return; }
  const btn = this;
  btn.disabled = true; msg.textContent = "uploading…";
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const b64 = String(rd.result).split(",")[1];
      const r = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}&what=doc_upload`, {
        method: "POST", headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ prospect_id: ppCur.id, file_name: f.name, content_type: f.type || "application/octet-stream", data_base64: b64 })
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      msg.textContent = "stored ✓";
      document.getElementById("docFile").value = "";
      loadDocs(); loadData();
    } catch (e) { msg.textContent = "failed: " + e.message; }
    btn.disabled = false;
  };
  rd.onerror = () => { msg.textContent = "could not read the file"; btn.disabled = false; };
  rd.readAsDataURL(f);
};

