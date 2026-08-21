// Point this at your Render backend URL after deployment
// During local dev it hits localhost:5000
import { supabase } from "./supabaseClient";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function sendChat({ messages, courseId, studentName, context }) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, courseId, studentName, context }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { reply: "..." }
}

export async function getCourses() {
  const res = await fetch(`${BASE}/api/curriculum`);
  return res.json(); // { courses: [...] }
}

export async function getCourse(id) {
  const res = await fetch(`${BASE}/api/curriculum/${id}`);
  if (!res.ok) throw new Error("Course not found");
  return res.json();
}

// Requires the lecturer to be signed in (see supabaseClient.js) — the backend verifies the token.
export async function saveCourse(data) {
  const res = await fetch(`${BASE}/api/curriculum`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Save failed");
  return res.json();
}

export async function deleteCourse(id) {
  const res = await fetch(`${BASE}/api/curriculum/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
  return res.json();
}

export async function getTTSConfig() {
  const res = await fetch(`${BASE}/api/tts/config`);
  return res.json(); // { mode: "browser" | "elevenlabs", enabled: true }
}

// ── Full lecturer-style slide narration ─────────────────────────────────────
export async function explainSlide({ courseTitle, moduleTitle, studentName, slideTitle, bullets }) {
  const res = await fetch(`${BASE}/api/lecture/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ courseTitle, moduleTitle, studentName, slideTitle, bullets }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // { explanation: "..." }
}

// ── AI course generation (lecturer describes/pastes/uploads content) ───────
export async function generateCourse({ title, lecturer, institution, sourceText }) {
  const res = await fetch(`${BASE}/api/generate/course`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, lecturer, institution, sourceText }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Generation failed");
  return res.json(); // full course object { title, description, modules, ... }
}

export async function uploadCourseSource(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/generate/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
  return res.json(); // { text: "extracted text..." }
}
