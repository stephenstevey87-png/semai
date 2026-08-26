// Step 2 of an LTI 1.3 launch. The LMS POSTs an id_token here (a JWT it signs itself)
// after the OIDC redirect from lti-login. This function is the actual security boundary:
// every check below is required by the LTI 1.3 spec, and skipping any of them would let
// a forged or replayed request impersonate a real student or lecturer.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://semai-lecturer.netlify.app";

const ROLE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles";
const DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id";
const MESSAGE_TYPE_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/message_type";

function errorPage(title: string, detail: string, status = 400): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:560px;margin:0 auto;color:#1F2937">
      <h2 style="color:#B91C1C">${title}</h2><p>${detail}</p>
      <p style="color:#6B7280;font-size:13px">If you're a student or lecturer seeing this, please tell your institution administrator — this is a launch configuration issue, not something you did wrong.</p>
    </body></html>`,
    { status, headers: { "content-type": "text/html" } },
  );
}

function inferRole(roles: string[]): "lecturer" | "student" {
  const staffMarkers = ["instructor", "contentdeveloper", "administrator", "mentor", "teachingassistant"];
  const isStaff = (roles || []).some(r => staffMarkers.some(m => r.toLowerCase().includes(m)));
  return isStaff ? "lecturer" : "student";
}

function sha256Hex(input: string): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
    .then(buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join(""));
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return errorPage("Invalid request", "This endpoint only accepts the LMS's launch POST.", 405);

    const body = new URLSearchParams(await req.text());
    const idToken = body.get("id_token");
    const state = body.get("state");
    if (!idToken || !state) return errorPage("Incomplete launch", "Missing id_token or state from the LMS.");

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // 1. Verify our own state JWT (issued by lti-login) — confirms this launch is a direct
    //    continuation of a login we ourselves initiated, not a forged/replayed request.
    const stateSecret = new TextEncoder().encode(Deno.env.get("LTI_STATE_SECRET")!);
    let statePayload: any;
    try {
      ({ payload: statePayload } = await jwtVerify(state, stateSecret));
    } catch {
      return errorPage("Invalid or expired launch", "The launch state could not be verified — please try launching again from your LMS.");
    }

    const { data: platform } = await supabase.from("lti_platforms").select("*").eq("id", statePayload.platformId).single();
    if (!platform) return errorPage("Unknown platform", "This platform registration no longer exists.");

    // 2. Verify the LMS's id_token: signature (via the LMS's own published JWKS), issuer,
    //    audience, and freshness. This is the step that actually proves the request came
    //    from the real LMS and hasn't been tampered with.
    const jwks = createRemoteJWKSet(new URL(platform.jwks_url));
    let claims: any;
    try {
      ({ payload: claims } = await jwtVerify(idToken, jwks, {
        issuer: platform.issuer,
        audience: platform.client_id,
      }));
    } catch (e) {
      return errorPage("Launch verification failed", `Could not verify the id_token against the LMS's published keys: ${String((e as any)?.message || e)}`);
    }

    // 3. Verify LTI-specific claims the generic JWT check above doesn't cover.
    if (claims.nonce !== statePayload.nonce) return errorPage("Launch verification failed", "Nonce mismatch — this looks like a replayed launch.");
    if (claims[DEPLOYMENT_CLAIM] !== platform.deployment_id) return errorPage("Launch verification failed", "Deployment ID does not match this platform registration.");
    if (claims[MESSAGE_TYPE_CLAIM] !== "LtiResourceLinkRequest") {
      return errorPage("Unsupported launch type", `SEMAI currently only supports resource link launches, not "${claims[MESSAGE_TYPE_CLAIM]}". Deep Linking support is planned but not yet built.`);
    }

    if (!platform.default_course_id) {
      return errorPage("No course configured", "This platform is registered but has no default SEMAI course assigned yet — an institution administrator needs to set one.");
    }

    // 4. Resolve (or provision) a stable SEMAI account for this LMS user.
    const sub: string = claims.sub;
    const roles: string[] = claims[ROLE_CLAIM] || [];
    const role = inferRole(roles);
    const name = claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" ") || "Student";

    const { data: existing } = await supabase.from("lti_identities").select("*").eq("issuer", platform.issuer).eq("lms_subject", sub).single();

    let email: string;
    if (existing) {
      email = existing.email;
    } else {
      email = claims.email || `lti-${await sha256Hex(platform.issuer + sub)}@lti.semai.invalid`;
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { name, role, institutionId: platform.institution_id },
      });
      if (createErr || !created?.user) return errorPage("Account provisioning failed", String(createErr?.message || "Could not create a SEMAI account for this LMS user."), 500);
      await supabase.from("lti_identities").insert({ issuer: platform.issuer, lms_subject: sub, user_id: created.user.id, email });
    }

    // 5. Establish a real SEMAI session for this user and send their browser into the app,
    //    already signed in — no separate SEMAI login step, which is the entire point of SSO.
    const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink", email,
      options: { redirectTo: `${FRONTEND_URL}/?ltiCourse=${encodeURIComponent(platform.default_course_id)}` },
    });
    if (linkErr || !link?.properties?.action_link) return errorPage("Sign-in failed", String(linkErr?.message || "Could not establish a session."), 500);

    return new Response(null, { status: 302, headers: { Location: link.properties.action_link } });
  } catch (err) {
    console.error("lti-launch error:", String((err as any)?.message || err));
    return errorPage("Launch failed", String((err as any)?.message || err), 500);
  }
});
