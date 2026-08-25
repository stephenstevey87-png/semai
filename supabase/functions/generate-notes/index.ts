const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-3.6-flash";

function stripMarkdownProse(text: string): string {
  if (!text) return "";
  let t = text.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/[*_#>`]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
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

const NOTES_SYSTEM_PROMPT = `You are SEMAI, an AI lecturer, writing up proper study notes for a student
after teaching a module. These notes are a WRITTEN document the student keeps and reviews later —
not a transcript of what was said aloud. Go deeper than the slides: the slides were deliberately
brief visual aids, but these notes should be genuinely thorough, the way a excellent set of
lecture notes actually reads — like something a strong student would be glad to have.

Return ONLY valid JSON — no markdown fences, no commentary — matching exactly this schema:
{
  "introduction": "2-4 sentences introducing what this module covers and why it matters, written for someone reviewing their notes later",
  "sections": [
    {
      "title": "the slide's title, used as this section's heading",
      "notes": "a genuinely thorough written explanation of this concept — several sentences to a short paragraph, going deeper than the original bullet points: define terms precisely, explain the reasoning or mechanism, give at least one concrete example, and note anything commonly misunderstood. Written as proper study notes in full sentences, not a bullet list."
    }
  ],
  "summary": "a short paragraph tying the whole module together — how the pieces connect",
  "keyTakeaways": ["a short, concrete, memorable takeaway a student should walk away with", "..."]
}

Rules:
- One "sections" entry per slide given below, in the same order, using that slide's title.
- "notes" must add real depth beyond the bullets it's based on — never just rephrase the bullets.
- "keyTakeaways": 3 to 6 short items, each a genuinely useful memory-anchor, not a restatement of the section titles.
- Plain text only throughout — no markdown, no asterisks, no bullet symbols inside string values.
- Base everything strictly on the material provided. Do not invent facts unrelated to it.
- Output must be a single JSON object and nothing else.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const courseTitle = body.courseTitle || "";
    const moduleTitle = body.moduleTitle || "";
    const slides: { title: string; subtitle?: string; bullets: string[]; highlight?: string }[] = body.slides || [];
    const practical = body.practical || "";
    const practicalNote = body.practicalNote || "";
    const practicalType = body.practicalType || "none";

    if (slides.length === 0) {
      return new Response(JSON.stringify({ error: "slides required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const slideBlock = slides.map((s, i) =>
      `Slide ${i + 1}: ${s.title}${s.subtitle ? `\nSubtitle: ${s.subtitle}` : ""}\nPoints:\n${(s.bullets || []).map(b => `- ${b}`).join("\n")}${s.highlight ? `\nHighlighted fact: ${s.highlight}` : ""}`
    ).join("\n\n");

    const practicalBlock = practicalType !== "none" && practical
      ? `\n\nHANDS-ON SECTION (${practicalType}):\n${practical.slice(0, 3000)}${practicalNote ? `\nNote: ${practicalNote}` : ""}`
      : "";

    const userMessage = `Course: ${courseTitle}\nModule: ${moduleTitle}\n\nSLIDES COVERED:\n${slideBlock}${practicalBlock}\n\nWrite the study notes JSON now.`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set as a Supabase secret");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: NOTES_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 6000, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const parsed = extractJson(rawText);

    const notes = {
      introduction: stripMarkdownProse(parsed.introduction || ""),
      sections: (parsed.sections || []).map((s: any) => ({
        title: s.title || "", notes: stripMarkdownProse(s.notes || ""),
      })),
      summary: stripMarkdownProse(parsed.summary || ""),
      keyTakeaways: (parsed.keyTakeaways || []).map((t: string) => stripMarkdownProse(t)).filter(Boolean),
    };

    return new Response(JSON.stringify(notes), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("generate-notes function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
