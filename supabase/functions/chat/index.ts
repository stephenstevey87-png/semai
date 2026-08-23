import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";

function stripMarkdownProse(text: string): string {
  if (!text) return "";
  let t = text.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/[*_#>`]/g, "");
  t = t.replace(/^\s*[-•]\s+/gm, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

async function loadCurriculum(courseId: string): Promise<string> {
  if (!courseId) return "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).single();
  if (!course) return "";

  const { data: modules } = await supabase.from("modules").select("*").eq("course_id", courseId);
  const moduleIds = (modules || []).map((m: any) => m.id);
  const { data: slides } = moduleIds.length
    ? await supabase.from("slides").select("*").in("module_id", moduleIds)
    : { data: [] as any[] };

  const slidesByModule: Record<string, any[]> = {};
  for (const s of slides || []) {
    (slidesByModule[s.module_id] ||= []).push(s);
  }

  const fullCourse = {
    id: course.id, title: course.title, description: course.description, subject: course.subject,
    modules: (modules || [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((m: any) => ({
        id: m.id, icon: m.icon, title: m.title,
        slides: (slidesByModule[m.id] || [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((s: any) => ({ title: s.title, bullets: s.bullets })),
        practicalType: m.practical_type, practicalLanguage: m.practical_language,
        practical: m.practical, practicalNote: m.practical_note,
      })),
  };

  return `\n\nCURRICULUM FOR THIS SESSION:\n${JSON.stringify(fullCourse, null, 2)}`;
}

function buildSystemPrompt(curriculum: string, studentName: string, context: string): string {
  return `You are SEMAI, an AI lecturer created by Steven Ssemambo (SayMyTech Developers).
You teach students at universities and institutions across any subject.

STUDENT: ${studentName}
CURRENT CONTEXT: ${context}
${curriculum}

VOICE RULES — your text is spoken aloud to the student:
- Write in natural spoken sentences only — NO bullet points, NO markdown, NO asterisks
- Keep each response to 3-5 sentences maximum
- When referencing code say "look at line X on your screen"
- Be warm, patient, and encouraging — address the student by name occasionally
- Say "great question!" when appropriate
- End explanations with "Any questions? You can type or speak to me."

TEACHING BEHAVIOUR:
- When greeting: introduce yourself as SEMAI, welcome the student, briefly overview what you will cover
- When teaching theory: narrate naturally, explain why not just what
- When answering questions: be concise, offer to go deeper if needed
- When a student is stuck: encourage them, break it into smaller steps
- Quiz students occasionally to check understanding`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const messages = body.messages || [];
    const courseId = body.courseId || "";
    const studentName = body.studentName || "Student";
    const context = body.context || "";

    const clean = messages
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m: any) => ({ role: m.role, content: m.content }));

    if (clean.length === 0) {
      return new Response(JSON.stringify({ error: "No messages provided" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const curriculum = await loadCurriculum(courseId);
    const system = buildSystemPrompt(curriculum, studentName, context);

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set as a Supabase secret");

    // Gemini uses "user"/"model" roles (not "user"/"assistant") and a top-level
    // system_instruction field rather than a system message in the array.
    const geminiContents = clean.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 600 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const reply = stripMarkdownProse(rawText);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("chat function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
