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

export async function explainSlide({ courseTitle, moduleTitle, studentName, slideTitle, slideSubtitle, highlight, bullets }) {
  const { data, error } = await supabase.functions.invoke("explain-slide", {
    body: { courseTitle, moduleTitle, studentName, slideTitle, slideSubtitle, highlight, bullets },
  });
  if (error) throw new Error(error.message || "Explain request failed");
  if (data?.error) throw new Error(data.error);
  return data; // { explanation: "...", checkInQuestion: "..." }
}

export async function generateCourse({ title, lecturer, institution, sourceText }) {
  const { data, error } = await supabase.functions.invoke("generate-course", {
    body: { title, lecturer, institution, sourceText },
  });
  if (error) throw new Error(error.message || "Generation failed");
  if (data?.error) throw new Error(data.error);
  return data; // full course object { id, title, description, subject, modules, ... }
}

export async function generateNotes({ courseTitle, moduleTitle, slides, practical, practicalNote, practicalType }) {
  const { data, error } = await supabase.functions.invoke("generate-notes", {
    body: { courseTitle, moduleTitle, slides, practical, practicalNote, practicalType },
  });
  if (error) throw new Error(error.message || "Notes generation failed");
  if (data?.error) throw new Error(data.error);
  return data; // { introduction, sections: [{title, notes}], summary, keyTakeaways: [] }
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
      slides: (slidesByModule[m.id] || []).map(s => ({ title: s.title, subtitle: s.subtitle || "", bullets: s.bullets, highlight: s.highlight || "" })),
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

  // New courses inherit the lecturer's institution automatically — this is what keeps a
  // university's course catalog scoped to its own students (see institution-scoped RLS
  // policies in supabase/schema.sql). A lecturer with no institution_id (a legacy/independent
  // account) still saves fine; that course just stays visible campus-wide as before.
  const { data: profile } = await supabase.from("profiles").select("institution_id, name, username").eq("id", session.user.id).single();

  const { error: courseErr } = await supabase.from("courses").upsert({
    id: courseId,
    title: course.title,
    description: course.description || "",
    subject: course.subject || "",
    outline: course.outline || "",
    lecturer_id: session.user.id,
    lecturer_name: course.lecturer || profile?.name || profile?.username || "",
    institution: course.institution || "",
    institution_id: profile?.institution_id || null,
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
      module_id: modRow.id, position: j, title: s.title || "",
      subtitle: s.subtitle || "", bullets: s.bullets || [], highlight: s.highlight || "",
    }));
    if (slideRows.length) {
      const { error: slideErr } = await supabase.from("slides").insert(slideRows);
      if (slideErr) throw new Error(slideErr.message);
    }

    const quizRows = (m.quiz || []).map((q, j) => ({
      module_id: modRow.id, position: j, question: q.question || "",
      options: q.options || [], correct_index: q.correctIndex ?? 0,
      explanation: q.explanation || "", objective: q.objective || "",
    }));
    if (quizRows.length) {
      const { error: quizErr } = await supabase.from("quiz_questions").insert(quizRows);
      if (quizErr) throw new Error(quizErr.message);
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

// ── Institutions ────────────────────────────────────────────────────────────────
export async function listInstitutions() {
  const { data, error } = await supabase.from("institutions").select("id, name").order("name");
  if (error) throw new Error(error.message);
  return data || [];
}

// Oversight view for an institution_admin: their lecturers, their course catalog, their
// registered students, and how many modules each student has actually completed.
export async function getInstitutionDashboard(institutionId) {
  const [{ data: lecturers }, { data: students }, { data: courses }] = await Promise.all([
    supabase.from("profiles").select("id, name, created_at").eq("institution_id", institutionId).eq("role", "lecturer").order("name"),
    supabase.from("profiles").select("id, name, created_at").eq("institution_id", institutionId).eq("role", "student").order("name"),
    supabase.from("courses").select("id, title, subject, lecturer_name").eq("institution_id", institutionId).order("title"),
  ]);

  const courseIds = (courses || []).map(c => c.id);
  const [{ data: progressRows }, { data: quizRows }] = courseIds.length
    ? await Promise.all([
        supabase.from("progress").select("student_id, course_id, completed").in("course_id", courseIds),
        supabase.from("quiz_attempts").select("course_id, score, total").in("course_id", courseIds),
      ])
    : [{ data: [] }, { data: [] }];

  const completedByStudent = {};
  for (const r of progressRows || []) {
    if (!r.completed) continue;
    completedByStudent[r.student_id] = (completedByStudent[r.student_id] || 0) + 1;
  }

  // Average quiz score per course — this is the real "is this lecture working" signal:
  // a low average on a specific course/module is a much stronger effectiveness indicator
  // than completion counts alone, since it reflects whether students actually understood
  // the material rather than just clicking through it.
  const quizStatsByCourse = {};
  for (const r of quizRows || []) {
    const s = (quizStatsByCourse[r.course_id] ||= { scoreSum: 0, totalSum: 0, attempts: 0 });
    s.scoreSum += r.score; s.totalSum += r.total; s.attempts += 1;
  }

  return {
    lecturers: lecturers || [],
    courses: (courses || []).map(c => {
      const s = quizStatsByCourse[c.id];
      return { ...c, avgQuizPct: s && s.totalSum > 0 ? Math.round((s.scoreSum / s.totalSum) * 100) : null, quizAttempts: s?.attempts || 0 };
    }),
    students: (students || []).map(s => ({ ...s, modulesCompleted: completedByStudent[s.id] || 0 })),
  };
}

// ── Quiz — questions/options only ever reach the client via this function; correct_index
//    and explanation stay server-side until after an answer is checked. ──────────────────
export async function getQuizQuestions(moduleId) {
  const { data, error } = await supabase.functions.invoke("quiz", { body: { action: "questions", moduleId } });
  if (error) throw new Error(error.message || "Could not load quiz");
  if (data?.error) throw new Error(data.error);
  return data.questions || [];
}

export async function checkQuizAnswer({ questionId, selectedIndex }) {
  const { data, error } = await supabase.functions.invoke("quiz", { body: { action: "check", questionId, selectedIndex } });
  if (error) throw new Error(error.message || "Could not check answer");
  if (data?.error) throw new Error(data.error);
  return data; // { correct, correctIndex, explanation }
}

export async function submitQuizAttempt({ moduleId, courseId, answers }) {
  const { data, error } = await supabase.functions.invoke("quiz", { body: { action: "submit", moduleId, courseId, answers } });
  if (error) throw new Error(error.message || "Could not submit quiz");
  if (data?.error) throw new Error(data.error);
  return data; // { score, total }
}

// ── LTI / LMS integration ─────────────────────────────────────────────────────
export async function listPlatforms(institutionId) {
  const { data, error } = await supabase.from("lti_platforms").select("*").eq("institution_id", institutionId).order("created_at");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function savePlatform(platform) {
  const { id, ...fields } = platform;
  const row = { ...fields };
  if (id) row.id = id;
  const { error } = await supabase.from("lti_platforms").upsert(row);
  if (error) throw new Error(error.message);
}

export async function deletePlatform(id) {
  const { error } = await supabase.from("lti_platforms").delete().eq("id", id);
  if (error) throw new Error(error.message);
}


// ── Progress — lets an institution_admin/lecturer see real student activity ──────
export async function recordProgress({ studentId, courseId, moduleId, completed }) {
  if (!studentId) return; // anonymous/legacy sessions have nothing to attribute progress to
  const { error } = await supabase.from("progress").upsert(
    { student_id: studentId, course_id: courseId, module_id: moduleId, completed, updated_at: new Date().toISOString() },
    { onConflict: "student_id,course_id,module_id" },
  );
  if (error) console.error("recordProgress failed:", error.message); // best-effort, never blocks the lecture
}
