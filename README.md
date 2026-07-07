# HeyCoach

Your personal AI cycling coach and nutritionist. Set power **and** weight goals, log your
completed rides, get an adaptive weekly plan (cycling + gym), nutrition that runs your
deficit intelligently, structured workouts you can push to a Garmin device, and a coach you
can ask anything. Multi-user, self-hosted: each member gets their own login and fully isolated training data, managed from an admin console.

## What it does

- **Two goals tracked together** — FTP (e.g. 240→270W) and weight (e.g. 84→75kg). The
  dashboard shows both, plus your projected power-to-weight (the number that actually wins
  races): 240W/84kg = 2.86 W/kg today → 270W/75kg = **3.6 W/kg**.
- **AI multi-week plan on a calendar** — a full periodised block (Base → Build → Peak → Taper
  with recovery weeks) from now to your event, shown as a week-by-week calendar. Detailed
  intervals for a given week are generated on demand (tap a future ride → "Prepare this week"),
  so each ride still exports to Garmin.
- **Adaptive progression** — per-zone fitness "progression levels" (1–10) that move from your
  ride feedback (Nailed it / Completed / Hard / Missed on each logged session). The plan leans
  into your strong zones and eases the weak ones, and an FTP-bump prompt appears when a recent
  long effort suggests your FTP is underset.
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
- **Conversational coach (with memory + actions)**
- **Rich nutrition** — daily macro targets periodised to each day's training load, ride fuelling (carbs/hour, pre/during/post), and AI meal ideas with quick recipes using simple family-friendly Lidl-Ireland ingredients.
- **Adaptive training** — reads your fitness/fatigue/form from logged rides and, when you're overreached, recommends easing the week on the Today screen (one tap to confirm — never silent).
- **Conversational plan editing** — tell the coach in plain language how you want your calendar to change (e.g. "switch to Zwift racing come October"); it proposes the change and applies it only after you confirm. Focuses: Zwift racing, base, climbing, recovery.
- **Coach actions** — when the coach recommends easing the week or resting today, a one-tap button applies it to the real plan. — training or nutrition, in plain language.
- **Strava auto-sync (optional)** — see "Strava" below; off by default.

## Events & the forever coach

Add your races on the dashboard with an A/B/C priority (A = peak/taper for it, B = short sharpen, C = train through). The plan periodises around **all** of them and then keeps rolling past the last one into a transition/base block — it never dead-ends. After a race, rate it (Strong / Solid / Off-day) and the coach factors that in. Change events, then hit **Rebuild** to re-periodise.

**Time off (holidays & illness):** add date ranges on the dashboard. Those days are forced clear and the plan eases around them (deload into a holiday, rebuild gently after illness). **Moving & missed:** tap any planned day to swap it with another day in the week, or mark it **missed** — a miss nudges that zone's progression level down, just like a logged ride.

**How the plan is built:** the season structure (phases, recovery weeks, taper around races) is computed instantly in code — a deterministic periodization engine, so building is immediate with no timeout. The AI is used only to detail a week's intervals when you open a ride, plus coaching Q&A, screenshot reads and form analysis. View it as a **month calendar** or a week list.

**Auto-updating:** change events or time off and the plan re-periodises itself moments later — no manual Rebuild needed; rapid edits batch into one regeneration.

Note: building the plan is a single model call (skeleton for the whole horizon); a given week's detailed intervals fill on demand when you open a ride — this keeps generation fast and within serverless time limits.

## Members & logins

HeyCoach is multi-user. On first run, visit **/setup** to create the admin account (you). After that, manage members at **/admin** — add a friend with a username + temporary password, and they sign in at **/login** and start fresh. Every account's plan, sessions, weights, progression and Strava connection are stored under their own key and never visible to others. Passwords are scrypt-hashed; sessions are HMAC-signed cookies. **Set a stable `SESSION_SECRET`** (see `.env.example`) — it signs those sessions.

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
  login / setup / admin          pages: sign-in, first-admin, member management
  api/auth/*                     login, logout, setup, me
  api/admin/users                list / add / disable / delete members (admin only)
  api/events                     add / rate / remove races (A/B/C)
  api/availability               holidays & illness (no-training ranges)
  api/block/day                  move (swap) a session, or mark it missed
  api/state, profile, coach
  api/block + /block/week        multi-week plan + on-demand week detail
  api/feedback                   ride outcome -> progression update
  api/library/workout            export a library workout as Garmin .fit
  api/form                       on-demand AI read of your CTL/ATL/TSB (Haiku)
  api/sessions  (file import) + /screenshot (vision) + /manual
  api/weight                     weigh-in log
  api/workout                    GET ?day=N -> structured .fit download
  api/strava/connect|callback|sync|status   optional auto-sync
lib/
  store.js      per-user KV store (Upstash Redis or JSON files), auto-scoped to the session
  session.js    HMAC-signed session tokens (Edge + Node)
  users.js      member registry, scrypt password hashing
  anthropic.js  Claude client (text + vision)
  coach.js      plan + Q&A prompts, screenshot extraction, weight/deficit logic
  parse.js        .fit/.tcx/.gpx -> session summary, rough TSS
  progression.js  per-zone levels (deterministic), zone inference, FTP-bump heuristic
  library.js      56 curated power workouts (science-based), scaled to FTP
  analytics.js    Performance Management Chart (CTL/ATL/TSB), forecast
  zwo.js          build Zwift .zwo structured workouts (FTP-relative)
  meals.js        AI meal/recipe ideas (Lidl Ireland, family-friendly)
  ftp.js          FTP estimation from logged rides (best 20-min)
  nutrition.js    deterministic daily macro targets + ride fuelling
  fit.js        structured workout -> Garmin .fit (official @garmin/fitsdk)
  strava.js     OAuth + activity fetch (optional)
```

## Roadmap

- Mark plan days complete from logged sessions; track compliance & CTL/ATL.
- FTP auto-detection from imported efforts.
- Wireless Garmin push (approved Training API) and multi-user accounts.

Models: the frequent calls (coach Q&A, screenshot reads) use **Haiku 4.5** (`claude-haiku-4-5-20251001`, $1/$5 per Mtok, vision-capable). The weekly-plan call uses **Sonnet** by default because it's long structured JSON that small models can mangle — it's infrequent so the cost stays low. Override either: `ANTHROPIC_MODEL`, `ANTHROPIC_PLAN_MODEL`.
