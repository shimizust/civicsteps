# CivicSteps

Know what's being decided that affects you, from city hall to Congress, and make your voice heard.

Users enter their ZIP code, a few optional facts about themselves, the topics they follow and their **pet issues** (for example "climbing access in national parks"). CivicSteps then:

- builds a feed of bills, city council agenda items and federal public comment periods that affect them, ranked by relevance and deadline
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
| Match items to users | Every page view | **No LLM.** SQL prefilter (`feed_candidates`) plus `lib/relevance.ts` |
| Map a free-text pet issue to topics and keywords | Once when saved | `claude-haiku-5-5` |
| Draft a message | On request, capped per user per day | `claude-sonnet-5-5` |

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
```

### Adding your city

If your city publishes council agendas on Legistar (`<city>.legistar.com`), add it to `ingest/legistar.config.ts`, then run `npm run gen:seed && npm run db:reset` (or insert the seed rows on a hosted database).

## Deploying

1. Create a Supabase project and run the migrations (`npx supabase link && npx supabase db push`), then load `supabase/seed.sql`. In Auth settings, set the Site URL and add `<your-site>/auth/callback` as a redirect URL.
2. Deploy the Next.js app (for example on Vercel) with the variables from `.env.example`.
3. Add the same secrets to GitHub (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `API_DATA_GOV_KEY`, `OPENSTATES_API_KEY`, `RESEND_API_KEY`) and the variables `SITE_URL` and `EMAIL_FROM`. `.github/workflows/ingest.yml` then runs ingestion and email alerts nightly.

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
- Profile questions are optional broad ranges.
- Points and badges are written server-side only.
