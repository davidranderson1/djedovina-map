// Djedovina · crm edge function — contacts, meetings, documents, links and the natural-language "Ask".
// v1 · 2026-09-14 · pairs with migration 20260914_crm_contacts_meetings.sql and map app v19.
//
// Auth: the caller's credentials (x-team-key header or a Supabase Auth bearer token of a team
// member) are verified by forwarding them to map-data?what=status — the single source of truth
// for who may use the app — and cached for five minutes. Data access uses the service role.
//
// Deploy with verify_jwt = false (the function does its own authorisation, like map-data).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAP_DATA = `${SUPABASE_URL}/functions/v1/map-data`;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5";
const ALLOWED_ORIGINS = new Set([
  "https://davidranderson1.github.io",
  "https://djedovina.com",
  "https://www.djedovina.com",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://davidranderson1.github.io",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, x-team-key, content-type, apikey",
    "vary": "origin",
  };
}
const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

/* ---------- authorisation: delegate to map-data ---------- */
const authCache = new Map<string, number>(); // fingerprint → expiry (ms)
async function fingerprint(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function authorised(req: Request): Promise<boolean> {
  const key = req.headers.get("x-team-key") ?? "";
  const bearer = req.headers.get("authorization") ?? "";
  if (!key && !bearer) return false;
  const fp = await fingerprint(key + "|" + bearer);
  const until = authCache.get(fp);
  if (until && until > Date.now()) return true;
  try {
    const h: Record<string, string> = {};
    if (key) h["x-team-key"] = key;
    if (bearer) h["authorization"] = bearer;
    const r = await fetch(`${MAP_DATA}?what=status`, { headers: h });
    if (r.ok) { authCache.set(fp, Date.now() + 5 * 60 * 1000); return true; }
  } catch (_) { /* treat as unauthorised */ }
  return false;
}

/* ---------- helpers ---------- */
const fold = (s: string) => (s ?? "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nz = (v: unknown) => (v === undefined || v === null || v === "" ? null : v);
function whoami(req: Request) {
  // best-effort author tag: the bearer token's email when present, else "team-key"
  const b = req.headers.get("authorization") ?? "";
  try {
    const payload = JSON.parse(atob(b.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email ?? payload.sub ?? "team-key";
  } catch (_) { return "team-key"; }
}
async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/* ---------- the question parser ---------- */
const MONTHS: Record<string, number> = {
  january: 1, jan: 1, sijecanj: 1, siječanj: 1, sijecnja: 1,
  february: 2, feb: 2, veljaca: 2, veljača: 2, veljace: 2,
  march: 3, mar: 3, ozujak: 3, ožujak: 3, ozujka: 3,
  april: 4, apr: 4, travanj: 4, travnja: 4,
  may: 5, svibanj: 5, svibnja: 5,
  june: 6, jun: 6, lipanj: 6, lipnja: 6,
  july: 7, jul: 7, srpanj: 7, srpnja: 7,
  august: 8, aug: 8, kolovoz: 8, kolovoza: 8,
  september: 9, sep: 9, sept: 9, rujan: 9, rujna: 9,
  october: 10, oct: 10, listopad: 10, listopada: 10,
  november: 11, nov: 11, studeni: 11, studenog: 11,
  december: 12, dec: 12, prosinac: 12, prosinca: 12,
};
const ROLE_WORDS: Record<string, string[]> = {
  broker: ["broker", "brokers", "agent", "agents", "realtor", "estate", "agency", "posrednik", "sotheby", "sothebys", "sotheby's", "listing"],
  lawyer: ["lawyer", "lawyers", "attorney", "solicitor", "odvjetnik", "legal"],
  notary: ["notary", "biljeznik", "bilježnik", "javni"],
  owner: ["owner", "owners", "owns", "own", "vlasnik", "seller", "sells", "selling"],
  heir: ["heir", "heirs", "nasljednik", "inheritor"],
  family: ["family", "obitelj", "relative", "relatives", "cousin", "brother", "sister", "son", "daughter"],
  surveyor: ["surveyor", "geodet", "survey"],
  architect: ["architect", "arhitekt"],
  builder: ["builder", "contractor", "construction", "gradevinar", "građevinar"],
  official: ["official", "clerk", "municipality", "city", "grad", "opcina", "općina", "ministry", "inspector"],
  bank: ["bank", "banker", "banka", "loan", "mortgage"],
  buyer: ["buyer", "buyers", "purchaser", "kupac", "investor"],
  advisor: ["advisor", "adviser", "accountant", "consultant", "tax", "knjigovodja"],
  team: ["team", "colleague", "ourselves"],
};
const INTERACTION_WORDS = ["meeting", "meetings", "met", "meet", "visit", "visited", "visits", "call", "called", "calls", "spoke", "speak", "talk", "talked", "conversation", "sastanak", "viewing", "walked"];
const DOCUMENT_WORDS = ["document", "documents", "contract", "contracts", "agreement", "agreements", "paper", "papers", "pdf", "draft", "ugovor", "valuation", "offer", "extract", "izvadak", "permit", "letter"];
const ORG_WORDS = ["company", "companies", "firm", "agency", "office", "organisation", "organization", "tvrtka", "d.o.o", "doo"];
const PERSON_WORDS = ["guy", "man", "woman", "lady", "person", "people", "someone", "somebody", "who", "whom", "contact", "fellow", "gentleman", "chap"];
const STOP = new Set(["tell", "me", "about", "the", "a", "an", "we", "our", "us", "i", "my", "you", "your", "at", "in", "on", "of", "to", "for", "with", "from", "and", "or", "back", "again", "that", "this", "it", "have", "has", "had", "do", "does", "did", "been", "be", "is", "are", "was", "were", "last", "ago", "find", "show", "give", "get", "info", "information", "details", "everything", "anything", "all", "what", "when", "where", "which", "how", "why", "there", "here", "then", "than", "into", "over", "up", "out", "please", "can", "could", "would", "should", "know", "remember", "recall", "came", "come", "went", "go", "his", "her", "their", "he", "she", "they", "them", "him", "one", "some", "any", "so", "very", "just", "also", "like", "said", "say", "told", "gave", "left", "brought", "through", "by", "as", "if", "not", "no", "yes", "day", "days", "week", "weeks", "month", "months", "year", "years", "time", "ever", "recently", "earlier", "today", "yesterday", "tomorrow", "now", "house", "home", "place", "kuca", "kuća", "stan", "flat", "apartment", "land", "parcel", "plot", "property", "nekretnina", "zemljiste", "zemljište"]);

interface Parsed { terms: string[]; from: string | null; to: string | null; places: string[]; roles: string[]; intent: string; explain: string[]; }

function monthWindow(y: number, m: number) {
  const from = new Date(Date.UTC(y, m - 1, 1, -2)); // ~Europe/Zagreb midnight
  const to = new Date(Date.UTC(y, m, 1, -2));
  return [from.toISOString(), to.toISOString()];
}
function parseQuestion(qRaw: string, aliases: string[]): Parsed {
  const q = fold(qRaw).replace(/[’‘]/g, "'").replace(/[^a-z0-9'/.\- ]+/g, " ").replace(/\s+/g, " ").trim();
  const explain: string[] = [];
  const now = new Date();
  let from: string | null = null, to: string | null = null;
  const places: string[] = [];
  const roles = new Set<string>();
  let intent = "any";

  // explicit dates dd.mm.yyyy / dd/mm/yyyy / yyyy-mm-dd
  const dm = q.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/) ?? null;
  const iso = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) ?? null;
  if (dm) { const d = new Date(Date.UTC(+dm[3], +dm[2] - 1, +dm[1], -2)); from = d.toISOString(); to = new Date(d.getTime() + 864e5).toISOString(); explain.push(`on ${dm[0]}`); }
  else if (iso) { const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], -2)); from = d.toISOString(); to = new Date(d.getTime() + 864e5).toISOString(); explain.push(`on ${iso[0]}`); }
  else {
    // month names, optionally followed by a year
    const words = q.split(" ");
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[.,]/g, "");
      if (MONTHS[w]) {
        const m = MONTHS[w];
        let y = now.getUTCFullYear();
        const next = (words[i + 1] ?? "").replace(/[.,]/g, "");
        if (/^(19|20)\d{2}$/.test(next)) y = +next;
        else if (m > now.getUTCMonth() + 1) y -= 1; // "in november" said in september → last november
        [from, to] = monthWindow(y, m); explain.push(`${w} ${y}`); break;
      }
    }
    if (!from) {
      const y = q.match(/\b(20\d{2})\b/);
      if (/\byesterday\b|\bjucer\b/.test(q)) { const d = new Date(now.getTime() - 864e5); from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), -2)).toISOString(); to = new Date(new Date(from).getTime() + 864e5).toISOString(); explain.push("yesterday"); }
      else if (/\btoday\b|\bdanas\b/.test(q)) { from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), -2)).toISOString(); to = new Date(new Date(from).getTime() + 864e5).toISOString(); explain.push("today"); }
      else if (/\b(last|past|previous) (few )?(days|week)\b|\bprosli tjedan\b/.test(q)) { from = new Date(now.getTime() - 10 * 864e5).toISOString(); to = null; explain.push("last ten days"); }
      else if (/\b(last|past|previous) month\b|\bprosli mjesec\b/.test(q)) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); [from, to] = monthWindow(d.getUTCFullYear(), d.getUTCMonth() + 1); explain.push("last month"); }
      else if (/\bthis month\b|\bovaj mjesec\b/.test(q)) { [from, to] = monthWindow(now.getUTCFullYear(), now.getUTCMonth() + 1); explain.push("this month"); }
      else if (/\bthis (week|year)\b/.test(q)) { from = new Date(now.getTime() - (q.includes("week") ? 7 : 365) * 864e5).toISOString(); to = null; explain.push(q.includes("week") ? "this week" : "this year"); }
      else if (/\b(last|past) year\b/.test(q)) { from = `${now.getUTCFullYear() - 1}-01-01T00:00:00Z`; to = `${now.getUTCFullYear()}-01-01T00:00:00Z`; explain.push("last year"); }
      else if (/\brecently\b|\blately\b/.test(q)) { from = new Date(now.getTime() - 45 * 864e5).toISOString(); to = null; explain.push("recently (45 days)"); }
      else if (y) { from = `${y[1]}-01-01T00:00:00Z`; to = `${+y[1] + 1}-01-01T00:00:00Z`; explain.push(`in ${y[1]}`); }
    }
  }

  // places: known aliases first (longest first), then "at/in <words>" phrases, then parcel numbers
  const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
  let rest = q;
  for (const a of sortedAliases) {
    const idx = rest.indexOf(a);
    if (idx >= 0) { places.push(a); rest = rest.replace(a, " "); explain.push(`place: ${a}`); }
  }
  const atPhrases = rest.matchAll(/\b(?:at|in|near|on) (?:the |our |his |her |their )?([a-z][a-z' .\-]{2,40}?)(?= back| last| in | on | during| when| this| that| who| what| about| with| and| for|$|[.,?])/g);
  for (const m of atPhrases) {
    const ph = m[1].trim().replace(/\s+/g, " ");
    if (!ph || MONTHS[ph] || ph.split(" ").every((w) => STOP.has(w) || MONTHS[w] || Object.values(ROLE_WORDS).flat().includes(w))) continue;
    if (!places.includes(ph)) { places.push(ph); explain.push(`place: ${ph}`); }
  }
  for (const m of q.matchAll(/\b(\d{1,5}\/\d{1,4})\b/g)) { if (!places.includes(m[1])) { places.push(m[1]); explain.push(`parcel ${m[1]}`); } }

  // roles and intent
  const tokens = q.replace(/[.,?!]/g, " ").split(" ").filter(Boolean);
  for (const t of tokens) {
    for (const [role, ws] of Object.entries(ROLE_WORDS)) if (ws.includes(t)) roles.add(role);
  }
  const has = (list: string[]) => tokens.some((t) => list.includes(t));
  if (has(DOCUMENT_WORDS)) intent = "document";
  else if (has(ORG_WORDS)) intent = "organisation";
  else if (has(PERSON_WORDS) || /\bwho\b/.test(q)) intent = "contact";
  else if (has(INTERACTION_WORDS)) intent = "interaction";
  if (roles.size) explain.push(`role: ${[...roles].join(", ")}`);
  if (intent !== "any") explain.push(`looking for: ${intent}`);

  // content terms: everything left that is not noise
  const placeWords = new Set(places.flatMap((p) => p.split(" ")));
  const roleWords = new Set(Object.values(ROLE_WORDS).flat().filter((w) => ["sotheby", "sothebys", "sotheby's", "estate"].includes(w) === false));
  const terms = tokens
    .map((t) => t.replace(/^'+|'+$/g, "").replace(/'s$/, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t) && !MONTHS[t] && !placeWords.has(t) && !roleWords.has(t)
      && !INTERACTION_WORDS.includes(t) && !DOCUMENT_WORDS.includes(t) && !ORG_WORDS.includes(t) && !PERSON_WORDS.includes(t)
      && !/^\d+$/.test(t));
  const uniq = [...new Set(terms)];
  if (uniq.length) explain.push(`terms: ${uniq.join(", ")}`);
  return { terms: uniq, from, to, places, roles: [...roles], intent, explain };
}

/* ---------- optional Claude assist (only when ANTHROPIC_API_KEY is set) ---------- */
async function claude(system: string, user: string, maxTokens = 600): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.content?.[0]?.text ?? null;
  } catch (_) { return null; }
}

function ruleAnswer(parsed: Parsed, res: any): string {
  const c = res.contacts?.[0];
  const i = res.interactions?.[0];
  const d = res.documents?.[0];
  const when = (t: string | null | undefined, known = true) => t ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zagreb" }) + (known ? "" : " (time not recorded)") : "";
  if (parsed.intent === "document" && d) return `${d.title} — ${d.kind}, ${d.status}${d.issued_on ? ", dated " + when(d.issued_on) : ""}.${d.summary ? " " + d.summary : ""}`;
  if (parsed.intent === "interaction" && i) return `${when(i.occurred_at, i.time_known)} — ${i.title}${i.location_text ? " at " + i.location_text : ""}. ${i.summary ?? ""}${i.next_step ? " Next: " + i.next_step : ""}`;
  if (c) {
    const org = c.organisation?.name ? ` (${c.organisation.name})` : "";
    const last = c.interactions?.[0];
    let s = `${c.name}${c.role_title ? " — " + c.role_title : ""}${org}.`;
    if (c.how_we_met) s += ` ${c.how_we_met}`;
    if (last) s += ` Last contact: ${when(last.occurred_at, last.time_known)} — ${last.title}.${last.next_step && !last.next_step_done ? " Next step: " + last.next_step + (last.next_step_due ? " (by " + when(last.next_step_due) + ")" : "") + "." : ""}`;
    if (c.phone || c.email) s += ` Reach: ${[c.phone, c.email].filter(Boolean).join(" · ")}.`;
    return s;
  }
  if (i) return `${when(i.occurred_at, i.time_known)} — ${i.title}. ${i.summary ?? ""}`;
  if (d) return `${d.title}.`;
  return "Nothing in the contacts, meetings or documents matches that yet. Try a name, a place (\"our house\"), a month, or a role (\"the broker\").";
}

/* ---------- handlers ---------- */
async function handleAsk(req: Request, body: any) {
  const q = String(body?.q ?? "").trim();
  if (!q) return json(req, { error: "q is required" }, 400);
  const { data: aliasRows } = await db.from("crm_place_alias").select("alias");
  const aliases = (aliasRows ?? []).map((r: any) => r.alias);
  let parsed = parseQuestion(q, aliases);

  // optional: let Claude refine the structured query (never trusted blindly — merged with the rule parse)
  if (ANTHROPIC_KEY) {
    const txt = await claude(
      `You turn a question about a small real-estate CRM into a JSON query. Today is ${new Date().toISOString().slice(0, 10)} (Europe/Zagreb). ` +
      `Known place aliases: ${aliases.join("; ") || "none"}. Categories: ${Object.keys(ROLE_WORDS).join(", ")}. ` +
      `Reply with JSON only: {"terms":[content words, names],"from":ISO date or null,"to":ISO date or null,"places":[place phrases],"roles":[categories],"intent":"contact|organisation|interaction|document|any"}.`,
      q, 300);
    try {
      const j = JSON.parse((txt ?? "").replace(/^```json|```$/g, "").trim());
      parsed = {
        terms: [...new Set([...(parsed.terms), ...((j.terms ?? []).map(fold))])],
        from: j.from ?? parsed.from, to: j.to ?? parsed.to,
        places: [...new Set([...(parsed.places), ...((j.places ?? []).map(fold))])],
        roles: [...new Set([...(parsed.roles), ...((j.roles ?? []).filter((r: string) => ROLE_WORDS[r]))])],
        intent: j.intent && ["contact", "organisation", "interaction", "document", "any"].includes(j.intent) ? j.intent : parsed.intent,
        explain: [...parsed.explain, "refined by Claude"],
      };
    } catch (_) { /* keep the rule parse */ }
  }

  const res: any = await rpc("crm_ask", {
    p_terms: parsed.terms.length ? parsed.terms : null, p_from: parsed.from, p_to: parsed.to,
    p_places: parsed.places.length ? parsed.places : null, p_roles: parsed.roles.length ? parsed.roles : null,
    p_intent: parsed.intent, p_limit: 5,
  });
  let answer = ruleAnswer(parsed, res);
  if (ANTHROPIC_KEY && (res.contacts?.length || res.interactions?.length || res.documents?.length)) {
    const txt = await claude(
      "You answer a colleague's question from CRM records. Answer in two or three plain sentences, British English, no bullet points, no markdown; name the person, their role and organisation, when and where we met them, and the open next step if any. Use only the records given.",
      `Question: ${q}\n\nRecords (JSON): ${JSON.stringify({ contacts: (res.contacts ?? []).slice(0, 2), interactions: (res.interactions ?? []).slice(0, 2), documents: (res.documents ?? []).slice(0, 2) }).slice(0, 12000)}`,
      400);
    if (txt) answer = txt.trim();
  }
  return json(req, { question: q, parsed, answer, ...res, ai: !!ANTHROPIC_KEY });
}

async function findOrCreateContact(p: any, author: string): Promise<number> {
  if (p.contact_id) return Number(p.contact_id);
  const name = String(p.name ?? "").trim();
  if (!name) throw new Error("participant needs a name or contact_id");
  const { data: ex } = await db.from("crm_contact").select("id").ilike("name", name).limit(1);
  if (ex && ex.length) return ex[0].id;
  const { data, error } = await db.from("crm_contact").insert({
    kind: p.kind ?? "person", name, role_title: nz(p.role_title), category: p.category ?? "other",
    phone: nz(p.phone), email: nz(p.email), organisation_id: nz(p.organisation_id), created_by: author,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function handleContactSave(req: Request, b: any) {
  const author = whoami(req);
  let organisation_id = nz(b.organisation_id) as number | null;
  if (!organisation_id && b.organisation_name) {
    organisation_id = await findOrCreateContact({ kind: "organisation", name: b.organisation_name, category: b.category ?? "other" }, author);
  }
  const row: Record<string, unknown> = {
    kind: b.kind ?? "person", name: String(b.name ?? "").trim(), first_name: nz(b.first_name), last_name: nz(b.last_name),
    role_title: nz(b.role_title), organisation_id, category: b.category ?? "other",
    phone: nz(b.phone), phone2: nz(b.phone2), email: nz(b.email), website: nz(b.website),
    address: nz(b.address), city: nz(b.city), country: b.country ?? "HR", language: nz(b.language),
    tags: Array.isArray(b.tags) ? b.tags : String(b.tags ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
    how_we_met: nz(b.how_we_met), notes: nz(b.notes), registry_person_id: nz(b.registry_person_id), heir_id: nz(b.heir_id),
    registry_refs: b.registry_refs && typeof b.registry_refs === "object" ? b.registry_refs : {}, oib: nz(b.oib),
  };
  if (!row.name) return json(req, { error: "name is required" }, 400);
  let id: number;
  if (b.id) {
    const { error } = await db.from("crm_contact").update(row).eq("id", b.id);
    if (error) return json(req, { error: error.message }, 500);
    id = Number(b.id);
  } else {
    const { data, error } = await db.from("crm_contact").insert({ ...row, created_by: author }).select("id").single();
    if (error) return json(req, { error: error.message }, 500);
    id = data.id;
  }
  // optional links: [{target_type, target_id, relation}]
  for (const l of (b.links ?? [])) {
    if (!l.target_type || !l.target_id) continue;
    await db.from("crm_link").insert({ contact_id: id, target_type: l.target_type, target_id: l.target_id, relation: l.relation ?? "related", label: nz(l.label) });
  }
  return json(req, { ok: true, id, card: await rpc("crm_contact_card", { p_id: id }) });
}

async function handleInteractionSave(req: Request, b: any) {
  const author = whoami(req);
  const title = String(b.title ?? "").trim();
  if (!title) return json(req, { error: "title is required" }, 400);
  const row: Record<string, unknown> = {
    kind: b.kind ?? "meeting", occurred_at: b.occurred_at ?? new Date().toISOString(), time_known: b.time_known !== false,
    title, summary: nz(b.summary), details: nz(b.details), outcome: nz(b.outcome),
    next_step: nz(b.next_step), next_step_due: nz(b.next_step_due), next_step_done: !!b.next_step_done,
    location_text: nz(b.location_text), lat: nz(b.lat), lon: nz(b.lon),
    parcel_id: nz(b.parcel_id), prospect_id: nz(b.prospect_id), lr_unit_id: nz(b.lr_unit_id),
  };
  // a place alias can supply the parcel/prospect/coordinates
  if (b.place_alias) {
    const { data: al } = await db.from("crm_place_alias").select("*").eq("alias", fold(b.place_alias)).limit(1);
    if (al && al.length) {
      row.parcel_id = row.parcel_id ?? al[0].parcel_id; row.prospect_id = row.prospect_id ?? al[0].prospect_id;
      row.lat = row.lat ?? al[0].lat; row.lon = row.lon ?? al[0].lon; row.location_text = row.location_text ?? al[0].label;
    }
  }
  let id: number;
  if (b.id) {
    const { error } = await db.from("crm_interaction").update(row).eq("id", b.id);
    if (error) return json(req, { error: error.message }, 500);
    id = Number(b.id);
    if (Array.isArray(b.participants)) await db.from("crm_interaction_participant").delete().eq("interaction_id", id);
  } else {
    const { data, error } = await db.from("crm_interaction").insert({ ...row, created_by: author }).select("id").single();
    if (error) return json(req, { error: error.message }, 500);
    id = data.id;
  }
  for (const p of (b.participants ?? [])) {
    const cid = await findOrCreateContact(p, author);
    await db.from("crm_interaction_participant").upsert({ interaction_id: id, contact_id: cid, role: p.role ?? "counterparty" });
  }
  for (const l of (b.links ?? [])) {
    if (!l.target_type || !l.target_id) continue;
    await db.from("crm_link").insert({ interaction_id: id, target_type: l.target_type, target_id: l.target_id, relation: l.relation ?? "met_at", label: nz(l.label) });
  }
  if (row.parcel_id) await db.from("crm_link").insert({ interaction_id: id, target_type: "parcel", target_id: row.parcel_id, relation: "met_at" }).then(() => {}, () => {});
  if (row.prospect_id) await db.from("crm_link").insert({ interaction_id: id, target_type: "prospect", target_id: row.prospect_id, relation: "met_at" }).then(() => {}, () => {});
  for (const d of (b.documents ?? [])) {
    if (!d.title && !d.external_url) continue;
    await db.from("crm_document").insert({
      title: d.title ?? d.external_url, kind: d.kind ?? "other", status: d.status ?? "received", external_url: nz(d.external_url), file_name: nz(d.file_name),
      storage_path: nz(d.storage_path), issued_on: nz(d.issued_on), summary: nz(d.summary), interaction_id: id, contact_id: nz(d.contact_id),
      prospect_id: row.prospect_id ?? null, parcel_id: row.parcel_id ?? null, created_by: author,
    });
  }
  if (b.new_alias && (row.parcel_id || row.prospect_id || row.lat)) {
    await db.from("crm_place_alias").upsert({ alias: fold(b.new_alias), label: row.location_text ?? b.new_alias, parcel_id: row.parcel_id ?? null, prospect_id: row.prospect_id ?? null, lat: row.lat ?? null, lon: row.lon ?? null }, { onConflict: "alias" });
  }
  return json(req, { ok: true, id, card: await rpc("crm_interaction_card", { p_id: id }) });
}

async function handleDocumentSave(req: Request, b: any) {
  const author = whoami(req);
  const title = String(b.title ?? "").trim();
  if (!title) return json(req, { error: "title is required" }, 400);
  const row: Record<string, unknown> = {
    title, kind: b.kind ?? "other", status: b.status ?? "draft", file_name: nz(b.file_name), storage_path: nz(b.storage_path), external_url: nz(b.external_url),
    drive_file_id: nz(b.drive_file_id), issued_on: nz(b.issued_on), language: nz(b.language), summary: nz(b.summary),
    key_terms: b.key_terms && typeof b.key_terms === "object" ? b.key_terms : {},
    contact_id: nz(b.contact_id), organisation_id: nz(b.organisation_id), interaction_id: nz(b.interaction_id),
    prospect_id: nz(b.prospect_id), parcel_id: nz(b.parcel_id), vault_document_id: nz(b.vault_document_id),
  };
  let id: number;
  if (b.id) {
    const { error } = await db.from("crm_document").update(row).eq("id", b.id);
    if (error) return json(req, { error: error.message }, 500);
    id = Number(b.id);
  } else {
    const { data, error } = await db.from("crm_document").insert({ ...row, created_by: author }).select("id").single();
    if (error) return json(req, { error: error.message }, 500);
    id = data.id;
  }
  for (const l of (b.links ?? [])) {
    if (!l.target_type || !l.target_id) continue;
    await db.from("crm_link").insert({ document_id: id, target_type: l.target_type, target_id: l.target_id, relation: l.relation ?? "about", label: nz(l.label) });
  }
  return json(req, { ok: true, id });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const url = new URL(req.url);
  const what = url.searchParams.get("what") ?? "";
  if (!(await authorised(req))) return json(req, { error: "unauthorized" }, 401);
  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (_) { body = {}; } }
  const g = (k: string, d = "") => url.searchParams.get(k) ?? d;
  try {
    switch (what) {
      case "status": return json(req, await rpc("crm_status"));
      case "ask": return await handleAsk(req, body);

      case "contacts": {
        const q = fold(g("q")), kind = g("kind"), cat = g("category"), limit = Math.min(+g("limit", "200"), 500);
        let sel = db.from("crm_contact").select("id, kind, name, role_title, category, phone, email, city, tags, organisation_id, updated_at").order("name").limit(limit);
        if (kind) sel = sel.eq("kind", kind);
        if (cat) sel = sel.eq("category", cat);
        const { data, error } = await sel;
        if (error) return json(req, { error: error.message }, 500);
        const orgIds = [...new Set((data ?? []).map((r: any) => r.organisation_id).filter(Boolean))];
        const orgs: Record<number, string> = {};
        if (orgIds.length) { const { data: o } = await db.from("crm_contact").select("id, name").in("id", orgIds); for (const r of (o ?? [])) orgs[r.id] = r.name; }
        const { data: lastRows } = await db.from("crm_interaction_participant").select("contact_id, crm_interaction(occurred_at)");
        const last: Record<number, string> = {};
        for (const r of (lastRows ?? []) as any[]) { const t = r.crm_interaction?.occurred_at; if (t && (!last[r.contact_id] || t > last[r.contact_id])) last[r.contact_id] = t; }
        let rows = (data ?? []).map((r: any) => ({ ...r, organisation: orgs[r.organisation_id] ?? null, last_contact: last[r.id] ?? null }));
        if (q) rows = rows.filter((r: any) => fold([r.name, r.organisation, r.role_title, r.city, (r.tags ?? []).join(" ")].join(" ")).includes(q));
        return json(req, rows);
      }
      case "contact": return json(req, await rpc("crm_contact_card", { p_id: +g("id") }));
      case "contact_save": return await handleContactSave(req, body);
      case "contact_delete": {
        const { error } = await db.from("crm_contact").delete().eq("id", body.id ?? +g("id"));
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }

      case "interactions": {
        const limit = Math.min(+g("limit", "100"), 500);
        let sel = db.from("crm_interaction").select("id, kind, occurred_at, time_known, title, summary, next_step, next_step_due, next_step_done, location_text, parcel_id, prospect_id, lat, lon").order("occurred_at", { ascending: false }).limit(limit);
        if (g("since")) sel = sel.gte("occurred_at", g("since"));
        if (g("open") === "1") sel = sel.eq("next_step_done", false).not("next_step", "is", null);
        const { data, error } = await sel;
        if (error) return json(req, { error: error.message }, 500);
        const ids = (data ?? []).map((r: any) => r.id);
        const { data: parts } = ids.length ? await db.from("crm_interaction_participant").select("interaction_id, role, crm_contact(id, name)").in("interaction_id", ids) : { data: [] };
        const byI: Record<number, any[]> = {};
        for (const p of (parts ?? []) as any[]) (byI[p.interaction_id] ??= []).push({ id: p.crm_contact?.id, name: p.crm_contact?.name, role: p.role });
        let rows = (data ?? []).map((r: any) => ({ ...r, participants: byI[r.id] ?? [] }));
        const q = fold(g("q"));
        if (q) rows = rows.filter((r: any) => fold([r.title, r.summary, r.location_text, r.participants.map((p: any) => p.name).join(" ")].join(" ")).includes(q));
        if (g("contact")) rows = rows.filter((r: any) => r.participants.some((p: any) => p.id === +g("contact")));
        return json(req, rows);
      }
      case "interaction": return json(req, await rpc("crm_interaction_card", { p_id: +g("id") }));
      case "interaction_save": return await handleInteractionSave(req, body);
      case "interaction_done": {
        const { error } = await db.from("crm_interaction").update({ next_step_done: body.done !== false }).eq("id", body.id);
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }
      case "interaction_delete": {
        const { error } = await db.from("crm_interaction").delete().eq("id", body.id ?? +g("id"));
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }

      case "documents": {
        const { data, error } = await db.from("crm_document").select("id, title, kind, status, external_url, storage_path, file_name, issued_on, summary, contact_id, interaction_id, prospect_id, parcel_id, updated_at").order("issued_on", { ascending: false, nullsFirst: false }).limit(300);
        if (error) return json(req, { error: error.message }, 500);
        const cids = [...new Set((data ?? []).map((r: any) => r.contact_id).filter(Boolean))];
        const names: Record<number, string> = {};
        if (cids.length) { const { data: c } = await db.from("crm_contact").select("id, name").in("id", cids); for (const r of (c ?? [])) names[r.id] = r.name; }
        let rows = (data ?? []).map((r: any) => ({ ...r, contact_name: names[r.contact_id] ?? null }));
        const q = fold(g("q"));
        if (q) rows = rows.filter((r: any) => fold([r.title, r.summary, r.contact_name, r.kind].join(" ")).includes(q));
        return json(req, rows);
      }
      case "document_save": return await handleDocumentSave(req, body);
      case "document_url": {
        // signed link for a vault object (same private bucket the prospect vault uses)
        const path = g("path");
        if (!path) return json(req, { error: "path required" }, 400);
        const { data, error } = await db.storage.from(g("bucket", "documents")).createSignedUrl(path, 3600);
        return error ? json(req, { error: error.message }, 500) : json(req, { url: data.signedUrl });
      }

      case "link_save": {
        const { contact_id, interaction_id, document_id, target_type, target_id, relation, label } = body;
        const { data, error } = await db.from("crm_link").insert({ contact_id: nz(contact_id), interaction_id: nz(interaction_id), document_id: nz(document_id), target_type, target_id, relation: relation ?? "related", label: nz(label) }).select("id").single();
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true, id: data.id });
      }
      case "link_delete": {
        const { error } = await db.from("crm_link").delete().eq("id", body.id ?? +g("id"));
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }

      case "for_target": return json(req, await rpc("crm_for_target", { p_type: g("type", "parcel"), p_id: +g("id") }));

      case "aliases": {
        const { data, error } = await db.from("crm_place_alias").select("*").order("alias");
        return error ? json(req, { error: error.message }, 500) : json(req, data);
      }
      case "alias_save": {
        const row = { alias: fold(body.alias), label: body.label ?? body.alias, parcel_id: nz(body.parcel_id), prospect_id: nz(body.prospect_id), lat: nz(body.lat), lon: nz(body.lon) };
        if (!row.alias) return json(req, { error: "alias required" }, 400);
        const { error } = await db.from("crm_place_alias").upsert(row, { onConflict: "alias" });
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }
      case "alias_delete": {
        const { error } = await db.from("crm_place_alias").delete().eq("id", body.id ?? +g("id"));
        return error ? json(req, { error: error.message }, 500) : json(req, { ok: true });
      }

      case "suggest": {
        const q = fold(g("q"));
        if (q.length < 1) return json(req, { contacts: [], places: [] });
        const { data } = await db.from("crm_contact").select("id, kind, name, role_title, category, organisation_id").order("name").limit(400);
        const contacts = (data ?? []).filter((r: any) => fold(r.name).includes(q) || fold(r.role_title ?? "").includes(q)).slice(0, 8);
        const { data: al } = await db.from("crm_place_alias").select("id, alias, label, parcel_id, prospect_id, lat, lon").order("alias");
        const places = (al ?? []).filter((r: any) => r.alias.includes(q) || fold(r.label).includes(q)).slice(0, 6);
        return json(req, { contacts, places });
      }
      default: return json(req, { error: `unknown what: ${what}` }, 404);
    }
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
});
