# CivicSteps

Know what's being decided that affects you, from city hall to Congress, and make your voice heard.

Users enter their ZIP code, a few optional facts about themselves, the topics they follow and their **pet issues** (for example "climbing access in national parks"). CivicSteps then:

- builds a feed of bills, city council agenda items and federal public comment periods that affect them, ranked by relevance and deadline
- estimates how each item would affect them ("likely costs you: raises BART fares"), asking one quick question only when an item depends on something it doesn't know yet ("Do you ride BART?") and remembering the answer for later items
- lists their city, state and federal representatives, with contact info and recent sponsorships
- drafts emails, call scripts and public comments in the user's own voice, or hands them a prompt to paste into any AI assistant
- awards points, badges and weekly streaks for participation (never for taking a side)
- emails pet-issue alerts, deadline reminders and a weekly digest

Free, open source and nonpartisan.

## How it keeps AI costs low

AI cost grows with the number of **items**, not users:

| Work | Runs | Model |
|---|---|---|
| Summarize and tag each bill or rule against a fixed topic taxonomy | Once per item, nightly, via the Message Batches API (50% off) | `claude-haiku-5-5`; `claude-sonnet-5-5` for significant or pet-issue items |
| Match items to users, and personalize "how this affects you" | Every page view | **No LLM.** SQL prefilter (`feed_candidates`), `lib/relevance.ts` and `lib/impact.ts` match per-item impact rules to the user's answers |
| Learn new facts to ask about ("Do you ride BART?") | Minted during per-item analysis, reusing existing facts; one small call per run merges near-duplicates (`ingest/consolidateFacts.ts`) | `claude-haiku-5-5` |
| Map a free-text pet issue to topics and keywords | Once when saved | `claude-haiku-5-5` |
| Draft a message | On request, capped per user per day | `claude-sonnet-5-5` |
| "Ask about my situation" (personal assessment of one item) | On request, capped per user per day, cached until the user's answers change | `claude-sonnet-5-5` |

Without `ANTHROPIC_API_KEY` everything still works: items are tagged with keyword rules (`lib/ai/heuristic.ts`), and drafting becomes "copy this prompt to your own AI". The nightly job logs its estimated token cost.

## Data sources

| Need | Source | Key |
|---|---|---|
| ZIP → districts | [Census ZCTA Gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html) (bundled, `npm run gen:zcta`) + [US Census Geocoder](https://geocoding.geo.census.gov/) | none |
| Federal legislators | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) | none |
| Federal bills | [Congress.gov API](https://api.congress.gov/) | [api.data.gov](https://api.data.gov/signup/) |
| Federal comment periods | [Federal Register API](https://www.federalregister.gov/developers) | none |
| State legislators and bills | [Open States](https://open.pluralpolicy.com/) | free key |
| City council | [Legistar Web API](https://webapi.legistar.com/) for cities in `ingest/legistar.config.ts` | none |
| Where city items are | Street addresses in the item text, geocoded with the [US Census Geocoder](https://geocoding.geo.census.gov/) (`ingest/locate.ts`) | none |
| Map tiles | [OpenStreetMap](https://www.openstreetmap.org/) (configurable via `NEXT_PUBLIC_MAP_TILES_URL`) | none |

## Local development

Requires Node 22+ and Docker.

```bash
npm install
cp .env.example .env.local          # add API keys you have; all are optional locally
npm run db:start                     # local Supabase (Postgres + auth + Mailpit)
# copy the anon and service_role keys it prints into .env.local
npm run ingest -- --limit=40         # pull real data (Congress.gov falls back to DEMO_KEY, which is slow)
npm run dev
```

Sign-in uses magic links. Locally they land in Mailpit at http://127.0.0.1:54324.

Useful commands:

```bash
npm test                                         # unit tests (fixtures from real API responses)
npm run lint && npm run typecheck
npm run ingest -- --only=federalregister,analyze --limit=20 --wait   # --wait polls the AI batch to completion
npm run notify -- --digest                       # emails (logs instead of sending without RESEND_API_KEY)
npm run gen:seed && npm run db:reset             # after editing lib/taxonomy.ts, badges or legistar.config.ts
npm run db:types                                 # regenerate DB types after a migration
npm run facts:report                             # which learned facts come up most (candidates for onboarding)
npm run ingest -- --only=openstates,legistar,locations,analyze --new-areas-only --wait   # backfill states new users just joined from
```

### Advocacy campaigns

Browse → Explore advocacy campaigns lists organizations by topic. The directory maps organizations to issues in `lib/advocacy-organizations.json`. Item pages match identified bills, agenda records, and rulemaking documents to organization sources. Topic links appear separately from positions on a particular item.

After applying the database migrations, run `npm run campaigns:refresh` to refresh the sources and check every indexed item. The campaign workflow runs daily at 10:45 UTC on the default branch using the same Supabase secrets as nightly ingestion. It publishes one snapshot after the scan completes. Each source retains its last successful check date when a retry fails. The app can use the bundled source review before the first hosted refresh.

### New areas are ingested on demand

State bills are fetched for states where users live, and council items come from the cities in `ingest/legistar.config.ts`. Saving a ZIP in an uncovered area queues its initial index in `ingest_coverage`. The worker backfills recent legislative activity and laws signed in the past 120 days, then prioritizes analysis for those areas. The civic feed automatically refreshes while indexing is pending and shows progress for each supported source.

Set `INGEST_DISPATCH_TOKEN` and `INGEST_DISPATCH_REPO` on the app to dispatch `.github/workflows/backfill.yml` on demand. The nightly job also picks up queued areas and unfinished analysis. Apply the Supabase migrations before deploying the app and workflows.

### Adding your city

If your city publishes council agendas on Legistar (`<city>.legistar.com`), add it to `ingest/legistar.config.ts`, then run `npm run gen:seed && npm run db:reset` (or insert the seed rows on a hosted database).

Add verified portrait URLs to the city's `photos` map in `ingest/legistar.config.ts`, keyed by Legistar person ID. The next officials sync writes them to `officials.photo_url`. To refresh an existing database, run `npm run ingest -- --only=officials`. Seattle uses the city roster, and Sunnyvale uses the League of Women Voters of Cupertino-Sunnyvale roster.

County and other local data sources can supply `officials.photo_url` directly when they import their rosters. CivicSteps currently imports local rosters from its configured Legistar cities.

## Deploying

Free tiers of Supabase and Vercel are enough for a personal or small instance. The nightly ingest also keeps a free Supabase project from pausing.

1. **Database.** `npx supabase login`, then:
   ```bash
   npx supabase projects create civicsteps --region us-west-1 --db-password '<strong password>'
   npx supabase link --project-ref <ref>
   npx supabase db push --remote --include-seed  # hosted migrations + supabase/seed.sql
   npx supabase projects api-keys --project-ref <ref>
   ```
   In Auth → URL Configuration, set the Site URL to your app's URL and add `<your-site>/auth/callback` as a redirect URL. Don't run `supabase config push`, because `supabase/config.toml` holds localhost settings.
2. **App.** Import the repo on Vercel (or `npx vercel link && npx vercel git connect`) and add the variables from `.env.example` for Production. Pushes to `main` then deploy automatically.
3. **Nightly jobs.** Add GitHub secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `API_DATA_GOV_KEY`, `OPENSTATES_API_KEY` (and `RESEND_API_KEY` for emails), and variables `SITE_URL` and `EMAIL_FROM`. `.github/workflows/ingest.yml` then runs ingestion and email alerts nightly; it skips itself until the secrets exist. For a first load: `gh workflow run ingest.yml -f args="--limit=40 --wait"`.
4. **Optional:** to backfill a new user's state immediately, create a fine-grained GitHub token with "Actions: write" on the repo and set `INGEST_DISPATCH_TOKEN` and `INGEST_DISPATCH_REPO` on the app.

Supabase's built-in email only delivers magic links to members of your Supabase organization, a few per hour. To let anyone sign in, configure custom SMTP (for example Resend) under Auth → SMTP Settings.

## Layout

```
app/              Next.js routes: feed, items, reps, draft (+ /api/draft), onboarding, profile
lib/relevance.ts  ranking (pure, unit-tested)
lib/gamification.ts  points, badges, streaks (pure, unit-tested)
lib/ai/           batch analysis, pet-issue mapping, drafting, no-AI fallbacks
lib/civic/        geocoding and officials
ingest/           source adapters, nightly runner, email notifier
supabase/         schema, RLS policies, generated seed
```

## Privacy

- We only ask for a ZIP code, never a street address. It is stored for the user only (row-level security) and is never sent to an AI. Districts are looked up from a point inside the ZIP, so the ZIP itself never leaves the server. Drafts include only city and state.
- A ZIP can cross district lines; we use the Census interior point of the ZIP, so users near a boundary may be matched to a neighboring district.
- Profile questions are optional broad ranges. Follow-up questions ("Do you ride BART?") are optional too, with "Prefer not to say", and every answer can be changed or forgotten on the profile page. We never prompt for immigration status, health conditions, religion, sexuality or politics.
- Item maps show the user's ZIP as an approximate area around its middle, never a point. Map tiles load from OpenStreetMap (or the configured provider) in the user's browser, so that provider sees which area is being viewed, as with any web map.
- Answers are matched to items in plain code; they are not sent to an AI. The one exception is "Ask about my situation", which the user starts explicitly: it sends their profile answers and city/state (never the ZIP code, name or email) to Claude.
- Points and badges are written server-side only.
