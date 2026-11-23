# ADMITRA — Admissions & Examination Intelligence Platform (₹0/Month)

Standalone, GitHub-native admissions and entrance examination tracker built with **React + TypeScript + Vite**, a **version-controlled JSON database**, **once-daily GitHub Actions monitoring**, and **RFC 5545 `.ics` calendar subscription** for Google Calendar, Samsung Calendar, and Apple Calendar.

## Run Locally on macOS

```bash
npm --prefix apps/web install
npm run update    # Fetch live UNSW Sydney + JEE Main sources, update data/*.json & calendar.ics
npm run validate  # Verify JSON database & calendar.ics integrity
npm test          # Run automated monitoring & ICS unit/integration tests
npm run dev       # Launch local dashboard (http://localhost:5173)
npm run build     # Production static build
```

## Architecture

- `apps/web/` — React + TypeScript + Vite dark-graphite dashboard (5 views: Overview, Universities, Examinations, Timeline, Settings). Uses Vite `BASE_URL` so both `/` (local) and `/ADMITRA/` (GitHub Pages) load `./data/*.json` and `./calendar.ics` cleanly.
- `data/` — Public admissions JSON database (`universities.json` [18], `examinations.json` [8], `admissions.json`, `events.json`). Zero personal data, secrets, or credentials.
- `monitoring/` — TypeScript source adapters (`scraper.ts`), SHA-256 change detector (`changeDetector.ts`), and failure-isolating scheduler (`scheduler.ts`) that preserves previously verified dates if a portal is unavailable or blocked.
- `calendar/generateICS.ts` — Generates `apps/web/public/calendar.ics` with deterministic UIDs, RFC 5545 date-only events, and `Asia/Kolkata` timezone metadata.
- `.github/workflows/daily-update.yml` — Runs once daily at 08:00 IST (`30 2 * * *` UTC) plus manual `workflow_dispatch`.
- `.github/workflows/deploy.yml` — Runs tests, builds `apps/web` with `/ADMITRA/` base path, validates data/ICS, and deploys to GitHub Pages.

## Calendar Sync (Google Calendar, Samsung Calendar & Apple Calendar)

After enabling GitHub Pages (**Settings → Pages → Source: GitHub Actions**), your public subscription URL is:

`https://<your-github-username>.github.io/ADMITRA/calendar.ics`

- **Google Calendar**: Other calendars (`+`) → **From URL** → paste the subscription URL.
- **Samsung Calendar**: Enable Google account sync in Samsung Calendar settings; the subscribed Google Calendar appears automatically.
- **Apple Calendar**: File → **New Calendar Subscription** → paste the subscription URL.
- **One-time import**: Click **EXPORT .ICS** in the dashboard top bar or Settings tab.
