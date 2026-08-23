import { supabase } from "./supabaseClient";

// ── AI calls — via Supabase Edge Functions (GEMINI_API_KEY stays server-side) ──
export async function sendChat({ messages, courseId, studentName, context }) {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: { messages, courseId, studentName, context },
  });
  if (error) throw new Error(error.message || "Chat request failed");
  if (data?.error) throw new Error(data.error);
  return data; // { reply: "..." }
}

export async function explainSlide({ courseTitle, moduleTitle, studentName, slideTitle, bullets }) {
  const { data, error } = await supabase.functions.invoke("explain-slide", {
    body: { courseTitle, moduleTitle, studentName, slideTitle, bullets },
  });
  if (error) throw new Error(error.message || "Explain request failed");
  if (data?.error) throw new Error(data.error);
  return data; // { explanation: "..." }
}

export async function generateCourse({ title, lecturer, institution, sourceText }) {
  const { data, error } = await supabase.functions.invoke("generate-course", {
    body: { title, lecturer, institution, sourceText },
  });
  if (error) throw new Error(error.message || "Generation failed");
  if (data?.error) throw new Error(data.error);
  return data; // full course object { id, title, description, subject, modules, ... }
}

// ── Curriculum reads — straight from the database, no backend needed ──────────────
export async function getCourses() {
  const { data: courses, error } = await supabase
    .from("courses")
    .select("id, title, description, subject, lecturer_name");
  if (error) throw new Error(error.message);

  const { data: modules } = await supabase.from("modules").select("course_id");
  const counts = {};
  for (const m of modules || []) counts[m.course_id] = (counts[m.course_id] || 0) + 1;

  return {
    courses: (courses || []).map(c => ({
      id: c.id, title: c.title, description: c.description || "",
      subject: c.subject || "", lecturer: c.lecturer_name || "",
      moduleCount: counts[c.id] || 0,
    })),
  };
}

export async function getCourse(id) {
  const { data: course, error } = await supabase.from("courses").select("*").eq("id", id).single();
  if (error || !course) throw new Error("Course not found");

  const { data: modules } = await supabase.from("modules").select("*").eq("course_id", id).order("position");
  const moduleIds = (modules || []).map(m => m.id);
  const { data: slides } = moduleIds.length
    ? await supabase.from("slides").select("*").in("module_id", moduleIds).order("position")
    : { data: [] };

  const slidesByModule = {};
  for (const s of slides || []) (slidesByModule[s.module_id] ||= []).push(s);

  return {
    id: course.id, title: course.title, description: course.description || "",
    subject: course.subject || "", outline: course.outline || "",
    lecturer: course.lecturer_name || "", institution: course.institution || "",
    modules: (modules || []).map(m => ({
      id: m.id, icon: m.icon, title: m.title,
      slides: (slidesByModule[m.id] || []).map(s => ({ title: s.title, bullets: s.bullets })),
      practicalType: m.practical_type, practicalLanguage: m.practical_language,
      practical: m.practical, practicalNote: m.practical_note,
    })),
  };
}

// ── Curriculum writes — direct to Supabase; Row Level Security enforces that only
//    the signed-in lecturer can write their own courses (see supabase/schema.sql). ──
export async function saveCourse(course) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in required");

  const courseId = course.id || slugify(course.title);

  const { error: courseErr } = await supabase.from("courses").upsert({
    id: courseId,
    title: course.title,
    description: course.description || "",
    subject: course.subject || "",
    outline: course.outline || "",
    lecturer_id: session.user.id,
    lecturer_name: course.lecturer || session.user.email,
    institution: course.institution || "",
  });
  if (courseErr) throw new Error(courseErr.message);

  // Replace modules/slides wholesale — simplest correct approach for a full (re)save.
  await supabase.from("modules").delete().eq("course_id", courseId);

  for (let i = 0; i < (course.modules || []).length; i++) {
    const m = course.modules[i];
    const { data: modRow, error: modErr } = await supabase.from("modules").insert({
      course_id: courseId,
      position: i,
      icon: m.icon || "",
      title: m.title || "",
      practical_type: m.practicalType || "none",
      practical_language: m.practicalLanguage || "",
      practical: m.practical || "",
      practical_note: m.practicalNote || "",
    }).select().single();
    if (modErr) throw new Error(modErr.message);

    const slideRows = (m.slides || []).map((s, j) => ({
      module_id: modRow.id, position: j, title: s.title || "", bullets: s.bullets || [],
    }));
    if (slideRows.length) {
      const { error: slideErr } = await supabase.from("slides").insert(slideRows);
      if (slideErr) throw new Error(slideErr.message);
    }
  }

  return { id: courseId, message: "Course saved" };
}

export async function deleteCourse(id) {
  const { error } = await supabase.from("courses").delete().eq("id", id); // cascades to modules/slides
  if (error) throw new Error(error.message);
  return { message: "Deleted" };
}

function slugify(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
