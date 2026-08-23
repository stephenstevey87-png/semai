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
  t = t.replace(/^\s*[-•]\s+/gm, "");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function buildExplainPrompt(courseTitle: string, moduleTitle: string, studentName: string): string {
  return `You are SEMAI, an AI lecturer created by Steven Ssemambo (SayMyTech Developers),
currently teaching ${courseTitle}, module "${moduleTitle}", to a student named ${studentName}.

You are presenting a slide. You have been given the slide's title and its bullet points below.
Your job is to TEACH the slide the way a real lecturer would present it at the front of a class —
NOT to read the bullets aloud.

Follow this exactly:
- Treat each bullet point as a topic to teach, in the order given. Do not skip any bullet.
- For EVERY bullet point: explain what it means in plain language, say why it matters, and give
  a short concrete example or analogy where useful — the bullet text is only a summary, your job
  is to unpack it.
- Use natural spoken transitions between points.
- Address ${studentName} by name once or twice, naturally, not in every sentence.
- Do not stop early. You must explain ALL of the bullet points provided before finishing.
- This will be converted to speech: no markdown, no asterisks, no bullet symbols, no headers,
  no numbered lists — pure spoken prose only, in full sentences.
- End with a short natural line inviting questions.
- Aim for a thorough explanation — around 150 to 260 words for a slide with several points.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const courseTitle = body.courseTitle || "this course";
    const moduleTitle = body.moduleTitle || "this module";
    const studentName = body.studentName || "Student";
    const slideTitle = body.slideTitle || "";
    const bullets: string[] = body.bullets || [];

    if (bullets.length === 0) {
      return new Response(JSON.stringify({ error: "bullets required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const bulletBlock = bullets.map((b) => `- ${b}`).join("\n");
    const userMessage = `Slide title: ${slideTitle}\n\nBullet points to teach (explain every single one, in order):\n${bulletBlock}\n\nPlease teach this slide now.`;

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set as a Supabase secret");

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: buildExplainPrompt(courseTitle, moduleTitle, studentName) }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 900 },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const explanation = stripMarkdownProse(rawText);

    return new Response(JSON.stringify({ explanation }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("explain-slide function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
