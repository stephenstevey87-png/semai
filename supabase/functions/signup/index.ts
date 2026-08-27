// Creates a SEMAI account from a username + password — no email, no confirmation step.
// Supabase Auth is internally still email-based, so this maps the username to a
// deterministic, non-routable synthetic email (username@users.semai.invalid) and creates
// the user via the ADMIN API with email_confirm:true, which is what skips the confirmation
// email entirely. This has to run server-side: only the service role key can call
// auth.admin.createUser — the client-side signUp() always goes through the confirmation
// flow regardless of what email you give it.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Must exactly match the normalization used client-side (supabaseClient.js) — sign-in
// recomputes this same transform from the typed username with no server round-trip, so
// any mismatch here would make a user unable to sign in to the account they just created.
function usernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return `${normalized}@users.semai.invalid`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const username = (body.username || "").trim();
    const password = body.password || "";
    const name = (body.name || "").trim();
    const role = body.role || "lecturer";
    const institutionId = body.institutionId || undefined;
    const newInstitutionName = body.newInstitutionName || undefined;

    const normalized = username.toLowerCase().replace(/[^a-z0-9_.-]/g, "");
    if (normalized.length < 3) {
      return new Response(JSON.stringify({ error: "Username must be at least 3 characters (letters, numbers, dots, dashes, underscores only)." }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    if (normalized !== username.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Username can only contain letters, numbers, dots, dashes, and underscores." }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    if (!name) return new Response(JSON.stringify({ error: "Name is required." }), {
      status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
    });
    if (!password || password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const email = usernameToEmail(normalized);

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // this is what skips the confirmation email — the account is usable immediately
      user_metadata: { name, role, institutionId, newInstitutionName, username: normalized },
    });

    if (error) {
      const msg = /already.*registered|already.*exists/i.test(error.message)
        ? "That username is already taken — please choose another."
        : error.message;
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ userId: data.user?.id, username: normalized }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("signup function error:", String((err as any)?.message || err));
    return new Response(JSON.stringify({ error: String((err as any)?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
