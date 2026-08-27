const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-3.6-flash";
const MODULE_ICONS = ["📘", "🔷", "🧱", "🔀", "🧬", "🗄️", "⚙️", "📦", "🧮", "🌐"];

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stripCodeFences(text: string): string {
  if (!text) return "";
  let t = text.trim();
  const match = /```(?:java|Java|JAVA|json|JSON)?\s*\n?([\s\S]*?)```/.exec(t);
  if (match) t = match[1];
  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };
  for (const [entity, char] of Object.entries(entities)) t = t.split(entity).join(char);
  return t.trim();
}

function extractJson(raw: string): any {
  let t = (raw || "").trim();
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

const GENERATE_SYSTEM_PROMPT = `You are an expert curriculum designer AND presentation designer helping a
lecturer turn their raw course material (a description, a syllabus, or pasted slide/notes/PDF text)
into a structured lecture course for SEMAI, an AI lecturer app. This app is used across ALL subjects —
programming, business, marketing, accounting, history, science, law, anything a lecturer teaches — not
just programming.

Return ONLY valid JSON — no markdown fences, no commentary, no prose before or after — matching
EXACTLY this schema:

{
  "description": "one sentence overview of the course",
  "subject": "short subject area label, e.g. Java Programming, Marketing, Financial Accounting, World History",
  "modules": [
    {
      "id": "short-kebab-case-id",
      "icon": "one relevant emoji",
      "title": "Module title",
      "slides": [
        {
          "title": "Slide title — short, punchy, like a real presentation slide heading",
          "subtitle": "one-sentence framing line giving context for this slide — shown under the title",
          "bullets": ["a complete, informative point — a real statement someone could learn from, not a bare keyword fragment", "..."],
          "highlight": "an optional standout fact, statistic, quote, or one-liner worth visually calling out on this slide — empty string if nothing fits"
        }
      ],
      "practicalType": "code | example | none",
      "practicalLanguage": "the programming language if practicalType is code, e.g. java, python, sql — otherwise empty string",
      "practical": "the hands-on content — RAW plain text only, no markdown fences, no HTML: if practicalType is code, a complete working code example; if practicalType is example, a short worked example, mini case study, or practice scenario relevant to the subject; if practicalType is none, an empty string",
      "practicalNote": "2-3 sentences (plain text, no markdown) explaining what the practical section demonstrates — or empty string if practicalType is none",
      "quiz": [
        {
          "objective": "the specific learning objective this question tests, e.g. 'Distinguish between fixed and variable costs'",
          "question": "a clear question testing that objective, grounded in what the slides actually taught",
          "options": ["option A", "option B", "option C", "option D"],
          "correctIndex": 0,
          "explanation": "1-2 sentences explaining why the correct answer is correct — shown to the student after they answer"
        }
      ]
    }
  ]
}

Rules for SLIDE CONTENT — this is critical, read carefully:
- These are real presentation slides a student will actually look at, not a bare outline. Each bullet
  must be a complete, informative statement that teaches something on its own even before the lecturer
  says a word — write it the way a well-prepared university lecturer would design their actual slide deck,
  not a list of keyword fragments.
- Bullets: aim for roughly 12-22 words each, full sentences or clear clauses. 3 to 5 bullets per slide —
  fewer, richer bullets beat a wall of short fragments.
- subtitle: one short sentence (under 18 words) that frames what the slide is about — think of it as the
  line right under a slide title in a polished deck.
- highlight: use this SPARINGLY and only when there's a genuinely notable fact, statistic, quote, or
  one-liner that deserves visual emphasis — leave it as an empty string on slides where nothing stands out
  that way. Don't force one onto every slide.
- Decide practicalType per module based on the subject: use "code" only for programming/technical
  subjects where showing real source code genuinely helps (pick the appropriate language). Use
  "example" for a worked example, mini case study, or practice scenario for non-programming subjects
  (business, marketing, accounting, history, law, science, etc). Use "none" only if a hands-on
  section genuinely doesn't fit that module.
- Produce 3 to 7 modules depending on how much source material is given — don't pad if the source is thin.
- Each module should have 2 to 4 slides.
- The "practical" field must be plain text only — never wrap it in fences or HTML, regardless of practicalType.

Rules for "quiz" — this is what the student is tested on right after finishing the module's slides:
- 3 to 5 questions per module, each tied to a genuinely distinct learning objective covered by that
  module's slides — don't write two questions testing the same thing.
- Every question must be answerable from what the slides actually taught — never test something the
  slides didn't cover, and never require outside knowledge.
- Exactly 4 options per question, plausible distractors (not obviously wrong filler) — correctIndex is
  0-based (0,1,2, or 3).
- explanation should teach, not just confirm: briefly say WHY the correct answer is right, in a way that
  reinforces the underlying concept even for a student who got it wrong.
- Base everything strictly on the source material provided.
- Output must be a single JSON object and nothing else.`;

function sanitizeQuizQuestion(q: any) {
  const options = Array.isArray(q.options) ? q.options.filter((o: any) => typeof o === "string" && o.trim()) : [];
  let correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : 0;
  if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;
  return {
    objective: (q.objective || "").trim(),
    question: (q.question || "").trim(),
    options,
    correctIndex,
    explanation: (q.explanation || "").trim(),
  };
}

function sanitizeModule(m: any, i: number) {
  const id = m.id || slugify(m.title || `module-${i}`);
  const icon = m.icon || MODULE_ICONS[i % MODULE_ICONS.length];
  const slides = (m.slides || []).map((s: any) => ({
    title: s.title || "Untitled slide",
    subtitle: (s.subtitle || "").trim(),
    bullets: (s.bullets || []).filter((b: any) => typeof b === "string" && b.trim()),
    highlight: (s.highlight || "").trim(),
  }));
  const quiz = (m.quiz || []).map(sanitizeQuizQuestion).filter((q: any) => q.question && q.options.length >= 2);
  let practicalType = m.practicalType;
  if (!["code", "example", "none"].includes(practicalType)) {
    practicalType = m.practical ? "example" : "none";
  }
  return {
    id, icon, title: m.title || `Module ${i + 1}`, slides, quiz,
    practicalType,
    practicalLanguage: (m.practicalLanguage || "").toLowerCase(),
    practical: stripCodeFences(m.practical || ""),
    practicalNote: stripCodeFences(m.practicalNote || ""),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const title = (body.title || "").trim();
    const lecturer = body.lecturer || "";
    const institution = body.institution || "";
    const sourceText = (body.sourceText || "").trim();

    if (!title) {
      return new Response(JSON.stringify({ error: "title required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    if (!sourceText) {
      return new Response(JSON.stringify({ error: "sourceText required — paste a description, outline, or uploaded content" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const userMessage = `Course title: ${title}\nLecturer: ${lecturer || "Not specified"}\nInstitution: ${institution || "Not specified"}\n\nSOURCE MATERIAL:\n---\n${sourceText.slice(0, 12000)}\n---\n\nGenerate the course JSON now.`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set as a Supabase secret");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: GENERATE_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            maxOutputTokens: 12000,
            responseMimeType: "application/json", // Gemini can be constrained to emit valid JSON directly
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const parsed = extractJson(rawText);
    const modules = (parsed.modules || []).map(sanitizeModule);

    const course = {
      id: slugify(title), title,
      description: parsed.description || "", subject: parsed.subject || "",
      lecturer, institution, outline: sourceText.slice(0, 4000), modules,
    };

    return new Response(JSON.stringify(course), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const msg = String((err as any)?.message || err);
    console.error("generate-course function error:", msg);
    const status = msg.includes("JSON") ? 502 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
