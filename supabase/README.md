# Backend pieces kept with the app (v19)

- `migrations/20260914_crm_contacts_meetings.sql` — contacts, meetings (interactions), documents, links to parcels/prospects/folios/people, named places, and the `crm_ask` ranking function behind the natural-language Ask. Apply with the Supabase connector's `apply_migration` on project `zoojmmcdnyciadzktqnx`.
- Seed data (the first contacts, the 13 Sep 2026 valuation visit at the Kučine house, the draft brokerage agreement, the place aliases such as "our house") is **not** in this public repository: it holds contact details. It lives in Drive, PRIVATE/Real Estate, as `2026-09-14 - Real Estate - SEED - crm_seed_sothebys.sql.txt`, and is applied with `apply_migration` after the table migration. Idempotent.
- `functions/crm/index.ts` — the `crm` edge function (deploy with `verify_jwt = false`; it authorises every call by forwarding the caller's team key or sign-in token to `map-data?what=status`, then uses the service role). Optional secrets `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` switch on the AI-written answer sentence; without them the rule-based answer is used.

The map itself talks only to `map-data` (v12) and `crm`; no database credentials live in this repository.
