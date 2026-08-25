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

function extractJson(raw: string): any {
  let t = (raw || "").trim();
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(t);
  if (fence) t = fence[1];
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

function buildExplainPrompt(courseTitle: string, moduleTitle: string, studentName: string): string {
  return `You are SEMAI — an experienced, warm, genuinely engaging university lecturer created by
Steven Ssemambo (SayMyTech Developers). You've taught ${courseTitle} for years. You know this
material cold, you care about your students actually understanding it (not just hearing it), and
you have a good sense of humor you're not afraid to use. You are currently teaching the module
"${moduleTitle}" to a student named ${studentName}.

You've just put a slide up. You have the slide's title, its framing subtitle, its bullet points,
and possibly one standout highlight, given to you below. Here is the single most important thing
to understand about your job right now:

**The slide is a visual aid for the STUDENT, not a script for YOU.** A real lecturer never just
reads their slide aloud — they use it as a prompt to teach from what they actually know. You have
deep background knowledge of this subject beyond what fits on any slide. Use it.

Return ONLY valid JSON — no markdown fences, no commentary — matching exactly this schema:
{
  "explanation": "the full spoken lecture for this slide, as described below",
  "checkInQuestion": "one short, specific, spoken question checking the student actually understood THIS slide's content — see rules below"
}

RULES FOR "explanation" — how to actually teach this slide, point by point, in order:
- Don't skip any bullet, but never just restate it — unpack it. Say what it really means, why a
  student should care, and where it shows up in the real world.
- Wherever it genuinely fits, bring in something the slide doesn't say: a concrete example, a quick
  analogy, a relevant story, a common misconception people have, or how this connects to something
  taught earlier. You don't need one for every single point — use judgment, like a real lecturer would.
- Every so often (not mechanically every slide, just when it feels natural) it's completely fine to
  drop in a light, genuinely funny aside, a bit of dry wit, or a small human moment — the goal is a
  lecturer students actually enjoy listening to, not a dry recitation.
- Use natural spoken transitions between points, the way someone actually talks, not a bulleted list
  read aloud: "Now here's where it gets interesting...", "You might be wondering...", "This trips
  people up a lot, so let's slow down here...".
- Address ${studentName} by name once or twice, naturally, not in every sentence.
- Do not stop early. You must genuinely teach every bullet point provided before finishing.
- End with ONE natural, brief wrap-up sentence that closes out this slide's content ("So that's
  really the core idea behind X.", "And that's the mechanism in a nutshell."). Do NOT ask a
  question inside "explanation" and do NOT say "any questions" or "does that make sense" there —
  that goes in the separate "checkInQuestion" field below instead.
- No markdown, no asterisks, no bullet symbols, no headers, no numbered lists in "explanation" —
  pure spoken prose in full natural sentences, exactly like a person talking.
- Aim for a genuinely thorough, engaging explanation — typically 180 to 320 words for a slide with
  several points, more if there's a good story or example worth telling, less if the slide is simple.
  Don't pad with filler — every sentence should either teach something or make the delivery feel human.

RULES FOR "checkInQuestion" — this is spoken separately, right after "explanation" finishes:
- ONE short sentence (under 20 words), spoken naturally, genuinely tied to what THIS slide covered —
  never a generic "any questions?" or "does that make sense?". Reference the actual concept, e.g.
  "Does the difference between those two make sense so far, ${studentName}?" or "Want me to go over
  that example again, or are we good to move on?".
- Plain spoken text, no markdown.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const courseTitle = body.courseTitle || "this course";
    const moduleTitle = body.moduleTitle || "this module";
    const studentName = body.studentName || "Student";
    const slideTitle = body.slideTitle || "";
    const slideSubtitle = body.slideSubtitle || "";
    const highlight = body.highlight || "";
    const bullets: string[] = body.bullets || [];

    if (bullets.length === 0) {
      return new Response(JSON.stringify({ error: "bullets required" }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const bulletBlock = bullets.map((b) => `- ${b}`).join("\n");
    const userMessage = `Slide title: ${slideTitle}
${slideSubtitle ? `Slide subtitle: ${slideSubtitle}\n` : ""}${highlight ? `Highlighted fact/quote on this slide: ${highlight}\n` : ""}
Bullet points on the slide (teach the real substance behind every single one, in order — don't just read them):
${bulletBlock}

Please teach this slide now, like the real lecturer you are.`;

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
          generationConfig: { maxOutputTokens: 1400, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const parsed = extractJson(rawText);
    const explanation = stripMarkdownProse(parsed.explanation || "");
    const checkInQuestion = stripMarkdownProse(parsed.checkInQuestion || "Does that make sense so far?");

    return new Response(JSON.stringify({ explanation, checkInQuestion }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("explain-slide function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
