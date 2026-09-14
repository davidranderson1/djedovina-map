/* ---------- v19: contacts, meetings, documents, places and the natural-language Ask ----------
   Everyone the team meets (brokers, owners, heirs, lawyers, notaries, officials) is a contact;
   every meeting, call or visit is logged with who, when, where (a parcel, a prospect, or a
   named place such as "our house"), what was agreed and the next step; every paper is a
   document tied to the people and places it concerns. "Ask" answers questions like
   "tell me about the guy we met at our house back in September" with a profile card.
   Data lives in the crm edge function (same team key / sign-in as the map). */
const CRM_ENDPOINT = "https://zoojmmcdnyciadzktqnx.supabase.co/functions/v1/crm";
let crmMode = "ask", crmCard = null, crmAliases = [], crmAvailable = null;

async function crm(qs, body) {
  const headers = authHeaders(Object.assign({ "content-type": "application/json" }, KEY ? { "x-team-key": KEY } : {}));
  const r = await fetch(`${CRM_ENDPOINT}?${qs}`, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers });
  if (r.status === 401) throw new Error("unauthorized");
  if (r.status === 404 && !(await r.clone().text()).includes("unknown what")) throw new Error("not deployed");
  const d = await r.json();
  if (d && d.error) throw new Error(d.error);
  return d;
}
const CRM_KIND_ICON = { meeting: "🤝", call: "📞", email: "✉️", message: "💬", visit: "🏠", viewing: "🔑", note: "📝", other: "•" };
const CRM_CATS = ["owner", "heir", "family", "broker", "lawyer", "notary", "surveyor", "architect", "builder", "official", "bank", "buyer", "investor", "advisor", "team", "other"];
const fmtDay = (t, known = true) => t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zagreb" }) + (known === false ? "" : (String(t).length > 10 ? " " + new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zagreb" }) : "")) : "";
const tel = p => p ? `<a href="tel:${esc(String(p).replace(/[^+\d]/g, ""))}" title="Call">${esc(p)}</a>` : "";
const mail = e => e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : "";
const mapLink = (a, city) => a ? `<a href="https://www.google.com/maps/search/${encodeURIComponent(a + (city ? ", " + city : ""))}" target="_blank" rel="noopener" title="Open in Google Maps">${esc(a)}${city ? ", " + esc(city) : ""}</a>` : "";
const catChip = c => c ? `<span class="chip">${esc(c)}</span>` : "";

function crmNotDeployed(el) {
  el.innerHTML = `<div class="empty">The contacts service is not switched on yet — the database part of this feature is waiting for the Supabase connection (Open Items board, item 13). The screens are in place; nothing is lost.</div>`;
}
function crmFail(el, e) {
  if (e.message === "not deployed") return crmNotDeployed(el);
  el.innerHTML = `<div class="empty">Could not load: ${esc(e.message)}</div>`;
}

/* ---------- entry points ---------- */
document.getElementById("crmTabs").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  crmSetMode(b.dataset.m);
});
function crmSetMode(m, keepCard) {
  crmMode = m;
  if (!keepCard) crmCard = null;
  document.querySelectorAll("#crmTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === m));
  loadContacts();
}
document.getElementById("askBtn").onclick = () => { crmMode = "ask"; setView("contacts"); setTimeout(() => document.getElementById("askIn").focus(), 50); };
async function loadContacts() {
  const el = document.getElementById("crmBody");
  document.querySelectorAll("#crmTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === crmMode));
  document.getElementById("askBar").style.display = crmMode === "ask" ? "flex" : "none";
  if (crmCard) return renderCrmCard();
  try {
    if (crmMode === "ask") { el.innerHTML = document.getElementById("askIn").value.trim() ? "" : `<div class="empty">Ask in plain words — a name, a role, a place, a month.<br><span class="muted">Try: <i>tell me about the guy we met at our house back in September</i> · <i>who is the Sotheby's agent</i> · <i>meetings at our house last month</i> · <i>the contract from Sotheby's</i></span></div>`; if (document.getElementById("askIn").value.trim()) askGo(); return; }
    if (crmMode === "contacts") return renderContactList();
    if (crmMode === "meetings") return renderMeetingList();
    if (crmMode === "documents") return renderDocumentList();
    if (crmMode === "places") return renderPlaces();
  } catch (e) { crmFail(el, e); }
}

/* ---------- Ask ---------- */
document.getElementById("askGo").onclick = askGo;
document.getElementById("askIn").addEventListener("keydown", e => { if (e.key === "Enter") askGo(); });
document.getElementById("askChips").addEventListener("click", e => { const c = e.target.closest("[data-q]"); if (c) { document.getElementById("askIn").value = c.dataset.q; askGo(); } });
async function askGo() {
  const q = document.getElementById("askIn").value.trim();
  const el = document.getElementById("crmBody");
  if (!q) return;
  crmMode = "ask"; crmCard = null;
  document.querySelectorAll("#crmTabs button").forEach(x => x.classList.toggle("on", x.dataset.m === "ask"));
  document.getElementById("askBar").style.display = "flex";
  el.innerHTML = `<p class="muted">Thinking…</p>`;
  try {
    const d = await crm("what=ask", { q });
    const why = (d.parsed && d.parsed.explain && d.parsed.explain.length) ? `<details class="muted" style="font-size:12px;margin-top:6px"><summary style="cursor:pointer">how this was read</summary>${d.parsed.explain.map(esc).join(" · ")}</details>` : "";
    el.innerHTML = `<div class="evt" style="border-color:var(--olive)"><b>${esc(d.answer || "")}</b>${d.ai ? ` <span class="chip" title="Answer written by Claude from the records">AI</span>` : ""}${why}</div>` +
      ((d.contacts || []).length ? `<h3 style="font-size:14px;margin:12px 0 6px">People and organisations</h3>` + d.contacts.map(c => contactCardHtml(c, true)).join("") : "") +
      ((d.interactions || []).length ? `<h3 style="font-size:14px;margin:12px 0 6px">Meetings and calls</h3>` + d.interactions.map(i => interactionHtml(i)).join("") : "") +
      ((d.documents || []).length ? `<h3 style="font-size:14px;margin:12px 0 6px">Documents</h3>` + d.documents.map(docRow).join("") : "");
  } catch (e) { crmFail(el, e); }
}

/* ---------- cards ---------- */
function linkChip(l) {
  if (l.target_type === "parcel" && l.parcel && l.parcel.parcel_no) {
    const p = l.parcel;
    return `<span class="chip">${esc(p.parcel_no)} · ${esc(p.ko || "")} ${p.lat ? `<span class="loc" onclick="djLocate(${p.lat}, ${p.lon})" title="Show on the map">📍</span> ` : ""}<a href="${esc(regUrl(p.nat_ref))}" target="_blank" rel="noopener" title="State registry">⚖</a><span class="muted"> · ${esc(l.relation)}</span></span>`;
  }
  if (l.target_type === "prospect") return `<span class="chip"><b class="loc" onclick="openProspect(${l.target_id})" title="Open the prospect file">${esc(l.label || "Prospect " + l.target_id)}</b><span class="muted"> · ${esc(l.relation)}</span></span>`;
  if (l.target_type === "contact") return `<span class="chip"><b class="loc" onclick="crmOpenContact(${l.target_id})">${esc(l.label || "Contact " + l.target_id)}</b><span class="muted"> · ${esc(l.relation)}</span></span>`;
  if (l.target_type === "folio") return `<span class="chip"><b class="loc" onclick="openFolio(${l.target_id})">${esc(l.label || "Folio " + l.target_id)}</b><span class="muted"> · ${esc(l.relation)}</span></span>`;
  if (l.target_type === "person") return `<span class="chip"><b class="loc" onclick="pplFamily('${jsSafe(l.label || "")}', '')">${esc(l.label || "Person " + l.target_id)}</b><span class="muted"> · registry · ${esc(l.relation)}</span></span>`;
  return `<span class="chip">${esc(l.label || l.target_type + " " + l.target_id)}<span class="muted"> · ${esc(l.relation)}</span></span>`;
}
function refsHtml(r) {
  if (!r || typeof r !== "object") return "";
  const parts = [];
  if (r.hgk_register) parts.push(r.hgk_register_url ? `<a href="${esc(r.hgk_register_url)}" target="_blank" rel="noopener">HGK broker register ${esc(r.hgk_register)}</a>` : `HGK broker register ${esc(r.hgk_register)}`);
  if (r.hgk_agent) parts.push(`HGK agent ${esc(r.hgk_agent)}`);
  if (r.insurer) parts.push(`insured with ${esc(r.insurer)}`);
  if (r.company_oib) parts.push(`OIB ${esc(r.company_oib)}`);
  return parts.length ? `<div class="muted" style="font-size:12px;margin-top:4px">${parts.join(" · ")}</div>` : "";
}
function contactCardHtml(c, compact) {
  const org = c.organisation ? `<span class="muted"> · </span><b class="loc" onclick="crmOpenContact(${c.organisation.id})" title="Open the organisation">${esc(c.organisation.name)}</b>` : "";
  const head = `<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
      <h3 style="font-size:16px;margin:0"><b class="loc" onclick="crmOpenContact(${c.id})">${c.kind === "organisation" ? "🏢 " : "👤 "}${esc(c.name)}</b></h3>
      ${catChip(c.category)}${(c.tags || []).filter(t => t !== c.category).slice(0, 4).map(t => `<span class="chip muted">${esc(t)}</span>`).join("")}
      <span class="spacer" style="flex:1"></span>
      <button style="font-size:12px" onclick="crmLogMeeting(${c.id}, '${jsSafe(c.name)}')">+ Log a meeting</button>
      <button style="font-size:12px" onclick="crmEditContact(${c.id})">✎ Edit</button></div>
    <div style="margin-top:2px">${c.role_title ? esc(c.role_title) : ""}${org}</div>
    <div class="muted" style="font-size:13px;margin-top:4px">${[tel(c.phone), tel(c.phone2), mail(c.email), c.website ? `<a href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, ""))}</a>` : "", mapLink(c.address, c.city), c.language ? "speaks " + esc(c.language) : ""].filter(Boolean).join(" · ")}</div>
    ${refsHtml(c.registry_refs)}
    ${c.how_we_met ? `<div style="margin-top:6px"><span class="muted">How we met:</span> ${esc(c.how_we_met)}</div>` : ""}`;
  const links = (c.links || []).length ? `<div style="margin-top:6px"><span class="muted">Tied to:</span> ${c.links.map(linkChip).join(" ")}</div>` : "";
  const people = (c.people || []).length ? `<div style="margin-top:6px"><span class="muted">People here:</span> ${c.people.map(p => `<span class="chip"><b class="loc" onclick="crmOpenContact(${p.id})">${esc(p.name)}</b>${p.role_title ? ` <span class="muted">· ${esc(p.role_title)}</span>` : ""}</span>`).join(" ")}</div>` : "";
  const ints = (c.interactions || []);
  const intHtml = ints.length ? `<div style="margin-top:8px"><span class="muted">Meetings and calls (${ints.length}):</span>` +
    ints.slice(0, compact ? 3 : 50).map(i => `<div class="notice">${CRM_KIND_ICON[i.kind] || "•"} <span class="when muted">${esc(fmtDay(i.occurred_at, i.time_known))}</span> — <b class="loc" onclick="crmOpenInteraction(${i.id})">${esc(i.title)}</b>${i.location_text ? ` <span class="muted">· ${esc(i.location_text)}</span>` : ""}${(i.others || []).length ? ` <span class="muted">· with ${i.others.map(o => esc(o.name)).join(", ")}</span>` : ""}` +
      (i.summary && !compact ? `<br><span style="font-size:13px">${esc(i.summary)}</span>` : "") +
      (i.next_step && !i.next_step_done ? `<br><span style="color:var(--warn)">Next: ${esc(i.next_step)}${i.next_step_due ? " · by " + esc(fmtDay(i.next_step_due, false)) : ""}</span> <button class="eye" onclick="crmDone(${i.id}, this)" title="Mark the next step done">✓ done</button>` : "") +
      ((i.documents || []).length ? `<br>${i.documents.map(d => docChip(d)).join(" ")}` : "") + `</div>`).join("") +
    (compact && ints.length > 3 ? `<div class="muted" style="font-size:12px">… ${ints.length - 3} more — open the card</div>` : "") + `</div>` : "";
  const docs = (c.documents || []).length && !compact ? `<div style="margin-top:8px"><span class="muted">Documents (${c.documents.length}):</span> ${c.documents.map(d => docChip(d)).join(" ")}</div>` : "";
  const notes = c.notes ? (compact ? `<details class="muted" style="font-size:12.5px;margin-top:6px"><summary style="cursor:pointer">notes</summary>${esc(c.notes)}</details>` : `<div class="muted" style="font-size:13px;margin-top:8px;white-space:pre-wrap">${esc(c.notes)}</div>`) : "";
  return `<div class="evt">${head}${links}${people}${intHtml}${docs}${notes}</div>`;
}
function docChip(d) {
  const url = d.external_url || (d.storage_path ? `javascript:crmVaultOpen('${jsSafe(d.storage_path)}')` : "");
  return `<span class="chip">📄 ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(d.title)}</a>` : esc(d.title)}<span class="muted"> · ${esc(d.kind)}${d.status ? ", " + esc(d.status) : ""}${d.issued_on ? " · " + esc(fmtDay(d.issued_on, false)) : ""}</span></span>`;
}
function docRow(d) {
  return `<div class="notice">${docChip(d)}${d.contact_name ? ` <span class="muted">· ${esc(d.contact_name)}</span>` : ""}${d.summary ? `<br><span style="font-size:13px">${esc(d.summary)}</span>` : ""}${d.key_terms && Object.keys(d.key_terms).length ? `<br><span class="muted" style="font-size:12px">${Object.entries(d.key_terms).filter(([k]) => !/url/.test(k)).map(([k, v]) => esc(k.replace(/_/g, " ")) + ": " + esc(String(v))).join(" · ")}</span>` : ""}</div>`;
}
window.crmVaultOpen = async function (path) {
  try { const d = await crm(`what=document_url&path=${encodeURIComponent(path)}`); window.open(d.url, "_blank", "noopener"); }
  catch (e) { alert("Could not open the document: " + e.message); }
};
function interactionHtml(i, full) {
  const who = (i.participants || []).map(p => `<b class="loc" onclick="crmOpenContact(${p.id})">${esc(p.name)}</b>${p.role === "us" ? " <span class='muted'>(us)</span>" : p.role === "host" ? " <span class='muted'>(host)</span>" : ""}`).join(", ");
  const where = i.location_text ? `${i.lat ? `<span class="loc" onclick="djLocate(${i.lat}, ${i.lon})" title="Show on the map">📍</span> ` : ""}${esc(i.location_text)}` : "";
  return `<div class="evt"><div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
      <span style="font-size:18px">${CRM_KIND_ICON[i.kind] || "•"}</span>
      <h3 style="font-size:15px;margin:0"><b class="loc" onclick="crmOpenInteraction(${i.id})">${esc(i.title)}</b></h3>
      <span class="when muted">${esc(fmtDay(i.occurred_at, i.time_known))}${i.time_known === false ? " (time not recorded)" : ""}</span>
      <span class="spacer" style="flex:1"></span>
      <button style="font-size:12px" onclick="crmEditInteraction(${i.id})">✎ Edit</button></div>
    ${who ? `<div style="margin-top:4px"><span class="muted">Who:</span> ${who}</div>` : ""}
    ${where ? `<div><span class="muted">Where:</span> ${where}</div>` : ""}
    ${i.summary ? `<div style="margin-top:6px">${esc(i.summary)}</div>` : ""}
    ${full && i.details ? `<div class="muted" style="margin-top:6px;white-space:pre-wrap;font-size:13px">${esc(i.details)}</div>` : ""}
    ${i.outcome ? `<div style="margin-top:6px"><span class="muted">Outcome:</span> ${esc(i.outcome)}</div>` : ""}
    ${i.next_step ? `<div style="margin-top:6px;color:${i.next_step_done ? "var(--ink2)" : "var(--warn)"}"><span class="muted">Next step:</span> ${i.next_step_done ? "<s>" : ""}${esc(i.next_step)}${i.next_step_done ? "</s> ✓" : ""}${i.next_step_due ? ` <span class="muted">· by ${esc(fmtDay(i.next_step_due, false))}</span>` : ""} ${!i.next_step_done ? `<button class="eye" onclick="crmDone(${i.id}, this)" title="Mark done">✓ done</button>` : ""}</div>` : ""}
    ${(i.links || []).length ? `<div style="margin-top:6px"><span class="muted">Tied to:</span> ${i.links.map(linkChip).join(" ")}</div>` : ""}
    ${(i.documents || []).length ? `<div style="margin-top:6px"><span class="muted">Documents:</span> ${i.documents.map(docChip).join(" ")}</div>` : ""}
  </div>`;
}
window.crmDone = async function (id, btn) {
  btn.disabled = true;
  try { await crm("what=interaction_done", { id, done: true }); btn.textContent = "done ✓"; }
  catch (e) { alert("Could not update: " + e.message); btn.disabled = false; }
};
window.crmOpenContact = async function (id) {
  crmCard = { type: "contact", id };
  if (!document.getElementById("contactsView").classList.contains("open")) setView("contacts"); else renderCrmCard();
};
window.crmOpenInteraction = async function (id) {
  crmCard = { type: "interaction", id };
  if (!document.getElementById("contactsView").classList.contains("open")) setView("contacts"); else renderCrmCard();
};
async function renderCrmCard() {
  const el = document.getElementById("crmBody");
  document.getElementById("askBar").style.display = "none";
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const back = `<button style="margin-bottom:10px" onclick="crmCard=null; loadContacts()">← Back</button>`;
    if (crmCard.type === "contact") { const c = await crm(`what=contact&id=${crmCard.id}`); el.innerHTML = back + contactCardHtml(c, false); }
    else { const i = await crm(`what=interaction&id=${crmCard.id}`); el.innerHTML = back + interactionHtml(i, true); }
  } catch (e) { crmFail(el, e); }
}

/* ---------- lists ---------- */
async function renderContactList() {
  const el = document.getElementById("crmBody");
  el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px" id="cBar">
      <input id="cq" placeholder="Name, organisation, role, tag…" style="min-width:260px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off">
      <select id="ccat" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">Any category</option>${CRM_CATS.map(c => `<option>${c}</option>`).join("")}</select>
      <select id="ckind" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">People and organisations</option><option value="person">People</option><option value="organisation">Organisations</option></select>
      <button id="cGo">Search</button><span class="spacer" style="flex:1"></span>
      <button class="add" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:7px 12px;border-radius:6px;cursor:pointer" onclick="crmEditContact(null)">+ New contact</button>
    </div><div id="cList"><p class="muted">Loading…</p></div>`;
  const go = async () => {
    const list = document.getElementById("cList");
    try {
      const rows = await crm(`what=contacts&q=${encodeURIComponent(document.getElementById("cq").value.trim())}&category=${encodeURIComponent(document.getElementById("ccat").value)}&kind=${encodeURIComponent(document.getElementById("ckind").value)}&limit=300`);
      document.getElementById("crmN").textContent = rows.length ? `(${rows.length})` : "";
      list.innerHTML = rows.length ? `<div class="tblwrap"><table><thead><tr><th>Name</th><th>Role · organisation</th><th>Category</th><th>Phone</th><th>Email</th><th>City</th><th>Last contact</th><th></th></tr></thead><tbody>` +
        rows.map(r => `<tr>
          <td><b class="loc" style="text-decoration:underline dotted" onclick="crmOpenContact(${r.id})">${r.kind === "organisation" ? "🏢 " : ""}${esc(r.name)}</b></td>
          <td>${esc(r.role_title || "")}${r.organisation ? `<br><span class="muted">${esc(r.organisation)}</span>` : ""}</td>
          <td>${catChip(r.category)}</td><td>${tel(r.phone)}</td><td>${mail(r.email)}</td><td class="muted">${esc(r.city || "")}</td>
          <td class="muted">${r.last_contact ? esc(fmtDay(r.last_contact, false)) : "—"}</td>
          <td style="white-space:nowrap"><button class="eye" onclick="crmLogMeeting(${r.id}, '${jsSafe(r.name)}')" title="Log a meeting or call with this contact">🤝</button> <button class="eye" onclick="crmEditContact(${r.id})" title="Edit">✎</button></td>
        </tr>`).join("") + `</tbody></table></div>` : `<div class="empty">No contacts yet — add the first with <b>+ New contact</b>, or log a meeting and the people in it are created automatically.</div>`;
    } catch (e) { crmFail(list, e); }
  };
  document.getElementById("cGo").onclick = go;
  document.getElementById("cq").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  document.getElementById("ccat").addEventListener("change", go);
  document.getElementById("ckind").addEventListener("change", go);
  go();
}
async function renderMeetingList() {
  const el = document.getElementById("crmBody");
  el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="mq" placeholder="Title, person, place…" style="min-width:260px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off">
      <select id="msince" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last year</option></select>
      <label class="muted" style="display:flex;gap:5px;align-items:center;font-size:13px"><input type="checkbox" id="mopen"> open next steps only</label>
      <button id="mGo">Search</button><span class="spacer" style="flex:1"></span>
      <button class="add" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:7px 12px;border-radius:6px;cursor:pointer" onclick="crmLogMeeting(null)">+ Log a meeting</button>
    </div><div id="mList"><p class="muted">Loading…</p></div>`;
  const go = async () => {
    const list = document.getElementById("mList");
    try {
      const days = document.getElementById("msince").value;
      const since = days ? new Date(Date.now() - (+days) * 864e5).toISOString() : "";
      const rows = await crm(`what=interactions&q=${encodeURIComponent(document.getElementById("mq").value.trim())}&since=${encodeURIComponent(since)}&open=${document.getElementById("mopen").checked ? "1" : "0"}&limit=200`);
      document.getElementById("crmN").textContent = rows.length ? `(${rows.length})` : "";
      list.innerHTML = rows.length ? `<div class="tblwrap"><table><thead><tr><th>When</th><th></th><th>What</th><th>Who</th><th>Where</th><th>Next step</th><th></th></tr></thead><tbody>` +
        rows.map(r => `<tr>
          <td class="muted" style="white-space:nowrap">${esc(fmtDay(r.occurred_at, r.time_known))}</td><td>${CRM_KIND_ICON[r.kind] || "•"}</td>
          <td><b class="loc" style="text-decoration:underline dotted" onclick="crmOpenInteraction(${r.id})">${esc(r.title)}</b>${r.summary ? `<br><span class="muted" style="font-size:12.5px">${esc(r.summary.slice(0, 140))}${r.summary.length > 140 ? "…" : ""}</span>` : ""}</td>
          <td>${(r.participants || []).filter(p => p.role !== "us").map(p => `<b class="loc" onclick="crmOpenContact(${p.id})">${esc(p.name)}</b>`).join(", ")}</td>
          <td class="muted">${r.lat ? `<span class="loc" onclick="djLocate(${r.lat}, ${r.lon})">📍</span> ` : ""}${esc(r.location_text || "")}</td>
          <td>${r.next_step ? (r.next_step_done ? `<s class="muted">${esc(r.next_step)}</s>` : `<span style="color:var(--warn)">${esc(r.next_step)}</span>${r.next_step_due ? `<br><span class="muted">by ${esc(fmtDay(r.next_step_due, false))}</span>` : ""}`) : ""}</td>
          <td style="white-space:nowrap">${r.next_step && !r.next_step_done ? `<button class="eye" onclick="crmDone(${r.id}, this)" title="Mark the next step done">✓</button> ` : ""}<button class="eye" onclick="crmEditInteraction(${r.id})" title="Edit">✎</button></td>
        </tr>`).join("") + `</tbody></table></div>` : `<div class="empty">No meetings logged for this selection yet.</div>`;
    } catch (e) { crmFail(list, e); }
  };
  document.getElementById("mGo").onclick = go;
  document.getElementById("mq").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  document.getElementById("msince").addEventListener("change", go);
  document.getElementById("mopen").addEventListener("change", go);
  go();
}
async function renderDocumentList() {
  const el = document.getElementById("crmBody");
  el.innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <input id="dq" placeholder="Title, person, kind…" style="min-width:260px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off">
      <button id="dGo">Search</button><span class="spacer" style="flex:1"></span>
      <button class="add" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:7px 12px;border-radius:6px;cursor:pointer" onclick="crmAddDocument()">+ Add a document link</button>
    </div><div id="dList"><p class="muted">Loading…</p></div>`;
  const go = async () => {
    const list = document.getElementById("dList");
    try {
      const rows = await crm(`what=documents&q=${encodeURIComponent(document.getElementById("dq").value.trim())}`);
      document.getElementById("crmN").textContent = rows.length ? `(${rows.length})` : "";
      list.innerHTML = rows.length ? rows.map(docRow).join("") : `<div class="empty">No documents yet. Add a Drive link here, or attach documents when logging a meeting. Files uploaded to a prospect's vault stay there; link them from the prospect file.</div>`;
    } catch (e) { crmFail(list, e); }
  };
  document.getElementById("dGo").onclick = go;
  document.getElementById("dq").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  go();
}
async function renderPlaces() {
  const el = document.getElementById("crmBody");
  el.innerHTML = `<p class="muted" style="margin-bottom:8px">Named places let you ask in your own words — "our house", "the Klis plot", "Alma's office". Each alias points at a parcel, a prospect, or a map position, so meetings logged there tie themselves to the right records.</p><div id="plList"><p class="muted">Loading…</p></div>
    <div class="card" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;margin-top:12px">
      <h4 style="font-size:14px;margin-bottom:8px">Add a named place</h4>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <input id="alAlias" placeholder="What you call it (e.g. our house)" style="min-width:220px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">
        <input id="alLabel" placeholder="Label shown on cards" style="min-width:220px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">
        <span class="acwrap"><input id="alParcel" placeholder="Parcel no. (e.g. 1245/4) — pick the municipality" style="min-width:250px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off"><div class="ac" id="alParcelAc"></div></span>
        <select id="alProspect" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">— or a prospect —</option>${opsData.map(o => `<option value="${o.id}" data-lat="${o.lat || ""}" data-lon="${o.lon || ""}">${esc(o.name)}</option>`).join("")}</select>
        <button id="alCentre" title="Use the centre of the map as the position">📍 map centre</button>
        <button id="alSave" class="add" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:7px 12px;border-radius:6px;cursor:pointer">Save place</button>
        <span id="alMsg" class="muted" style="font-size:12px"></span>
      </div></div>`;
  const list = document.getElementById("plList");
  const load = async () => {
    try {
      const rows = await crm("what=aliases"); crmAliases = rows;
      list.innerHTML = rows.length ? `<div class="tblwrap"><table><thead><tr><th>You say</th><th>Means</th><th>Parcel</th><th>Prospect</th><th></th></tr></thead><tbody>` +
        rows.map(a => `<tr><td><b>${esc(a.alias)}</b></td><td>${esc(a.label)}</td><td>${a.parcel_id ? `parcel ${a.parcel_id}` : ""}${a.lat ? ` <span class="loc" onclick="djLocate(${a.lat}, ${a.lon})">📍</span>` : ""}</td><td>${a.prospect_id ? `<b class="loc" onclick="openProspect(${a.prospect_id})">prospect ${a.prospect_id}</b>` : ""}</td><td><button class="eye" onclick="crmAliasDelete(${a.id})" title="Remove">✕</button></td></tr>`).join("") + `</tbody></table></div>` : `<div class="empty">No named places yet.</div>`;
    } catch (e) { crmFail(list, e); }
  };
  let picked = null;
  bindAutocomplete("alParcel", "alParcelAc", null, pick => { if (pick.parcel) { picked = pick.parcel; document.getElementById("alParcel").value = `${pick.parcel.parcel_no} · ${pick.parcel.ko}`; if (!document.getElementById("alLabel").value) document.getElementById("alLabel").value = `Parcel ${pick.parcel.parcel_no}, ${pick.parcel.ko}`; } });
  document.getElementById("alCentre").onclick = () => { const c = map.getCenter(); picked = { lat: c.lat, lon: c.lng }; document.getElementById("alMsg").textContent = `position ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`; };
  document.getElementById("alSave").onclick = async () => {
    const alias = document.getElementById("alAlias").value.trim(), msg = document.getElementById("alMsg");
    if (!alias) { msg.textContent = "say what you call it"; return; }
    const pr = document.getElementById("alProspect"); const opt = pr.selectedOptions[0];
    const body = { alias, label: document.getElementById("alLabel").value.trim() || alias, parcel_id: picked && picked.id ? picked.id : null, prospect_id: pr.value || null,
      lat: picked ? picked.lat : (opt && opt.dataset.lat ? +opt.dataset.lat : null), lon: picked ? picked.lon : (opt && opt.dataset.lon ? +opt.dataset.lon : null) };
    msg.textContent = "saving…";
    try { await crm("what=alias_save", body); msg.textContent = "saved ✓"; document.getElementById("alAlias").value = ""; document.getElementById("alLabel").value = ""; document.getElementById("alParcel").value = ""; picked = null; load(); }
    catch (e) { msg.textContent = "failed: " + e.message; }
  };
  load();
}
window.crmAliasDelete = async function (id) { try { await crm("what=alias_delete", { id }); renderPlaces(); } catch (e) { alert(e.message); } };

/* ---------- forms: contact ---------- */
const fld = (id, label, ph, type) => `<label class="muted" style="display:block;font-size:12px">${label}<input id="${id}" type="${type || "text"}" placeholder="${esc(ph || "")}" style="width:100%;margin-top:3px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off"></label>`;
const area = (id, label, ph, rows) => `<label class="muted" style="display:block;font-size:12px;grid-column:1/-1">${label}<textarea id="${id}" rows="${rows || 3}" placeholder="${esc(ph || "")}" style="width:100%;margin-top:3px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"></textarea></label>`;
const sel = (id, label, opts) => `<label class="muted" style="display:block;font-size:12px">${label}<select id="${id}" style="width:100%;margin-top:3px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">${opts.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join("")}</select></label>`;
const v = id => document.getElementById(id).value.trim();
window.crmEditContact = async function (id) {
  const el = document.getElementById("crmBody");
  document.getElementById("askBar").style.display = "none";
  let c = { kind: "person", category: "other", tags: [] };
  if (id) { try { c = await crm(`what=contact&id=${id}`); } catch (e) { return crmFail(el, e); } }
  el.innerHTML = `<button style="margin-bottom:10px" onclick="crmCard=${id ? `{type:'contact',id:${id}}` : "null"}; loadContacts()">← Back</button>
    <div class="card" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;max-width:900px">
      <h3 style="font-size:15px;margin-bottom:10px">${id ? "Edit contact" : "New contact"}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${sel("cfKind", "Type", [["person", "Person"], ["organisation", "Organisation"]])}
        ${fld("cfName", "Name *", "Full name or company name")}
        ${sel("cfCat", "Category", CRM_CATS)}
        ${fld("cfRole", "Role / title", "e.g. Director, managing partner")}
        <span class="acwrap" style="display:block">${fld("cfOrg", "Organisation", "Start typing — pick or leave a new name")}<div class="ac" id="cfOrgAc"></div></span>
        ${fld("cfLang", "Language", "hr, en, de…")}
        ${fld("cfPhone", "Phone", "+385 …")}
        ${fld("cfPhone2", "Second phone", "")}
        ${fld("cfEmail", "Email", "")}
        ${fld("cfWeb", "Website", "https://…")}
        ${fld("cfAddr", "Address", "Street and number")}
        ${fld("cfCity", "City", "")}
        ${fld("cfTags", "Tags (comma separated)", "broker, sotheby's, kučine")}
        ${area("cfMet", "How we met", "When, where and through whom", 2)}
        ${area("cfNotes", "Notes", "Anything worth remembering — licences, what they said, who they know", 4)}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="add" id="cfSave" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer">Save contact</button>
        ${id ? `<button id="cfDel" style="color:var(--crit)">Delete</button>` : ""}
        <span id="cfMsg" class="muted" style="font-size:12px"></span>
      </div></div>`;
  document.getElementById("cfKind").value = c.kind || "person";
  document.getElementById("cfName").value = c.name || "";
  document.getElementById("cfCat").value = c.category || "other";
  document.getElementById("cfRole").value = c.role_title || "";
  document.getElementById("cfOrg").value = c.organisation ? c.organisation.name : "";
  document.getElementById("cfLang").value = c.language || "";
  document.getElementById("cfPhone").value = c.phone || ""; document.getElementById("cfPhone2").value = c.phone2 || "";
  document.getElementById("cfEmail").value = c.email || ""; document.getElementById("cfWeb").value = c.website || "";
  document.getElementById("cfAddr").value = c.address || ""; document.getElementById("cfCity").value = c.city || "";
  document.getElementById("cfTags").value = (c.tags || []).join(", ");
  document.getElementById("cfMet").value = c.how_we_met || ""; document.getElementById("cfNotes").value = c.notes || "";
  let orgId = c.organisation ? c.organisation.id : null;
  crmBindContactAc("cfOrg", "cfOrgAc", "organisation", pick => { orgId = pick.id; document.getElementById("cfOrg").value = pick.name; });
  document.getElementById("cfOrg").addEventListener("input", () => { orgId = null; });
  document.getElementById("cfSave").onclick = async () => {
    const msg = document.getElementById("cfMsg");
    if (!v("cfName")) { msg.textContent = "name is required"; return; }
    msg.textContent = "saving…";
    try {
      const d = await crm("what=contact_save", { id: id || null, kind: v("cfKind"), name: v("cfName"), category: v("cfCat"), role_title: v("cfRole"),
        organisation_id: orgId, organisation_name: orgId ? null : v("cfOrg") || null, language: v("cfLang"), phone: v("cfPhone"), phone2: v("cfPhone2"), email: v("cfEmail"), website: v("cfWeb"),
        address: v("cfAddr"), city: v("cfCity"), tags: v("cfTags"), how_we_met: v("cfMet"), notes: v("cfNotes"), registry_refs: c.registry_refs || {} });
      crmCard = { type: "contact", id: d.id }; renderCrmCard();
    } catch (e) { msg.textContent = "failed: " + e.message; }
  };
  if (id) document.getElementById("cfDel").onclick = async () => {
    if (!confirm(`Delete ${c.name}? Their meetings stay; they are removed from them.`)) return;
    try { await crm("what=contact_delete", { id }); crmCard = null; crmMode = "contacts"; loadContacts(); } catch (e) { alert(e.message); }
  };
};
function crmBindContactAc(inputId, boxId, kind, onPick) {
  const inp = document.getElementById(inputId), box = document.getElementById(boxId);
  let t = null, seq = 0;
  const hide = () => { box.style.display = "none"; box.innerHTML = ""; };
  inp.addEventListener("input", () => {
    clearTimeout(t);
    const q = inp.value.trim(); if (!q) { hide(); return; }
    t = setTimeout(async () => {
      const my = ++seq;
      try {
        const d = await crm(`what=suggest&q=${encodeURIComponent(q)}`);
        if (my !== seq) return;
        const rows = (d.contacts || []).filter(c => !kind || c.kind === kind);
        if (!rows.length) { hide(); return; }
        box.innerHTML = rows.map((c, i) => `<div data-i="${i}">${c.kind === "organisation" ? "🏢 " : "👤 "}<b>${esc(c.name)}</b>${c.role_title ? ` <span class="muted">· ${esc(c.role_title)}</span>` : ""}</div>`).join("");
        box.style.display = "block";
        box.querySelectorAll("div[data-i]").forEach(row => { row.onclick = () => { hide(); onPick(rows[+row.dataset.i]); }; });
      } catch (e) { hide(); }
    }, 200);
  });
  inp.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
  document.addEventListener("click", e => { if (!e.target.closest("#" + boxId) && e.target !== inp) hide(); });
}

/* ---------- forms: meeting ---------- */
window.crmLogMeeting = function (contactId, contactName) { crmEditInteraction(null, contactId ? [{ contact_id: contactId, name: contactName, role: "counterparty" }] : []); };
window.crmEditInteraction = async function (id, presetParticipants) {
  const el = document.getElementById("crmBody");
  if (!document.getElementById("contactsView").classList.contains("open")) { setView("contacts"); }
  document.getElementById("askBar").style.display = "none";
  let i = { kind: "meeting", time_known: true, participants: presetParticipants || [], links: [], documents: [] };
  if (id) { try { i = await crm(`what=interaction&id=${id}`); } catch (e) { return crmFail(el, e); } }
  try { crmAliases = await crm("what=aliases"); } catch (e) { crmAliases = []; }
  const parts = (i.participants || []).map(p => ({ contact_id: p.contact_id || p.id, name: p.name, role: p.role || "counterparty" }));
  const localNow = t => { const d = t ? new Date(t) : new Date(); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); };
  el.innerHTML = `<button style="margin-bottom:10px" onclick="crmCard=${id ? `{type:'interaction',id:${id}}` : "null"}; loadContacts()">← Back</button>
    <div class="card" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;max-width:960px">
      <h3 style="font-size:15px;margin-bottom:10px">${id ? "Edit meeting" : "Log a meeting, call or visit"}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
        ${sel("mfKind", "What", [["meeting", "🤝 Meeting"], ["visit", "🏠 Visit / site walk"], ["call", "📞 Phone call"], ["email", "✉️ Email"], ["message", "💬 Message"], ["viewing", "🔑 Viewing"], ["note", "📝 Note"], ["other", "Other"]])}
        ${fld("mfWhen", "When", "", "datetime-local")}
        <label class="muted" style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:18px"><input type="checkbox" id="mfTimeKnown" checked> exact time known</label>
        <span style="grid-column:1/-1">${fld("mfTitle", "Title *", "e.g. Sotheby's valuation visit — Hrvoje's house")}</span>
        <div style="grid-column:1/-1">
          <div class="muted" style="font-size:12px">Who was there</div>
          <div id="mfParts" style="margin:4px 0"></div>
          <span class="acwrap"><input id="mfWho" placeholder="Type a name — pick an existing contact or add a new person" style="min-width:360px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off"><div class="ac" id="mfWhoAc"></div></span>
          <select id="mfWhoRole" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="counterparty">the other side</option><option value="host">host / owner</option><option value="us">us</option><option value="observer">observer</option></select>
          <select id="mfWhoCat" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" title="Category for a new person">${CRM_CATS.map(c => `<option>${c}</option>`).join("")}</select>
          <button id="mfWhoAdd">+ add</button>
        </div>
        <div style="grid-column:1/-1">
          <div class="muted" style="font-size:12px">Where</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:4px">
            <select id="mfAlias" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">— a named place —</option>${crmAliases.map(a => `<option value="${esc(a.alias)}">${esc(a.label)} (${esc(a.alias)})</option>`).join("")}</select>
            <span class="acwrap"><input id="mfParcel" placeholder="or a parcel no. (e.g. 1245/4)" style="min-width:230px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" autocomplete="off"><div class="ac" id="mfParcelAc"></div></span>
            <select id="mfProspect" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px"><option value="">— or a prospect —</option>${opsData.map(o => `<option value="${o.id}" data-lat="${o.lat || ""}" data-lon="${o.lon || ""}">${esc(o.name)}</option>`).join("")}</select>
            <input id="mfWhere" placeholder="or describe the place (office, café, phone)" style="min-width:280px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">
            <input id="mfNewAlias" placeholder="save this place as… (e.g. Marko's office)" style="min-width:230px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px" title="Give the place a name you will use when asking questions">
          </div>
        </div>
        ${area("mfSummary", "What happened (one paragraph)", "Who came, what they wanted, what they showed or left behind", 3)}
        ${area("mfDetails", "Details (optional)", "Figures, terms, quotes, who said what", 4)}
        ${area("mfOutcome", "Outcome / what was agreed", "", 2)}
        ${fld("mfNext", "Next step", "What happens next, and who does it")}
        ${fld("mfDue", "Next step due", "", "date")}
        <label class="muted" style="display:flex;gap:6px;align-items:center;font-size:12px;margin-top:18px"><input type="checkbox" id="mfNextDone"> next step done</label>
        <div style="grid-column:1/-1">
          <div class="muted" style="font-size:12px">Documents received or sent (links)</div>
          <div id="mfDocs" style="margin:4px 0"></div>
          <input id="mfDocTitle" placeholder="Document title" style="min-width:260px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">
          <input id="mfDocUrl" placeholder="Drive or web link" style="min-width:300px;background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">
          <select id="mfDocKind" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;color:var(--ink);padding:7px 8px">${["contract", "draft", "valuation", "extract", "permit", "letter", "offer", "invoice", "photo", "report", "other"].map(k => `<option>${k}</option>`).join("")}</select>
          <button id="mfDocAdd">+ add</button>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center">
        <button class="add" id="mfSave" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer">Save</button>
        ${id ? `<button id="mfDel" style="color:var(--crit)">Delete</button>` : ""}
        <span id="mfMsg" class="muted" style="font-size:12px"></span>
      </div></div>`;
  document.getElementById("mfKind").value = i.kind || "meeting";
  document.getElementById("mfWhen").value = localNow(i.occurred_at);
  document.getElementById("mfTimeKnown").checked = i.time_known !== false;
  document.getElementById("mfTitle").value = i.title || "";
  document.getElementById("mfWhere").value = i.location_text || "";
  document.getElementById("mfSummary").value = i.summary || ""; document.getElementById("mfDetails").value = i.details || "";
  document.getElementById("mfOutcome").value = i.outcome || ""; document.getElementById("mfNext").value = i.next_step || "";
  document.getElementById("mfDue").value = i.next_step_due || ""; document.getElementById("mfNextDone").checked = !!i.next_step_done;
  if (i.prospect_id) document.getElementById("mfProspect").value = String(i.prospect_id);
  let parcel = i.parcel ? { id: i.parcel.parcel_id, lat: i.parcel.lat, lon: i.parcel.lon, parcel_no: i.parcel.parcel_no, ko: i.parcel.ko } : (i.parcel_id ? { id: i.parcel_id, lat: i.lat, lon: i.lon } : null);
  if (parcel && parcel.parcel_no) document.getElementById("mfParcel").value = `${parcel.parcel_no} · ${parcel.ko}`;
  const docs = [];
  const drawParts = () => { document.getElementById("mfParts").innerHTML = parts.map((p, k) => `<span class="chip">${p.contact_id ? "" : "✦ new: "}<b>${esc(p.name)}</b> <span class="muted">· ${esc(p.role === "counterparty" ? "the other side" : p.role)}</span> <span class="loc" onclick="this.closest('.chip').remove(); crmParts.splice(${k},1); crmDrawParts()" title="Remove">✕</span></span>`).join(" ") || `<span class="muted" style="font-size:12px">nobody yet</span>`; };
  window.crmParts = parts; window.crmDrawParts = drawParts; drawParts();
  const drawDocs = () => { document.getElementById("mfDocs").innerHTML = docs.map((d, k) => `<span class="chip">📄 ${esc(d.title)} <span class="muted">· ${esc(d.kind)}</span> <span class="loc" onclick="crmDocs.splice(${k},1); crmDrawDocs()">✕</span></span>`).join(" "); };
  window.crmDocs = docs; window.crmDrawDocs = drawDocs;
  let whoPicked = null;
  crmBindContactAc("mfWho", "mfWhoAc", null, pick => { whoPicked = pick; document.getElementById("mfWho").value = pick.name; });
  document.getElementById("mfWho").addEventListener("input", () => { whoPicked = null; });
  const addWho = () => {
    const name = v("mfWho"); if (!name) return;
    parts.push(whoPicked && whoPicked.name === name ? { contact_id: whoPicked.id, name, role: v("mfWhoRole") } : { name, role: v("mfWhoRole"), category: v("mfWhoCat") });
    document.getElementById("mfWho").value = ""; whoPicked = null; drawParts();
  };
  document.getElementById("mfWhoAdd").onclick = addWho;
  document.getElementById("mfWho").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addWho(); } });
  bindAutocomplete("mfParcel", "mfParcelAc", null, pick => { if (pick.parcel) { parcel = { id: pick.parcel.id, lat: pick.parcel.lat, lon: pick.parcel.lon, parcel_no: pick.parcel.parcel_no, ko: pick.parcel.ko }; document.getElementById("mfParcel").value = `${pick.parcel.parcel_no} · ${pick.parcel.ko}`; } });
  document.getElementById("mfParcel").addEventListener("input", () => { if (!document.getElementById("mfParcel").value.trim()) parcel = null; });
  document.getElementById("mfDocAdd").onclick = () => { const t = v("mfDocTitle"), u = v("mfDocUrl"); if (!t && !u) return; docs.push({ title: t || u, external_url: u || null, kind: v("mfDocKind") }); document.getElementById("mfDocTitle").value = ""; document.getElementById("mfDocUrl").value = ""; drawDocs(); };
  document.getElementById("mfSave").onclick = async () => {
    const msg = document.getElementById("mfMsg");
    if (!v("mfTitle")) { msg.textContent = "a title is required"; return; }
    if (!parts.length) { msg.textContent = "add at least one person"; return; }
    const pr = document.getElementById("mfProspect"); const opt = pr.selectedOptions[0];
    const alias = document.getElementById("mfAlias").value;
    const when = document.getElementById("mfWhen").value ? new Date(document.getElementById("mfWhen").value).toISOString() : new Date().toISOString();
    const body = { id: id || null, kind: v("mfKind"), occurred_at: when, time_known: document.getElementById("mfTimeKnown").checked, title: v("mfTitle"),
      summary: v("mfSummary"), details: v("mfDetails"), outcome: v("mfOutcome"), next_step: v("mfNext"), next_step_due: v("mfDue") || null, next_step_done: document.getElementById("mfNextDone").checked,
      location_text: v("mfWhere") || (parcel && parcel.parcel_no ? `Parcel ${parcel.parcel_no}, ${parcel.ko}` : null) || (opt && opt.value ? opt.textContent : null),
      place_alias: alias || null, parcel_id: parcel ? parcel.id : null, prospect_id: pr.value || null,
      lat: parcel ? parcel.lat : (opt && opt.dataset.lat ? +opt.dataset.lat : null), lon: parcel ? parcel.lon : (opt && opt.dataset.lon ? +opt.dataset.lon : null),
      participants: parts, documents: docs, new_alias: v("mfNewAlias") || null };
    msg.textContent = "saving…";
    try { const d = await crm("what=interaction_save", body); crmCard = { type: "interaction", id: d.id }; renderCrmCard(); }
    catch (e) { msg.textContent = "failed: " + e.message; }
  };
  if (id) document.getElementById("mfDel").onclick = async () => {
    if (!confirm("Delete this meeting? The people stay in Contacts.")) return;
    try { await crm("what=interaction_delete", { id }); crmCard = null; crmMode = "meetings"; loadContacts(); } catch (e) { alert(e.message); }
  };
};

/* ---------- forms: document link ---------- */
window.crmAddDocument = function (preset) {
  const el = document.getElementById("crmBody");
  document.getElementById("askBar").style.display = "none";
  el.innerHTML = `<button style="margin-bottom:10px" onclick="crmMode='documents'; loadContacts()">← Back</button>
    <div class="card" style="background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;max-width:820px">
      <h3 style="font-size:15px;margin-bottom:10px">Add a document</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <span style="grid-column:1/-1">${fld("dfTitle", "Title *", "e.g. Brokerage agreement — Sotheby's (draft)")}</span>
        ${sel("dfKind", "Kind", ["contract", "draft", "valuation", "extract", "permit", "identity", "letter", "offer", "invoice", "photo", "report", "other"])}
        ${sel("dfStatus", "Status", ["draft", "signed", "received", "sent", "superseded", "void"])}
        ${fld("dfUrl", "Link (Drive or web)", "https://…")}
        ${fld("dfDate", "Document date", "", "date")}
        <span class="acwrap" style="display:block">${fld("dfContact", "Person or organisation it concerns", "Start typing a name")}<div class="ac" id="dfContactAc"></div></span>
        <span class="acwrap" style="display:block">${fld("dfParcel", "Parcel", "e.g. 1245/4")}<div class="ac" id="dfParcelAc"></div></span>
        ${area("dfSummary", "Summary", "Key terms, dates, amounts", 3)}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><button class="add" id="dfSave" style="background:var(--olive);color:var(--bg);border:none;font-weight:700;padding:8px 14px;border-radius:6px;cursor:pointer">Save document</button><span id="dfMsg" class="muted" style="font-size:12px"></span></div>
    </div>`;
  let contact = null, parcel = null;
  crmBindContactAc("dfContact", "dfContactAc", null, pick => { contact = pick; document.getElementById("dfContact").value = pick.name; });
  bindAutocomplete("dfParcel", "dfParcelAc", null, pick => { if (pick.parcel) { parcel = pick.parcel; document.getElementById("dfParcel").value = `${pick.parcel.parcel_no} · ${pick.parcel.ko}`; } });
  document.getElementById("dfSave").onclick = async () => {
    const msg = document.getElementById("dfMsg");
    if (!v("dfTitle")) { msg.textContent = "title is required"; return; }
    msg.textContent = "saving…";
    try {
      await crm("what=document_save", { title: v("dfTitle"), kind: v("dfKind"), status: v("dfStatus"), external_url: v("dfUrl") || null, issued_on: v("dfDate") || null, summary: v("dfSummary") || null,
        contact_id: contact && contact.kind === "person" ? contact.id : null, organisation_id: contact && contact.kind === "organisation" ? contact.id : null, parcel_id: parcel ? parcel.id : null,
        links: parcel ? [{ target_type: "parcel", target_id: parcel.id, relation: "about" }] : [] });
      crmMode = "documents"; loadContacts();
    } catch (e) { msg.textContent = "failed: " + e.message; }
  };
};

/* ---------- hooks into the map and the prospect file ---------- */
// Parcel popup: who is tied to this parcel and what happened here.
window.crmParcelPopup = async function (parcelId, holderId) {
  const el = document.getElementById(holderId); if (!el) return;
  try {
    const d = await crm(`what=for_target&type=parcel&id=${parcelId}`);
    const n = (d.contacts || []).length, m = (d.interactions || []).length;
    if (!n && !m) { el.innerHTML = ""; return; }
    el.innerHTML = `<div style="margin-top:6px">👥 ${d.contacts.map(c => `<b class="loc" onclick="crmOpenContact(${c.id})">${esc(c.name)}</b> <span class="muted">(${esc(c.relation)})</span>`).join(", ")}` +
      (m ? `<br>🤝 ${m} meeting${m > 1 ? "s" : ""} here — last ${esc(fmtDay(d.interactions[0].occurred_at, false))}: <b class="loc" onclick="crmOpenInteraction(${d.interactions[0].id})">${esc(d.interactions[0].title)}</b>` : "") + `</div>`;
  } catch (e) { el.innerHTML = ""; }
};
// Prospect file: contacts, meetings and documents tied to the prospect.
async function loadProspectCrm() {
  const el = document.getElementById("ppCrm"); if (!el || !ppCur) return;
  el.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    const d = await crm(`what=for_target&type=prospect&id=${ppCur.id}`);
    document.getElementById("ppCrmN").textContent = `(${(d.contacts || []).length} · ${(d.interactions || []).length})`;
    el.innerHTML = ((d.contacts || []).length ? d.contacts.map(c => `<div class="notice"><b class="loc" onclick="crmOpenContact(${c.id})">${esc(c.name)}</b> <span class="muted">· ${esc(c.relation)}${c.role_title ? " · " + esc(c.role_title) : ""}${c.organisation ? " · " + esc(c.organisation) : ""}</span><br><span class="muted" style="font-size:12.5px">${[tel(c.phone), mail(c.email)].filter(Boolean).join(" · ")}</span></div>`).join("") : "") +
      ((d.interactions || []).length ? d.interactions.map(i => `<div class="notice">${CRM_KIND_ICON[i.kind] || "•"} <span class="muted">${esc(fmtDay(i.occurred_at, i.time_known))}</span> — <b class="loc" onclick="crmOpenInteraction(${i.id})">${esc(i.title)}</b>${i.next_step && !i.next_step_done ? `<br><span style="color:var(--warn);font-size:12.5px">Next: ${esc(i.next_step)}</span>` : ""}</div>`).join("") : "") +
      ((d.documents || []).length ? `<div class="notice">${d.documents.map(docChip).join(" ")}</div>` : "") ||
      `<p class="muted">Nobody linked yet — log the first meeting below.</p>`;
  } catch (e) { crmFail(el, e); }
}
document.getElementById("ppCrmLog").onclick = () => {
  const preset = [];
  crmEditInteraction(null, preset);
  setTimeout(() => { const s = document.getElementById("mfProspect"); if (s && ppCur) { s.value = String(ppCur.id); } if (ppCur) document.getElementById("mfTitle").value = `Meeting — ${ppCur.name}`; }, 60);
};
