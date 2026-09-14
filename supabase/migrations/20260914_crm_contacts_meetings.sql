-- Djedovina · Contacts, meetings, documents and the natural-language "Ask"
-- Migration 2026-09-14 (map app v19). Apply with the Supabase connector's apply_migration.
--
-- Design: every person or organisation the team meets is a crm_contact; every meeting,
-- call or visit is a crm_interaction with participants; every paper is a crm_document.
-- crm_link ties any of them to what already exists in the database — parcels, prospects,
-- folios, registry persons, heirs — so a question like "the guy we met at our house in
-- September" resolves through people → meetings → places → parcels.
--
-- Security convention (same as the 14 Sep 2026 audit): RLS on, no policies for anon or
-- authenticated; the crm edge function talks to these tables with the service role, and
-- every function below is SECURITY DEFINER with EXECUTE revoked from public/anon.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- immutable wrapper so unaccent can be used in indexes and search vectors
create or replace function public.crm_unaccent(t text) returns text
language sql immutable parallel safe as $$
  select lower(public.unaccent('public.unaccent', coalesce(t, '')))
$$;

-- ---------------------------------------------------------------- contacts
create table if not exists public.crm_contact (
  id               bigserial primary key,
  kind             text not null default 'person' check (kind in ('person', 'organisation')),
  name             text not null,
  first_name       text,
  last_name        text,
  role_title       text,
  organisation_id  bigint references public.crm_contact(id) on delete set null,
  category         text default 'other' check (category in ('owner','heir','family','broker','lawyer','notary','surveyor','architect','builder','official','bank','buyer','investor','advisor','team','other')),
  phone            text,
  phone2           text,
  email            text,
  website          text,
  address          text,
  city             text,
  country          text default 'HR',
  language         text,
  tags             text[] not null default '{}',
  how_we_met       text,
  notes            text,
  registry_person_id bigint,     -- public.person.id when the contact is also a registry holder
  heir_id          bigint,       -- public.heir.id when the contact is a recorded heir
  registry_refs    jsonb not null default '{}'::jsonb,  -- e.g. {"hgk_register":"4/2017"}
  oib              text,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector
);
create index if not exists crm_contact_search_idx on public.crm_contact using gin (search);
create index if not exists crm_contact_name_trgm_idx on public.crm_contact using gin (crm_unaccent(name) gin_trgm_ops);
create index if not exists crm_contact_org_idx on public.crm_contact (organisation_id);

-- ---------------------------------------------------------------- interactions
create table if not exists public.crm_interaction (
  id             bigserial primary key,
  kind           text not null default 'meeting' check (kind in ('meeting','call','email','message','visit','viewing','note','other')),
  occurred_at    timestamptz not null default now(),
  time_known     boolean not null default true,
  title          text not null,
  summary        text,
  details        text,
  outcome        text,
  next_step      text,
  next_step_due  date,
  next_step_done boolean not null default false,
  location_text  text,
  lat            double precision,
  lon            double precision,
  parcel_id      bigint,
  prospect_id    bigint,
  lr_unit_id     bigint,
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  search         tsvector
);
create index if not exists crm_interaction_search_idx on public.crm_interaction using gin (search);
create index if not exists crm_interaction_when_idx on public.crm_interaction (occurred_at desc);
create index if not exists crm_interaction_parcel_idx on public.crm_interaction (parcel_id);
create index if not exists crm_interaction_prospect_idx on public.crm_interaction (prospect_id);

create table if not exists public.crm_interaction_participant (
  interaction_id bigint not null references public.crm_interaction(id) on delete cascade,
  contact_id     bigint not null references public.crm_contact(id) on delete cascade,
  role           text not null default 'counterparty' check (role in ('counterparty','us','host','observer','other')),
  primary key (interaction_id, contact_id)
);
create index if not exists crm_participant_contact_idx on public.crm_interaction_participant (contact_id);

-- ---------------------------------------------------------------- documents
create table if not exists public.crm_document (
  id                bigserial primary key,
  title             text not null,
  kind              text not null default 'other' check (kind in ('contract','draft','valuation','extract','permit','identity','letter','offer','invoice','photo','report','other')),
  status            text not null default 'draft' check (status in ('draft','signed','received','sent','superseded','void')),
  file_name         text,
  storage_path      text,      -- object in the private documents bucket (same vault as prospect documents)
  external_url      text,      -- Google Drive or other link
  drive_file_id     text,
  issued_on         date,
  language          text,
  summary           text,
  key_terms         jsonb not null default '{}'::jsonb,
  contact_id        bigint references public.crm_contact(id) on delete set null,
  organisation_id   bigint references public.crm_contact(id) on delete set null,
  interaction_id    bigint references public.crm_interaction(id) on delete set null,
  prospect_id       bigint,
  parcel_id         bigint,
  vault_document_id bigint,    -- public.document.id when the same file sits in a prospect vault
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search            tsvector
);
create index if not exists crm_document_search_idx on public.crm_document using gin (search);
create index if not exists crm_document_contact_idx on public.crm_document (contact_id);
create index if not exists crm_document_interaction_idx on public.crm_document (interaction_id);

-- ---------------------------------------------------------------- links to everything else
create table if not exists public.crm_link (
  id             bigserial primary key,
  contact_id     bigint references public.crm_contact(id) on delete cascade,
  interaction_id bigint references public.crm_interaction(id) on delete cascade,
  document_id    bigint references public.crm_document(id) on delete cascade,
  target_type    text not null check (target_type in ('parcel','prospect','folio','person','heir','contact','document','interaction')),
  target_id      bigint not null,
  relation       text not null default 'related',  -- owner_of · agent_for · valued · lives_at · represents · lawyer_for · met_at · about · works_at
  label          text,   -- cached human label, e.g. "Parcel 1245/4 · KUČINE"
  notes          text,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(contact_id, interaction_id, document_id) = 1)
);
create index if not exists crm_link_target_idx on public.crm_link (target_type, target_id);
create index if not exists crm_link_contact_idx on public.crm_link (contact_id);
create index if not exists crm_link_interaction_idx on public.crm_link (interaction_id);
create index if not exists crm_link_document_idx on public.crm_link (document_id);

-- ---------------------------------------------------------------- place aliases ("our house")
create table if not exists public.crm_place_alias (
  id          bigserial primary key,
  alias       text not null unique,       -- stored unaccented + lowercase
  label       text not null,
  parcel_id   bigint,
  prospect_id bigint,
  lat         double precision,
  lon         double precision,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- search vectors
create or replace function public.crm_contact_search_trg() returns trigger
language plpgsql as $$
declare org_name text;
begin
  select name into org_name from public.crm_contact where id = new.organisation_id;
  new.search :=
    setweight(to_tsvector('simple', crm_unaccent(new.name)), 'A') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(org_name, ''))), 'A') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.role_title, '') || ' ' || coalesce(new.category, '') || ' ' || array_to_string(new.tags, ' '))), 'B') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.how_we_met, '') || ' ' || coalesce(new.address, '') || ' ' || coalesce(new.city, '') || ' ' || coalesce(new.email, '') || ' ' || coalesce(new.website, ''))), 'C') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.notes, ''))), 'D');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_contact_search on public.crm_contact;
create trigger crm_contact_search before insert or update on public.crm_contact
  for each row execute function public.crm_contact_search_trg();

create or replace function public.crm_interaction_search_trg() returns trigger
language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('simple', crm_unaccent(new.title)), 'A') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.kind, '') || ' ' || coalesce(new.location_text, ''))), 'B') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.summary, '') || ' ' || coalesce(new.outcome, '') || ' ' || coalesce(new.next_step, ''))), 'C') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.details, ''))), 'D');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_interaction_search on public.crm_interaction;
create trigger crm_interaction_search before insert or update on public.crm_interaction
  for each row execute function public.crm_interaction_search_trg();

create or replace function public.crm_document_search_trg() returns trigger
language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('simple', crm_unaccent(new.title)), 'A') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.kind, '') || ' ' || coalesce(new.status, '') || ' ' || coalesce(new.file_name, ''))), 'B') ||
    setweight(to_tsvector('simple', crm_unaccent(coalesce(new.summary, '') || ' ' || coalesce(new.key_terms::text, ''))), 'C');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_document_search on public.crm_document;
create trigger crm_document_search before insert or update on public.crm_document
  for each row execute function public.crm_document_search_trg();

-- ---------------------------------------------------------------- helpers
-- Build an OR-of-prefixes tsquery from free terms ("sotheby guy" → 'sotheby':* | 'guy':*).
create or replace function public.crm_terms_query(p_terms text[]) returns tsquery
language plpgsql immutable as $$
declare q tsquery; t text; w text;
begin
  if p_terms is null then return null; end if;
  foreach t in array p_terms loop
    w := regexp_replace(crm_unaccent(t), '[^a-z0-9]+', '', 'g');
    if length(w) >= 2 then
      q := case when q is null then to_tsquery('simple', w || ':*') else q || to_tsquery('simple', w || ':*') end;
    end if;
  end loop;
  return q;
end $$;

-- Human label for a linked record, looked up in the existing tables when they exist.
create or replace function public.crm_target_label(p_type text, p_id bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare l text;
begin
  begin
    if p_type = 'parcel' and to_regclass('public.parcel') is not null then
      execute 'select ''Parcel '' || parcel_no || '' · '' || coalesce(ko, '''') from public.parcel where id = $1' into l using p_id;
    elsif p_type = 'prospect' and to_regclass('public.prospect') is not null then
      execute 'select name from public.prospect where id = $1' into l using p_id;
    elsif p_type = 'folio' and to_regclass('public.lr_unit') is not null then
      execute 'select ''Folio '' || unit_no || '' · '' || coalesce(ko, '''') from public.lr_unit where id = $1' into l using p_id;
    elsif p_type = 'person' and to_regclass('public.person') is not null then
      execute 'select name from public.person where id = $1' into l using p_id;
    elsif p_type = 'heir' and to_regclass('public.heir') is not null then
      execute 'select name from public.heir where id = $1' into l using p_id;
    elsif p_type = 'contact' then
      select name into l from public.crm_contact where id = p_id;
    elsif p_type = 'document' then
      select title into l from public.crm_document where id = p_id;
    elsif p_type = 'interaction' then
      select title into l from public.crm_interaction where id = p_id;
    end if;
  exception when others then l := null; end;
  return l;
end $$;

-- Coordinates + registry reference for a parcel (used by the cards), tolerant of schema differences.
create or replace function public.crm_parcel_brief(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare j jsonb;
begin
  begin
    execute 'select jsonb_build_object(''parcel_id'', id, ''parcel_no'', parcel_no, ''ko'', ko, ''area_m2'', area_m2, ''lat'', lat, ''lon'', lon, ''nat_ref'', nat_ref) from public.parcel where id = $1' into j using p_id;
  exception when others then j := null; end;
  return coalesce(j, jsonb_build_object('parcel_id', p_id));
end $$;

-- ---------------------------------------------------------------- the profile card
create or replace function public.crm_contact_card(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'name', c.name, 'first_name', c.first_name, 'last_name', c.last_name,
    'role_title', c.role_title, 'category', c.category, 'tags', c.tags,
    'phone', c.phone, 'phone2', c.phone2, 'email', c.email, 'website', c.website,
    'address', c.address, 'city', c.city, 'country', c.country, 'language', c.language,
    'how_we_met', c.how_we_met, 'notes', c.notes, 'registry_refs', c.registry_refs,
    'registry_person_id', c.registry_person_id, 'heir_id', c.heir_id,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'organisation', (select jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'address', o.address, 'city', o.city, 'registry_refs', o.registry_refs)
                     from public.crm_contact o where o.id = c.organisation_id),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'role_title', p.role_title, 'phone', p.phone, 'email', p.email) order by p.name), '[]'::jsonb)
               from public.crm_contact p where p.organisation_id = c.id),
    'links', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'target_type', l.target_type, 'target_id', l.target_id, 'relation', l.relation,
                       'label', coalesce(l.label, crm_target_label(l.target_type, l.target_id)),
                       'parcel', case when l.target_type = 'parcel' then crm_parcel_brief(l.target_id) end) order by l.target_type, l.id), '[]'::jsonb)
              from public.crm_link l where l.contact_id = c.id),
    'interactions', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'occurred_at', i.occurred_at, 'time_known', i.time_known, 'title', i.title,
                       'summary', i.summary, 'outcome', i.outcome, 'next_step', i.next_step, 'next_step_due', i.next_step_due, 'next_step_done', i.next_step_done,
                       'location_text', i.location_text, 'lat', i.lat, 'lon', i.lon, 'parcel_id', i.parcel_id, 'prospect_id', i.prospect_id,
                       'role', ip.role,
                       'others', (select coalesce(jsonb_agg(jsonb_build_object('id', c2.id, 'name', c2.name, 'role', ip2.role) order by c2.name), '[]'::jsonb)
                                  from public.crm_interaction_participant ip2 join public.crm_contact c2 on c2.id = ip2.contact_id
                                  where ip2.interaction_id = i.id and ip2.contact_id <> c.id),
                       'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'status', d.status, 'external_url', d.external_url, 'storage_path', d.storage_path, 'issued_on', d.issued_on) order by d.id), '[]'::jsonb)
                                     from public.crm_document d where d.interaction_id = i.id)
                     ) order by i.occurred_at desc), '[]'::jsonb)
                     from public.crm_interaction_participant ip join public.crm_interaction i on i.id = ip.interaction_id where ip.contact_id = c.id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'status', d.status, 'external_url', d.external_url, 'storage_path', d.storage_path, 'issued_on', d.issued_on, 'summary', d.summary, 'key_terms', d.key_terms) order by d.issued_on desc nulls last, d.id desc), '[]'::jsonb)
                  from public.crm_document d where d.contact_id = c.id or d.organisation_id = c.id)
  )
  from public.crm_contact c where c.id = p_id
$$;

create or replace function public.crm_interaction_card(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', i.id, 'kind', i.kind, 'occurred_at', i.occurred_at, 'time_known', i.time_known, 'title', i.title,
    'summary', i.summary, 'details', i.details, 'outcome', i.outcome, 'next_step', i.next_step, 'next_step_due', i.next_step_due, 'next_step_done', i.next_step_done,
    'location_text', i.location_text, 'lat', i.lat, 'lon', i.lon, 'parcel_id', i.parcel_id, 'prospect_id', i.prospect_id, 'lr_unit_id', i.lr_unit_id,
    'parcel', case when i.parcel_id is not null then crm_parcel_brief(i.parcel_id) end,
    'prospect_name', case when i.prospect_id is not null then crm_target_label('prospect', i.prospect_id) end,
    'participants', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', ip.role, 'role_title', c.role_title, 'category', c.category, 'phone', c.phone, 'email', c.email,
                        'organisation', (select o.name from public.crm_contact o where o.id = c.organisation_id)) order by ip.role, c.name), '[]'::jsonb)
                     from public.crm_interaction_participant ip join public.crm_contact c on c.id = ip.contact_id where ip.interaction_id = i.id),
    'links', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'target_type', l.target_type, 'target_id', l.target_id, 'relation', l.relation,
                       'label', coalesce(l.label, crm_target_label(l.target_type, l.target_id)),
                       'parcel', case when l.target_type = 'parcel' then crm_parcel_brief(l.target_id) end) order by l.target_type, l.id), '[]'::jsonb)
              from public.crm_link l where l.interaction_id = i.id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'status', d.status, 'external_url', d.external_url, 'storage_path', d.storage_path, 'issued_on', d.issued_on, 'summary', d.summary) order by d.id), '[]'::jsonb)
                  from public.crm_document d where d.interaction_id = i.id)
  )
  from public.crm_interaction i where i.id = p_id
$$;

-- ---------------------------------------------------------------- the question answerer
-- p_terms: content words from the question; p_from/p_to: time window (nullable);
-- p_places: place hints already lower-cased (aliases, municipality names, parcel numbers);
-- p_roles: role words (broker, lawyer, owner …) mapped to categories/tags by the caller;
-- p_intent: 'contact' | 'organisation' | 'interaction' | 'document' | 'any'.
create or replace function public.crm_ask(
  p_terms text[], p_from timestamptz, p_to timestamptz, p_places text[], p_roles text[], p_intent text default 'any', p_limit int default 5
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q tsquery := crm_terms_query(p_terms);
  place_parcels bigint[];
  place_prospects bigint[];
  place_like text[];
  res jsonb;
  contacts jsonb; interactions jsonb; documents jsonb;
begin
  -- resolve place hints to parcels / prospects through aliases; keep the raw text for ilike matching
  select coalesce(array_agg(parcel_id) filter (where parcel_id is not null), '{}'),
         coalesce(array_agg(prospect_id) filter (where prospect_id is not null), '{}')
    into place_parcels, place_prospects
    from public.crm_place_alias a
   where p_places is not null and exists (select 1 from unnest(p_places) ph where crm_unaccent(ph) = a.alias or a.alias like '%' || crm_unaccent(ph) || '%');
  place_like := (select coalesce(array_agg('%' || crm_unaccent(ph) || '%'), '{}') from unnest(coalesce(p_places, '{}')) ph);

  -- interactions in scope: time window and/or place
  with scoped as (
    select i.id,
      (case when p_from is not null and i.occurred_at >= p_from and i.occurred_at < coalesce(p_to, 'infinity'::timestamptz) then 2.0
            when p_from is null and p_to is not null and i.occurred_at < p_to then 0.5 else 0 end) as t_score,
      (case when (array_length(place_parcels, 1) > 0 and i.parcel_id = any(place_parcels))
              or (array_length(place_prospects, 1) > 0 and i.prospect_id = any(place_prospects))
              or (array_length(place_like, 1) > 0 and crm_unaccent(i.location_text) like any(place_like))
              or (array_length(place_like, 1) > 0 and exists (select 1 from public.crm_link l where l.interaction_id = i.id and crm_unaccent(coalesce(l.label, crm_target_label(l.target_type, l.target_id))) like any(place_like)))
            then 1.5 else 0 end) as p_score,
      (case when q is not null and i.search @@ q then ts_rank(i.search, q) * 3 else 0 end) as k_score
    from public.crm_interaction i
  ),
  contact_scores as (
    select c.id,
      (case when q is not null and c.search @@ q then ts_rank(c.search, q) * 4 else 0 end)
      + coalesce((select max(word_similarity(crm_unaccent(t), crm_unaccent(c.name))) from unnest(coalesce(p_terms, '{}')) t), 0) * 2
      + coalesce((select max(s.t_score + s.p_score + s.k_score + (case when ip.role = 'counterparty' then 0.75 else 0 end)) from public.crm_interaction_participant ip join scoped s on s.id = ip.interaction_id where ip.contact_id = c.id), 0)
      + (case when p_roles is not null and (c.category = any(p_roles) or c.tags && p_roles or exists (select 1 from unnest(p_roles) r where crm_unaccent(c.role_title) like '%' || r || '%')) then 1.5 else 0 end)
      + (case when p_intent = 'organisation' and c.kind = 'organisation' then 0.5 when p_intent = 'contact' and c.kind = 'person' then 0.5 else 0 end)
      - (case when c.category = 'team' then 1.0 else 0 end)   -- "we" are rarely the answer
      as score
    from public.crm_contact c
  )
  select coalesce(jsonb_agg(crm_contact_card(cs.id) || jsonb_build_object('score', round(cs.score::numeric, 3)) order by cs.score desc), '[]'::jsonb)
    into contacts
    from (select id, score from contact_scores where score > 0.35 order by score desc limit p_limit) cs;

  with scoped as (
    select i.id,
      (case when p_from is not null and i.occurred_at >= p_from and i.occurred_at < coalesce(p_to, 'infinity'::timestamptz) then 2.0 else 0 end) as t_score,
      (case when (array_length(place_parcels, 1) > 0 and i.parcel_id = any(place_parcels))
              or (array_length(place_prospects, 1) > 0 and i.prospect_id = any(place_prospects))
              or (array_length(place_like, 1) > 0 and crm_unaccent(i.location_text) like any(place_like)) then 1.5 else 0 end) as p_score,
      (case when q is not null and i.search @@ q then ts_rank(i.search, q) * 3 else 0 end) as k_score,
      (case when p_roles is not null and exists (select 1 from public.crm_interaction_participant ip join public.crm_contact c on c.id = ip.contact_id
                                                  where ip.interaction_id = i.id and (c.category = any(p_roles) or c.tags && p_roles)) then 1.0 else 0 end) as r_score
    from public.crm_interaction i
  )
  select coalesce(jsonb_agg(crm_interaction_card(s.id) || jsonb_build_object('score', round((s.t_score + s.p_score + s.k_score + s.r_score)::numeric, 3)) order by (s.t_score + s.p_score + s.k_score + s.r_score) desc, s.id desc), '[]'::jsonb)
    into interactions
    from (select * from scoped where (t_score + p_score + k_score + r_score) > 0.35 order by (t_score + p_score + k_score + r_score) desc limit p_limit) s;

  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'status', d.status, 'external_url', d.external_url, 'storage_path', d.storage_path,
                    'issued_on', d.issued_on, 'summary', d.summary, 'key_terms', d.key_terms, 'contact_id', d.contact_id, 'interaction_id', d.interaction_id,
                    'contact_name', (select name from public.crm_contact where id = d.contact_id),
                    'score', round(d.score::numeric, 3)) order by d.score desc), '[]'::jsonb)
    into documents
    from (select d.*, (case when q is not null and d.search @@ q then ts_rank(d.search, q) * 3 else 0 end)
                      + (case when p_from is not null and d.issued_on >= p_from::date and d.issued_on < coalesce(p_to, 'infinity'::timestamptz)::date then 1.0 else 0 end)
                      + (case when p_intent = 'document' then 0.5 else 0 end) as score
            from public.crm_document d) d
   where d.score > 0.35
   limit p_limit;

  res := jsonb_build_object('contacts', contacts, 'interactions', interactions, 'documents', documents,
                            'resolved_places', jsonb_build_object('parcels', to_jsonb(place_parcels), 'prospects', to_jsonb(place_prospects)));
  return res;
end $$;

-- everything tied to one parcel or one prospect (parcel popup and prospect file)
create or replace function public.crm_for_target(p_type text, p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contacts', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'category', c.category, 'role_title', c.role_title, 'phone', c.phone, 'email', c.email, 'relation', l.relation,
                       'organisation', (select o.name from public.crm_contact o where o.id = c.organisation_id))), '[]'::jsonb)
                 from public.crm_link l join public.crm_contact c on c.id = l.contact_id where l.target_type = p_type and l.target_id = p_id),
    'interactions', (select coalesce(jsonb_agg(crm_interaction_card(x.id) order by x.occurred_at desc), '[]'::jsonb)
                     from (select distinct i.id, i.occurred_at from public.crm_interaction i
                           left join public.crm_link l on l.interaction_id = i.id and l.target_type = p_type and l.target_id = p_id
                           where l.id is not null or (p_type = 'parcel' and i.parcel_id = p_id) or (p_type = 'prospect' and i.prospect_id = p_id)) x),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'status', d.status, 'external_url', d.external_url, 'storage_path', d.storage_path, 'issued_on', d.issued_on, 'summary', d.summary) order by d.id), '[]'::jsonb)
                  from (select distinct d.* from public.crm_document d
                        left join public.crm_link l on l.document_id = d.id and l.target_type = p_type and l.target_id = p_id
                        where l.id is not null or (p_type = 'parcel' and d.parcel_id = p_id) or (p_type = 'prospect' and d.prospect_id = p_id)) d)
  )
$$;

-- counts for the header
create or replace function public.crm_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contacts', (select count(*) from public.crm_contact where kind = 'person'),
    'organisations', (select count(*) from public.crm_contact where kind = 'organisation'),
    'interactions', (select count(*) from public.crm_interaction),
    'documents', (select count(*) from public.crm_document),
    'open_next_steps', (select count(*) from public.crm_interaction where next_step is not null and not next_step_done)
  )
$$;

-- ---------------------------------------------------------------- lock-down (audit convention)
alter table public.crm_contact enable row level security;
alter table public.crm_interaction enable row level security;
alter table public.crm_interaction_participant enable row level security;
alter table public.crm_document enable row level security;
alter table public.crm_link enable row level security;
alter table public.crm_place_alias enable row level security;
revoke all on public.crm_contact, public.crm_interaction, public.crm_interaction_participant, public.crm_document, public.crm_link, public.crm_place_alias from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['crm_unaccent(text)', 'crm_terms_query(text[])', 'crm_target_label(text,bigint)', 'crm_parcel_brief(bigint)',
                           'crm_contact_card(bigint)', 'crm_interaction_card(bigint)',
                           'crm_ask(text[],timestamptz,timestamptz,text[],text[],text,int)', 'crm_for_target(text,bigint)', 'crm_status()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
