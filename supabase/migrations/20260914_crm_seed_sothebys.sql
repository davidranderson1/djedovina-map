-- Djedovina · first contacts, the Sotheby's valuation visit at the Kučine house, and the draft agreement.
-- Seed 2026-09-14. Idempotent: re-running updates the same rows (matched on name / title).
-- Parcel and prospect links are resolved by natural keys at run time and skipped if not found.

do $$
declare
  v_org bigint; v_marko bigint; v_hrvoje bigint; v_david bigint;
  v_meeting bigint; v_doc bigint;
  v_p4 bigint; v_p5 bigint; v_prospect bigint;
  v_lat double precision; v_lon double precision;
  v_docs_url text := 'https://docs.google.com/document/d/1qEETCW2tRY3_fo_v_FPn_xyduf4wBkxsafM7NVLg-mQ/edit';
  v_transl_url text := 'https://docs.google.com/document/d/174zUkT3Eqq75dYQpTpugMRgkChltD8R3KZjOZmqXp4A/edit';
begin
  -- ---------------- organisation
  insert into public.crm_contact (kind, name, category, phone, email, website, address, city, country, tags, how_we_met, notes, registry_refs, created_by)
  select 'organisation', 'Porta Stella-Luxury Real Estate d.o.o. (Croatia Sotheby''s International Realty)', 'broker',
          '+385 21 586 957', 'info@sothebysrealty.hr', 'https://www.sothebysrealty.hr',
          'Dubrovačka 3a (registered seat); office Ulica Domovinskog rata 61', 'Split', 'HR',
          array['broker','sotheby''s','luxury','split'],
          'Their managing partner Marko Pažanin came to Hrvoje''s house in Kučine on 13 September 2026 to assess its value.',
          'Franchisee trading as Croatia Sotheby''s International Realty. Licensed broker: HGK Register of brokers 4/2017 (entered 4 Jan 2017, Ministry decision 20 Dec 2016). Professional liability insurer on record: Allianz Hrvatska d.d. Signatory of the HGK code of ethics. Company OIB 55840625811.',
          jsonb_build_object('hgk_register', '4/2017', 'hgk_register_url', 'https://digitalnakomora.hr/e-javne-ovlasti/promet-nekretnina/registar-posrednika-u-prometu-nekretnina/detalji/122076', 'company_oib', '55840625811', 'insurer', 'Allianz Hrvatska d.d.'),
          'claude'
  where not exists (select 1 from public.crm_contact where kind = 'organisation' and name like 'Porta Stella-Luxury Real Estate%');
  select id into v_org from public.crm_contact where kind = 'organisation' and name like 'Porta Stella-Luxury Real Estate%' limit 1;

  -- ---------------- Marko Pažanin
  insert into public.crm_contact (kind, name, first_name, last_name, role_title, organisation_id, category, phone, email, address, city, country, language, tags, how_we_met, notes, registry_refs, created_by)
  select 'person', 'Marko Pažanin', 'Marko', 'Pažanin', 'Director and managing partner, Croatia Sotheby''s International Realty (Split)', v_org, 'broker',
         '+385 98 904 8370', 'marko.pazanin@sothebysrealty.hr', 'Dubrovačka 3A, 21000 Split', 'Split', 'HR', 'hr',
         array['broker','sotheby''s','valuation','kučine'],
         'Met 13 September 2026 at Hrvoje''s house in Kučine — walked through the house to assess its value and left a draft brokerage agreement (asking price €2,300,000; 2% + VAT).',
         'Licensed agent: HGK Directory of agents 171/2016 (exam passed 19 Sep 2016, entered 22 Dec 2016). Signs for the company independently.',
         jsonb_build_object('hgk_agent', '171/2016'),
         'claude'
  where not exists (select 1 from public.crm_contact where kind = 'person' and name = 'Marko Pažanin');
  select id into v_marko from public.crm_contact where kind = 'person' and name = 'Marko Pažanin' limit 1;

  -- ---------------- Hrvoje Tomić (owner of the Kučine house)
  insert into public.crm_contact (kind, name, first_name, last_name, role_title, category, phone, address, city, country, language, tags, notes, created_by)
  select 'person', 'Hrvoje Tomić', 'Hrvoje', 'Tomić', 'Owner of the Kučine house (kč. 1245/4 and 1245/5, folio 905 k.o. Kučine)', 'owner',
         '+385 95 395 3343', 'Šetalište D. Markovića 70, Kučine', 'Solin', 'HR', 'hr',
         array['owner','kučine','partner'],
         'Principal named in the Sotheby''s brokerage agreement draft of 14 Sep 2026. Attended the valuation visit with David.',
         'claude'
  where not exists (select 1 from public.crm_contact where kind = 'person' and name = 'Hrvoje Tomić');
  select id into v_hrvoje from public.crm_contact where kind = 'person' and name = 'Hrvoje Tomić' limit 1;

  -- ---------------- David (us)
  insert into public.crm_contact (kind, name, first_name, last_name, role_title, category, tags, created_by)
  select 'person', 'David Anderson', 'David', 'Anderson', 'Djedovina', 'team', array['team','djedovina'], 'claude'
  where not exists (select 1 from public.crm_contact where kind = 'person' and name = 'David Anderson');
  select id into v_david from public.crm_contact where kind = 'person' and name = 'David Anderson' limit 1;

  -- ---------------- the parcels and the prospect (looked up; skipped when not present)
  begin
    execute $q$select id, lat, lon from public.parcel where upper(ko) like 'KU%INE%' and parcel_no = '1245/4' limit 1$q$ into v_p4, v_lat, v_lon;
    execute $q$select id from public.parcel where upper(ko) like 'KU%INE%' and parcel_no = '1245/5' limit 1$q$ into v_p5;
  exception when others then v_p4 := null; v_p5 := null; end;
  begin
    if v_p4 is not null and to_regclass('public.prospect_parcel') is not null then
      execute $q$select prospect_id from public.prospect_parcel where parcel_id = $1 limit 1$q$ into v_prospect using v_p4;
    end if;
    if v_prospect is null and to_regclass('public.prospect') is not null then
      execute $q$select id from public.prospect where crm_unaccent(name) like '%kucine%' or crm_unaccent(coalesce(address, '')) like '%kucine%' or crm_unaccent(coalesce(address, '')) like '%markovica 70%' order by id limit 1$q$ into v_prospect;
    end if;
  exception when others then v_prospect := null; end;

  -- ---------------- the meeting (13 Sep 2026, time not recorded)
  insert into public.crm_interaction (kind, occurred_at, time_known, title, summary, details, outcome, next_step, next_step_due, location_text, lat, lon, parcel_id, prospect_id, created_by)
  select 'visit', '2026-09-13 10:00+02'::timestamptz, false,
         'Sotheby''s valuation visit — Hrvoje''s house, Kučine',
         'Marko Pažanin (Croatia Sotheby''s International Realty / Porta Stella) walked through Hrvoje''s house to assess its value and handed over a draft brokerage agreement.',
         'Draft terms: asking price €2,300,000; commission 2% + VAT (25%) payable at signing of the sale; 12-month term with automatic renewal; non-exclusive; commission tail after expiry with no time limit. Present: Marko Pažanin, Hrvoje Tomić, David Anderson.',
         'Draft agreement received (unsigned). Claude translated it and reviewed the clauses: do not sign as drafted — seven changes requested (payment on receipt of price, 6-month tail with buyer list, no automatic renewal, marketing and reporting duties, signed price list, buyer-side commission disclosure, softened ownership warranty).',
         'Send the broker the seven amendments (Croatian wording in the review) and ask for the price list, general terms, insurance details and the written buyer-side commission disclosure; pull a fresh land-registry extract for folio 905.',
         '2026-09-21',
         'Hrvoje''s house, Šetalište D. Markovića 70, Kučine (Solin) — kč. 1245/4 and 1245/5, k.o. Kučine',
         v_lat, v_lon, v_p4, v_prospect, 'claude'
  where not exists (select 1 from public.crm_interaction where title = 'Sotheby''s valuation visit — Hrvoje''s house, Kučine');
  select id into v_meeting from public.crm_interaction where title = 'Sotheby''s valuation visit — Hrvoje''s house, Kučine' limit 1;

  insert into public.crm_interaction_participant (interaction_id, contact_id, role) values (v_meeting, v_marko, 'counterparty') on conflict do nothing;
  insert into public.crm_interaction_participant (interaction_id, contact_id, role) values (v_meeting, v_hrvoje, 'host') on conflict do nothing;
  insert into public.crm_interaction_participant (interaction_id, contact_id, role) values (v_meeting, v_david, 'us') on conflict do nothing;

  -- ---------------- the document
  insert into public.crm_document (title, kind, status, file_name, external_url, issued_on, language, summary, key_terms, contact_id, organisation_id, interaction_id, prospect_id, parcel_id, created_by)
  select 'Brokerage agreement for the sale of the Kučine house — Porta Stella / Sotheby''s (draft, unsigned)', 'contract', 'draft',
         'Sothebys - ugovor.pdf', v_docs_url, '2026-09-14', 'hr',
         'Ugovor o posredovanju pri prodaji nekretnine. Principal Hrvoje Tomić; broker Porta Stella-Luxury Real Estate d.o.o.; parcels 1245/4 and 1245/5, folio 905 k.o. Kučine; asking price €2,300,000; 2% + VAT; 12 months, automatic renewal; non-exclusive. English translation and clause review in Drive (PRIVATE/Real Estate).',
         jsonb_build_object('asking_price_eur', 2300000, 'commission_pct', 2, 'vat_pct', 25, 'commission_total_eur_at_asking', 57500, 'term_months', 12, 'auto_renewal', true, 'exclusive', false,
                            'translation_url', v_transl_url, 'review_url', v_docs_url, 'verdict', 'do not sign as drafted — seven changes'),
         v_marko, v_org, v_meeting, v_prospect, v_p4, 'claude'
  where not exists (select 1 from public.crm_document where title like 'Brokerage agreement for the sale of the Kučine house%');
  select id into v_doc from public.crm_document where title like 'Brokerage agreement for the sale of the Kučine house%' limit 1;

  -- ---------------- links
  insert into public.crm_link (contact_id, target_type, target_id, relation, label)
  select v_marko, 'contact', v_org, 'works_at', 'Director, Porta Stella-Luxury Real Estate d.o.o.'
  where not exists (select 1 from public.crm_link where contact_id = v_marko and target_type = 'contact' and target_id = v_org);

  if v_p4 is not null then
    insert into public.crm_link (contact_id, target_type, target_id, relation) select v_hrvoje, 'parcel', v_p4, 'owner_of'
      where not exists (select 1 from public.crm_link where contact_id = v_hrvoje and target_type = 'parcel' and target_id = v_p4);
    insert into public.crm_link (contact_id, target_type, target_id, relation) select v_marko, 'parcel', v_p4, 'valued'
      where not exists (select 1 from public.crm_link where contact_id = v_marko and target_type = 'parcel' and target_id = v_p4);
    insert into public.crm_link (interaction_id, target_type, target_id, relation) select v_meeting, 'parcel', v_p4, 'met_at'
      where not exists (select 1 from public.crm_link where interaction_id = v_meeting and target_type = 'parcel' and target_id = v_p4);
    insert into public.crm_link (document_id, target_type, target_id, relation) select v_doc, 'parcel', v_p4, 'about'
      where not exists (select 1 from public.crm_link where document_id = v_doc and target_type = 'parcel' and target_id = v_p4);
  end if;
  if v_p5 is not null then
    insert into public.crm_link (contact_id, target_type, target_id, relation) select v_hrvoje, 'parcel', v_p5, 'owner_of'
      where not exists (select 1 from public.crm_link where contact_id = v_hrvoje and target_type = 'parcel' and target_id = v_p5);
    insert into public.crm_link (contact_id, target_type, target_id, relation) select v_marko, 'parcel', v_p5, 'valued'
      where not exists (select 1 from public.crm_link where contact_id = v_marko and target_type = 'parcel' and target_id = v_p5);
    insert into public.crm_link (interaction_id, target_type, target_id, relation) select v_meeting, 'parcel', v_p5, 'met_at'
      where not exists (select 1 from public.crm_link where interaction_id = v_meeting and target_type = 'parcel' and target_id = v_p5);
    insert into public.crm_link (document_id, target_type, target_id, relation) select v_doc, 'parcel', v_p5, 'about'
      where not exists (select 1 from public.crm_link where document_id = v_doc and target_type = 'parcel' and target_id = v_p5);
  end if;
  if v_prospect is not null then
    insert into public.crm_link (contact_id, target_type, target_id, relation) select v_hrvoje, 'prospect', v_prospect, 'owner_of'
      where not exists (select 1 from public.crm_link where contact_id = v_hrvoje and target_type = 'prospect' and target_id = v_prospect);
    insert into public.crm_link (interaction_id, target_type, target_id, relation) select v_meeting, 'prospect', v_prospect, 'met_at'
      where not exists (select 1 from public.crm_link where interaction_id = v_meeting and target_type = 'prospect' and target_id = v_prospect);
    insert into public.crm_link (document_id, target_type, target_id, relation) select v_doc, 'prospect', v_prospect, 'about'
      where not exists (select 1 from public.crm_link where document_id = v_doc and target_type = 'prospect' and target_id = v_prospect);
  end if;

  -- ---------------- place aliases so "our house" resolves
  insert into public.crm_place_alias (alias, label, parcel_id, prospect_id, lat, lon) values
    ('our house', 'Hrvoje''s house, Kučine', v_p4, v_prospect, v_lat, v_lon),
    ('the house', 'Hrvoje''s house, Kučine', v_p4, v_prospect, v_lat, v_lon),
    ('hrvoje''s house', 'Hrvoje''s house, Kučine', v_p4, v_prospect, v_lat, v_lon),
    ('hrvojes house', 'Hrvoje''s house, Kučine', v_p4, v_prospect, v_lat, v_lon),
    ('kucine house', 'Hrvoje''s house, Kučine', v_p4, v_prospect, v_lat, v_lon),
    ('kucine', 'Kučine (Solin)', v_p4, v_prospect, v_lat, v_lon)
  on conflict (alias) do update set parcel_id = excluded.parcel_id, prospect_id = excluded.prospect_id, lat = excluded.lat, lon = excluded.lon, label = excluded.label;

  raise notice 'seeded: org % marko % hrvoje % david % meeting % doc % parcels %/% prospect %', v_org, v_marko, v_hrvoje, v_david, v_meeting, v_doc, v_p4, v_p5, v_prospect;
end $$;
