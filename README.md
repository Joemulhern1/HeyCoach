# HeyCoach

Your personal AI cycling coach and nutritionist. Set power **and** weight goals, log your
completed rides, get an adaptive weekly plan (cycling + gym), nutrition that runs your
deficit intelligently, structured workouts you can push to a Garmin device, and a coach you
can ask anything. Single-user, self-hosted, your data stays yours.

## What it does

- **Two goals tracked together** — FTP (e.g. 240→270W) and weight (e.g. 84→75kg). The
  dashboard shows both, plus your projected power-to-weight (the number that actually wins
  races): 240W/84kg = 2.86 W/kg today → 270W/75kg = **3.6 W/kg**.
- **AI weekly plan** — cycling + gym, periodised toward your event, adapting to what you've
  actually done.
- **Garmin workout export** — every ride day generates a structured `.fit` workout with
  on-device power targets (see "Send a workout to Garmin").
- **Three ways to log completed sessions, all AI-safe (your own data):**
  - 📷 **Screenshot** — screenshot a Strava/Garmin activity; the app's AI reads the numbers off it.
  - 📁 **File** — drop a `.fit`/`.tcx`/`.gpx` (full power/HR/TSS).
  - ✎ **Manual** — type the key numbers in ~20 seconds.
- **Nutrition engine** — training-day vs rest-day calories + protein, run as "fuel the work,
  diet the rest": near-maintenance on hard/long days to protect FTP, the deficit on easy/rest
  days, protein high to hold lean mass, loss rate capped at ~0.5kg/week.
- **Weight log** — quick weigh-ins, current + 7-day average, to-target readout. Feeds the coach.
- **Ask your coach** — training or nutrition, in plain language.
- **Strava auto-sync (optional)** — see "Strava" below; off by default.

## Quick start (runs immediately)

```bash
cp .env.example .env        # put your Anthropic API key in .env
npm install
npm run dev                 # http://localhost:3000
```

Get a key at https://console.anthropic.com. It's used **server-side only**.

## Send a workout to Garmin

Open a ride day → **Garmin workout (.FIT)** to download the structured file. Then:
- **Side-load (no account, works today):** plug your device in via USB and copy the `.fit`
  into the device's `NewFiles` folder (some devices: the `Workouts` folder). It appears under
  **Training > Workouts**.
- Note: Garmin Connect does **not** accept workout `.fit` uploads to the cloud — it's
  device-direct. Wireless push to the Connect calendar needs either Garmin's approved Training
  API (partner review) or the unofficial `garminconnect` Python push with your own login
  (ToS-gray) — left out of the box on purpose.

## Strava (optional auto-sync)

Off unless you set `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET`. Note the 2026 reality:
Standard-Tier access **requires an active Strava subscription**, and Strava restricts using
API data in AI models (their MCP connector is the sanctioned "Strava data + AI" route). So
HeyCoach imports Strava activities as **log-only** by default; they only feed the AI coach if
you tick "Use Strava activities for AI coaching." For the adaptation piece, the screenshot/
file/manual paths are cleaner. To enable: create an app at https://www.strava.com/settings/api,
set the Authorization Callback Domain to your host, fill the env vars, then click
**Connect Strava**.

## Deploy (~30 min)

- **Vercel** (serverless, free Hobby): the store auto-switches to Upstash Redis when its env
  vars are present. Install **Upstash Redis** from the Vercel Marketplace (it injects the vars),
  add `ANTHROPIC_API_KEY`, push to GitHub, import, deploy. No code change needed.
- **Railway / Render / Fly.io**: keep the JSON store; add a volume, set `DATA_DIR` to it, set
  `ANTHROPIC_API_KEY`. Build `npm run build`, start `npm run start`.
- **Local / home server / VPS**: the default file store persists fine.

## Architecture

```
app/
  page.jsx                       UI (onboarding + dashboard), inline-styled
  api/state, profile, plan, coach
  api/sessions  (file import) + /screenshot (vision) + /manual
  api/weight                     weigh-in log
  api/workout                    GET ?day=N -> structured .fit download
  api/strava/connect|callback|sync|status   optional auto-sync
lib/
  store.js      single-user JSON store (swap for KV/Postgres on serverless)
  anthropic.js  Claude client (text + vision)
  coach.js      plan + Q&A prompts, screenshot extraction, weight/deficit logic
  parse.js      .fit/.tcx/.gpx -> session summary, rough TSS
  fit.js        structured workout -> Garmin .fit (official @garmin/fitsdk)
  strava.js     OAuth + activity fetch (optional)
```

## Roadmap

- Mark plan days complete from logged sessions; track compliance & CTL/ATL.
- FTP auto-detection from imported efforts.
- Wireless Garmin push (approved Training API) and multi-user accounts.

Model defaults to **Haiku 4.5** (`claude-haiku-4-5-20251001`) — $1/$5 per Mtok, vision-capable — for all calls. Set `ANTHROPIC_PLAN_MODEL=claude-sonnet-4-6` to upgrade only the weekly-plan call. Change the default via `ANTHROPIC_MODEL`.
