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

// ── Username-based auth — shared by lecturers, students, and institution admins ────────
// Supabase Auth is internally still email-based, so every username maps deterministically
// to a synthetic, non-routable email under the hood. Nobody ever sees this — it exists
// purely so we can keep using Supabase's built-in auth system without its email-confirmation
// flow, which is what this whole approach exists to avoid. MUST match the same transform
// used server-side in supabase/functions/signup — sign-in never asks the server "what's
// this username's email", it just recomputes it locally.
function usernameToEmail(username) {
  const normalized = (username || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${normalized}@users.semai.invalid`;
}

// role: 'lecturer' | 'student' | 'institution_admin'
// Pass institutionId to join an existing institution, OR newInstitutionName to register
// a brand-new one (which always makes the signing-up user its institution_admin — see
// the handle_new_user() trigger in supabase/schema.sql).
export async function signUpUser({ username, password, name, role, institutionId, newInstitutionName }) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ username, password, name, role, institutionId, newInstitutionName }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Sign up failed.");

  // The account is created pre-confirmed (email_confirm: true server-side), so we can sign
  // straight in — no separate "check your email" step needed at any point in this flow.
  return signInUser({ username, password });
}

export async function signInUser({ username, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) throw new Error(/invalid.*credentials/i.test(error.message) ? "Incorrect username or password." : error.message);
  return data;
}

export async function signOutUser() {
  await supabase.auth.signOut();
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session; // null if not signed in
}

export async function getUserProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*, institutions(name)").eq("id", userId).single();
  if (error) return null;
  return data; // { id, name, username, role, institution_id, institutions: { name } }
}
