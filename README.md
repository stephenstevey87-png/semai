# SEMAI — AI Lecturer
**By Ssemambo Steven · SayMyTech Developers**

A full PWA that automatically teaches any course — programming, business, science, law,
anything — to your students when you're not around. Any lecturer can sign in, paste a
course/module outline, and SEMAI generates the slides, notes, and hands-on exercises,
then delivers the lecture hands-free with live voice narration.

Claude AI brain · Browser voice · Slide + practical-screen switching · Multi-lecturer
Supabase backend · Autonomous "teach → check-in → advance" flow

---

## Project Structure
```
semai/
├── backend/    Flask API           →  deploy to Render.com
├── frontend/   React PWA           →  deploy to Vercel.com
└── supabase/   schema.sql          →  run once in your Supabase project
```

---

## Step 1 — Create your Supabase project

1. Go to https://supabase.com → New Project (free tier is fine)
2. Once it's created, open **SQL Editor → New query**
3. Paste the entire contents of `supabase/schema.sql` and click **Run**
   - This creates the `courses`, `modules`, `slides`, `progress`, and `profiles` tables,
     sets up Row Level Security, and adds a trigger that creates a lecturer profile
     automatically on sign-up.
4. Go to **Project Settings → API** and copy three values, you'll need them in Steps 2 and 3:
   - **Project URL**
   - **anon / public key**
   - **service_role key** (keep this one secret — backend only, never in frontend code)

---

## Step 2 — Deploy the Backend to Render

1. Push the `semai/` folder to a GitHub repository
2. Go to https://render.com → New → Web Service
3. Connect your GitHub repo
4. Set:
   - **Root Directory:** `backend`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app`
5. Add Environment Variables:
   - `ANTHROPIC_API_KEY` → your Claude API key (from console.anthropic.com)
   - `SUPABASE_URL` → your Project URL from Step 1
   - `SUPABASE_SERVICE_ROLE_KEY` → your service_role key from Step 1
   - `SUPABASE_ANON_KEY` → your anon/public key from Step 1
6. Click **Deploy**
7. Copy your Render URL — looks like: `https://semai-backend.onrender.com`

---

## Step 3 — Deploy the Frontend to Vercel

1. Go to https://vercel.com → New Project
2. Import your GitHub repo
3. Set:
   - **Root Directory:** `frontend`
   - **Framework:** Vite
4. Add Environment Variables:
   - `VITE_API_URL` → paste your Render URL from Step 2
   - `VITE_SUPABASE_URL` → your Project URL from Step 1
   - `VITE_SUPABASE_ANON_KEY` → your anon/public key from Step 1 (never the service role key)
5. Click **Deploy**
6. Vercel gives you a URL like: `https://semai.vercel.app`

**Share that URL with your students. Any lecturer can now sign up and add their own courses.**

---

## Step 4 — Add a course as a lecturer

1. Open SEMAI in your browser
2. Click **⚙️ Admin** → **Create a lecturer account** (email + password)
   - Supabase sends a confirmation email — confirm, then sign in
3. Go to **✨ Add a Course Unit**
4. Upload a syllabus PDF, paste your notes/outline, or just describe the topics
5. Click **Generate Course** → review the preview → **Save Course**
6. It immediately appears as a new option on the Join screen for every student —
   works for any subject; SEMAI decides per module whether to show a code editor
   (programming subjects) or a worked-example panel (everything else)

Every lecturer who signs up can add their own courses. Everyone sees everyone's
courses on the Join screen; a lecturer can only delete the units they created.

---

## Local Development

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # fill in ANTHROPIC_API_KEY + your Supabase keys
python app.py
# Runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm run dev
# Runs on http://localhost:3000
```

---

## Upgrading Voice (ElevenLabs)

When you get an ElevenLabs API key:
1. Add `ELEVENLABS_API_KEY` to Render environment variables
2. Uncomment the ElevenLabs code in `backend/routes/tts.py`
3. The frontend detects it automatically via `/api/tts/config`

---

## Tech Stack
| Layer     | Technology              | Cost  |
|-----------|--------------------------|-------|
| Frontend  | React + Vite             | Free  |
| Hosting   | Vercel                   | Free  |
| Backend   | Flask + Gunicorn         | Free  |
| Hosting   | Render.com               | Free  |
| Database  | Supabase (Postgres + Auth) | Free tier |
| AI Brain  | Claude API (Anthropic)  | Pay per use |
| Voice     | Browser Web Speech API  | Free  |
| Voice+    | ElevenLabs (upgrade)    | Free tier available |

## Notes on this version
- `backend/data/courses.json` is no longer read by the app — Supabase is now the single
  source of truth for course content. The file is left in place only for reference.
- Lecturer "sign in" is real Supabase Auth (email + password) now, not just a typed name.
- Student "join" is still name-only (no account) — lightweight by design for a classroom tool.
