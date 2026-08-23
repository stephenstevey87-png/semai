import { createClient } from "@supabase/supabase-js";

// Safe to expose in browser code — this is the public "anon" key, not the service role key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Without this check, createClient() below throws synchronously, which crashes the
  // entire module import chain BEFORE React ever calls render() — the result is a
  // blank page showing only the base CSS background, with no error visible anywhere
  // in the UI (only in the browser console, which most people never open).
  // This renders a real diagnostic message directly into the DOM instead, bypassing
  // React entirely since React itself never gets a chance to start in this case.
  const missing = [
    !SUPABASE_URL && "VITE_SUPABASE_URL",
    !SUPABASE_ANON_KEY && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean).join(", ");

  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F0C29;color:white;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box;">
      <div style="max-width:480px;">
        <div style="font-size:40px;margin-bottom:16px;">⚠️</div>
        <h2 style="margin:0 0 12px;font-size:20px;">SEMAI can't start</h2>
        <p style="color:#9CA3AF;font-size:14px;line-height:1.6;margin:0 0 16px;">
          Missing environment variable${missing.includes(",") ? "s" : ""}:
          <code style="color:#A78BFA;background:rgba(124,58,237,0.15);padding:2px 8px;border-radius:6px;">${missing}</code>
        </p>
        <p style="color:#6B7280;font-size:13px;line-height:1.6;">
          If you're the site owner: check Netlify → Site settings → Environment variables,
          then go to Deploys → Trigger deploy → <strong>Clear cache and deploy site</strong>.
          Vite bakes these values in at build time, so a plain redeploy after adding a
          variable will still use the old (missing) value — a fresh build is required.
        </p>
      </div>
    </div>`;
  throw new Error(`Missing Supabase env vars: ${missing}`);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Lecturer auth helpers ────────────────────────────────────────────────────
export async function signUpLecturer({ email, password, name, institution }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, institution } }, // read by the handle_new_user() trigger in schema.sql
  });
  if (error) throw error;
  return data;
}

export async function signInLecturer({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutLecturer() {
  await supabase.auth.signOut();
}

export async function getLecturerSession() {
  const { data } = await supabase.auth.getSession();
  return data.session; // null if not signed in
}

export async function getLecturerProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) return null;
  return data; // { id, name, institution }
}
