// Handles the post-module quiz: fetching questions (never including the answer),
// grading a single answer immediately, and recording the final attempt. Everything
// that could reveal a correct answer happens server-side with the service role key —
// students have NO direct read policy on quiz_questions at all (see schema.sql), so
// this function is the only path to the question content.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Sign in required" }), {
      status: 401, headers: { ...corsHeaders, "content-type": "application/json" },
    });

    const body = await req.json();
    const action = body.action;

    if (action === "questions") {
      const { moduleId } = body;
      const { data: questions, error } = await supabase
        .from("quiz_questions").select("id, position, question, options, objective")
        .eq("module_id", moduleId).order("position");
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ questions: questions || [] }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    if (action === "check") {
      const { questionId, selectedIndex } = body;
      const { data: q, error } = await supabase
        .from("quiz_questions").select("correct_index, explanation").eq("id", questionId).single();
      if (error || !q) throw new Error("Question not found");
      return new Response(JSON.stringify({
        correct: selectedIndex === q.correct_index,
        correctIndex: q.correct_index,
        explanation: q.explanation,
      }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    if (action === "submit") {
      const { moduleId, courseId, answers } = body; // answers: [{questionId, selectedIndex, correct}]
      const score = (answers || []).filter((a: any) => a.correct).length;
      const total = (answers || []).length;
      const { error } = await supabase.from("quiz_attempts").upsert(
        { student_id: user.id, module_id: moduleId, course_id: courseId, score, total, answers, completed_at: new Date().toISOString() },
        { onConflict: "student_id,module_id" },
      );
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ score, total }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("quiz function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
