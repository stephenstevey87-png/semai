# SEMAI — AI Lecturer
**By Ssemambo Steven · SayMyTech Developers**

A full multi-tenant PWA that automatically teaches any course — programming, business,
science, law, anything — to your students when you're not around. Any institution can
register its own isolated space; its lecturers sign in, paste a course/module outline,
and SEMAI generates the slides, notes, and hands-on exercises, then delivers the lecture
hands-free with live voice narration.

Gemini AI brain · Browser voice · Slide + practical-screen switching · Multi-institution
Supabase backend (database, auth, and Edge Functions) with real student accounts and an
institution admin dashboard · Autonomous "teach → check-in → advance" flow

---

## Architecture

**Two services, not three.** The frontend talks directly to Supabase — no separate
backend server to deploy or keep running:

```
Netlify (static React/Vite build)
        │
        ▼
Supabase
  ├─ Postgres database   (courses, modules, slides, profiles) — RLS-protected
  ├─ Auth                (lecturer sign-in, email + password)
  └─ Edge Functions       (chat, explain-slide, generate-course)
                           — holds GEMINI_API_KEY server-side, calls Gemini
```

- **Reads** (loading a course, listing courses for the Join screen) go straight from
  the frontend to the Supabase database via `supabase-js`.
- **Writes** (a lecturer saving/deleting a course) also go straight from the frontend
  to Supabase — ownership is enforced by Postgres Row Level Security itself
  (`supabase/schema.sql`), not by a backend middleware layer.
- **AI calls** (chat, slide narration, course generation) go through three Supabase
  Edge Functions in `supabase/functions/`, which is the only place your Gemini API
  key lives — it's never sent to the browser.

A legacy Flask backend still exists in `backend/` from an earlier version of this
project. It's no longer required and isn't deployed — see "Legacy Flask backend" below
if you want to know why it's still in the repo.

---

## Project Structure
```
semai/
├── frontend/              React PWA                    → deploy to Netlify
├── supabase/
│   ├── schema.sql          Database schema + RLS         → run once in Supabase SQL Editor
│   └── functions/          Edge Functions (chat, explain-slide, generate-course)
└── backend/                Legacy Flask backend (not deployed, kept for reference)
```

---

## Step 1 — Create your Supabase project

1. Go to https://supabase.com → New Project (free tier is fine)
2. Open **SQL Editor → New query**, paste the entire contents of `supabase/schema.sql`, click **Run**
   - Creates `courses`, `modules`, `slides`, `progress`, `profiles`, sets up Row Level
     Security, and adds a trigger that creates a lecturer profile automatically on sign-up
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon / public key**

---

## Step 2 — Deploy the Edge Functions

Using the Supabase CLI:
```bash
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy chat --no-verify-jwt
supabase functions deploy explain-slide --no-verify-jwt
supabase functions deploy generate-course --no-verify-jwt
```

Then set your Gemini key as a secret (this is the ONE manual step — there's no way
to do this except through the dashboard or CLI):
```bash
supabase secrets set GEMINI_API_KEY=your-gemini-api-key
```
Or via the dashboard: **Project Settings → Edge Functions → Secrets**.

**Note on newer "AQ." format keys:** Google AI Studio started issuing a new key format
(`AQ.Ab...` instead of the older `AIzaSy...`) in 2026. These functions authenticate via
the `x-goog-api-key` header, which is the current documented method. There have been
scattered reports of `AQ.` keys getting rejected on some accounts depending on rollout
status — if you get a 401/403 from the `chat`, `explain-slide`, or `generate-course`
functions, check the Supabase function logs first; if it's an auth error specifically,
regenerating the key in AI Studio or checking Google's current docs at
ai.google.dev/gemini-api/docs/api-key is the next step.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available inside every
Edge Function — you don't need to set those yourself.

---

## Step 3 — Deploy the Frontend to Netlify

1. Push this repo to GitHub
2. Netlify → New site from Git → pick the repo
3. Set:
   - **Base directory:** `frontend`
   - **Build command:** `npm run build`
   - **Publish directory:** `dist` (relative to base directory)
4. Add Environment Variables:
   - `VITE_SUPABASE_URL` → your Project URL from Step 1
   - `VITE_SUPABASE_ANON_KEY` → your anon/public key from Step 1
5. Deploy

**Share the resulting URL with your students. Any lecturer can now sign up and add
their own courses.**

---

## Step 4 — Register your institution

SEMAI is multi-tenant: each university/school is its own isolated space — its course
catalog and student roster are only visible to its own people, not shared globally.

1. Open SEMAI → **Lecturer or administrator? Sign in here** → **Register new institution**
2. Enter your institution's name, your own name, email, and password → **Create Account**
3. Confirm your email, then sign in — you're now that institution's **institution_admin**,
   with a **🏛 Institution Dashboard** tab showing every lecturer, course, and student at
   your institution, plus real completion data as students progress through lectures

## Step 5 — Add lecturers and courses

- Other lecturers at your institution sign up via **Join my institution** (same screen),
  picking your institution from the dropdown — no admin approval step needed
- Any lecturer (including the institution_admin) can then **✨ Add a Course Unit**: paste
  notes/outline (or upload a `.txt` file), or just describe the topics
- **Generate Course** → review the preview → **Save Course** — it immediately appears on
  the Join screen for every student at that institution; SEMAI decides per module whether
  to show a code editor (programming subjects) or a worked-example panel (everything else)
- A lecturer can only edit/delete the units they created themselves — enforced by the
  database (Row Level Security), not just hidden in the UI

## Step 6 — Students join

- Students sign up on the main Join screen with their own name, email, password, and their
  institution (picked from the same dropdown) — real accounts, not name-only entry
- Once signed in, they see only their own institution's courses and can join any lecture
- Progress (which modules they've completed) is recorded automatically and shows up on the
  institution_admin's dashboard

---

## Local Development

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
# Runs on http://localhost:3000
```

To test Edge Functions locally: `supabase functions serve` (requires the Supabase CLI
and Docker).

---

## Legacy Flask backend

`backend/` was the original server layer before this project moved to Supabase Edge
Functions. It's kept in the repo for reference but is **not part of the deployed app**
and doesn't need `GEMINI_API_KEY`, Render, or anything else set up for it to work —
the frontend no longer calls it. Safe to delete if you don't need the reference.

## Post-Module Quiz

Right after a student finishes a module's slides, SEMAI gives them a short multiple-choice
quiz before letting them move on — generated by Gemini in the same call that creates the
slides, so every student answers the same questions (making aggregate scores a genuine
"is this lecture working" signal, not noise from randomized questions). Each question is
tied to a specific learning objective; the student gets immediate feedback and an
explanation after every answer, then a final score. Average score per course shows up on
the institution_admin's dashboard — a course or module with a consistently low average is
a much stronger effectiveness signal than completion counts alone.

Correct answers are never sent to the browser before grading — questions/options are
fetched one way, and grading happens entirely server-side (`supabase/functions/quiz`).

## LMS Integration (LTI 1.3)

An institution_admin can connect SEMAI to their LMS (Canvas, Moodle, Blackboard, etc.)
so a course link inside the LMS launches straight into SEMAI, already signed in — no
separate SEMAI login. From the **🔗 LMS Integration** tab in the Institution Dashboard:

1. Give your LMS administrator the three URLs shown there (OIDC Login, Redirect/Launch,
   Tool JWKS) to register SEMAI as an "External Tool" / "LTI 1.3 Tool" — enable **Deep
   Linking** on the LMS side if you want per-assignment course picking (see below)
2. They'll give you back a **Client ID** and **Deployment ID**
3. Paste those in, along with the LMS's own OIDC/JWKS endpoints, and pick a fallback
   SEMAI course this connection launches into
4. Set the two required secrets (see below), and you're done

**Required secrets** — Supabase dashboard → Edge Functions → Secrets:
```
LTI_STATE_SECRET=<any long random string, used to sign the launch's anti-replay state>
LTI_TOOL_PRIVATE_KEY=<the PEM-format RSA private key generated for this deployment>
```

**Current scope vs. what's still ahead:**
- ✅ Full LTI 1.3 launch security: JWT signature verification against the LMS's own
  published keys, issuer/audience/nonce/deployment_id checks, replay protection
- ✅ Automatic account provisioning — the first launch from a given LMS user creates
  their SEMAI account (role inferred from their LMS role); every launch after that
  reuses the same account
- ✅ **Deep Linking** — a lecturer adding a SEMAI link inside their LMS (if the LMS
  admin enabled Deep Linking during registration) is signed in and shown a course
  picker; the link created is specific to whichever course they chose, so different
  assignments/pages can point at different SEMAI courses. Platforms that don't use
  Deep Linking still work exactly as before, via the platform's fixed default course.
- ⏳ **Grade passback (Assignment & Grade Services)** — module completions don't yet
  flow back into the LMS gradebook. SEMAI's own signing keypair (used for Deep Linking
  responses above) already exists and is published at the Tool JWKS URL — the actual
  AGS calls (fetching line items, posting scores) aren't built yet

## Upgrading Voice (ElevenLabs)

Browser Web Speech API is used for TTS/STT today (free, works everywhere, sounds
noticeably more synthetic than a neural voice). To upgrade: add a new Edge Function
that proxies to ElevenLabs the same way the existing three proxy to Gemini, storing
`ELEVENLABS_API_KEY` as another Supabase secret.

## Tech Stack
| Layer          | Technology                     | Cost         |
|----------------|----------------------------------|--------------|
| Frontend       | React + Vite                    | Free         |
| Hosting        | Netlify                         | Free         |
| Database + Auth| Supabase (Postgres + Auth)      | Free tier    |
| AI Backend     | Supabase Edge Functions         | Free tier    |
| AI Brain       | Gemini API (Google AI Studio)   | Free tier    |
| Voice          | Browser Web Speech API          | Free         |
| Voice+         | ElevenLabs (upgrade)            | Free tier available |
