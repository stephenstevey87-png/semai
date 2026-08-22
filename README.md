# SEMAI — AI Lecturer
**By Ssemambo Steven · SayMyTech Developers**

A full PWA that automatically teaches any course — programming, business, science, law,
anything — to your students when you're not around. Any lecturer can sign in, paste a
course/module outline, and SEMAI generates the slides, notes, and hands-on exercises,
then delivers the lecture hands-free with live voice narration.

Claude AI brain · Browser voice · Slide + practical-screen switching · Multi-lecturer
Supabase backend (database, auth, and Edge Functions) · Autonomous "teach → check-in →
advance" flow

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
                           — holds ANTHROPIC_API_KEY server-side, calls Claude
```

- **Reads** (loading a course, listing courses for the Join screen) go straight from
  the frontend to the Supabase database via `supabase-js`.
- **Writes** (a lecturer saving/deleting a course) also go straight from the frontend
  to Supabase — ownership is enforced by Postgres Row Level Security itself
  (`supabase/schema.sql`), not by a backend middleware layer.
- **AI calls** (chat, slide narration, course generation) go through three Supabase
  Edge Functions in `supabase/functions/`, which is the only place your Anthropic API
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

Then set your Anthropic key as a secret (this is the ONE manual step — there's no way
to do this except through the dashboard or CLI):
```bash
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-api-key
```
Or via the dashboard: **Project Settings → Edge Functions → Secrets**.

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

## Step 4 — Add a course as a lecturer

1. Open SEMAI → **⚙️ Admin** → create a lecturer account (email + password)
   - Supabase emails a confirmation link — confirm, then sign in
2. **✨ Add a Course Unit** → paste your notes/outline (or upload a `.txt` file), or just
   describe the topics
3. **Generate Course** → review the preview → **Save Course**
4. It immediately appears as a new option on the Join screen for every student — works
   for any subject; SEMAI decides per module whether to show a code editor (programming
   subjects) or a worked-example panel (everything else)

Every lecturer who signs up can add their own courses. Everyone sees everyone's courses
on the Join screen; a lecturer can only edit/delete the units they created themselves —
enforced by the database, not just hidden in the UI.

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
and doesn't need `ANTHROPIC_API_KEY`, Render, or anything else set up for it to work —
the frontend no longer calls it. Safe to delete if you don't need the reference.

## Upgrading Voice (ElevenLabs)

Browser Web Speech API is used for TTS/STT today (free, works everywhere, sounds
noticeably more synthetic than a neural voice). To upgrade: add a new Edge Function
that proxies to ElevenLabs the same way the existing three proxy to Anthropic, storing
`ELEVENLABS_API_KEY` as another Supabase secret.

## Tech Stack
| Layer          | Technology                     | Cost         |
|----------------|----------------------------------|--------------|
| Frontend       | React + Vite                    | Free         |
| Hosting        | Netlify                         | Free         |
| Database + Auth| Supabase (Postgres + Auth)      | Free tier    |
| AI Backend     | Supabase Edge Functions         | Free tier    |
| AI Brain       | Claude API (Anthropic)          | Pay per use  |
| Voice          | Browser Web Speech API          | Free         |
| Voice+         | ElevenLabs (upgrade)            | Free tier available |
