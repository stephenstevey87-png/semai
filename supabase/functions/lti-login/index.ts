// Step 1 of an LTI 1.3 launch (OpenID Connect third-party initiated login).
// The LMS redirects the student/lecturer's browser here FIRST, before the actual launch.
// This function looks up which registered platform sent the request, then redirects the
// browser onward to the LMS's own auth endpoint with a signed `state` and a `nonce` —
// both checked again in lti-launch to prevent forged/replayed launches.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { SignJWT } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const LAUNCH_URL = `${SUPABASE_URL}/functions/v1/lti-launch`;

async function readParams(req: Request): Promise<URLSearchParams> {
  if (req.method === "POST") {
    const body = await req.text();
    return new URLSearchParams(body);
  }
  return new URL(req.url).searchParams;
}

function randomString(len = 32): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  try {
    const params = await readParams(req);
    const iss = params.get("iss");
    const clientId = params.get("client_id");
    const loginHint = params.get("login_hint");
    const targetLinkUri = params.get("target_link_uri");
    const ltiMessageHint = params.get("lti_message_hint");

    if (!iss || !loginHint || !targetLinkUri) {
      return new Response("Missing required OIDC login parameters (iss, login_hint, target_link_uri).", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let query = supabase.from("lti_platforms").select("*").eq("issuer", iss);
    if (clientId) query = query.eq("client_id", clientId);
    const { data: platform, error } = await query.single();

    if (error || !platform) {
      return new Response(
        `No SEMAI platform registration matches issuer "${iss}"${clientId ? ` and client_id "${clientId}"` : ""}. An institution administrator needs to register this LMS deployment first.`,
        { status: 404 },
      );
    }

    const nonce = randomString(16);
    const stateSecret = new TextEncoder().encode(Deno.env.get("LTI_STATE_SECRET")!);
    const state = await new SignJWT({ platformId: platform.id, nonce, targetLinkUri })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(stateSecret);

    const authUrl = new URL(platform.auth_login_url);
    authUrl.searchParams.set("scope", "openid");
    authUrl.searchParams.set("response_type", "id_token");
    authUrl.searchParams.set("client_id", platform.client_id);
    authUrl.searchParams.set("redirect_uri", LAUNCH_URL);
    authUrl.searchParams.set("login_hint", loginHint);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_mode", "form_post");
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("prompt", "none");
    if (ltiMessageHint) authUrl.searchParams.set("lti_message_hint", ltiMessageHint);

    return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
  } catch (err) {
    console.error("lti-login error:", String((err as any)?.message || err));
    return new Response(`LTI login failed: ${String((err as any)?.message || err)}`, { status: 500 });
  }
});
