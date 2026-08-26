// Completes an LTI Deep Linking flow: the lecturer has picked a SEMAI course in our
// picker UI, and this signs a Deep Linking Response JWT (as required by the LTI-DL spec)
// pointing at that course, then hands back an auto-submitting HTML form that POSTs it
// to the LMS's deep_link_return_url — from here, the browser leaves SEMAI and returns
// to the LMS, which now has a course-specific link saved in whatever assignment/page
// the lecturer was editing.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { jwtVerify, SignJWT, importPKCS8 } from "npm:jose@5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const LAUNCH_URL = `${SUPABASE_URL}/functions/v1/lti-launch`;
const KID = "semai-lti-2026-08b"; // must match the kid published in lti-jwks

function errorPage(title: string, detail: string, status = 400): Response {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:560px;margin:0 auto;color:#1F2937">
      <h2 style="color:#B91C1C">${title}</h2><p>${detail}</p>
    </body></html>`,
    { status, headers: { "content-type": "text/html" } },
  );
}

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const courseId = url.searchParams.get("course");
    if (!token || !courseId) return errorPage("Missing parameters", "This link is incomplete.");

    const stateSecret = new TextEncoder().encode(Deno.env.get("LTI_STATE_SECRET")!);
    let session: any;
    try {
      ({ payload: session } = await jwtVerify(token, stateSecret));
    } catch {
      return errorPage("Session expired", "This course-picker session has expired — please go back to your LMS and try adding the link again.");
    }

    const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: platform } = await supabase.from("lti_platforms").select("*").eq("id", session.platformId).single();
    if (!platform) return errorPage("Unknown platform", "This platform registration no longer exists.");

    // Defense in depth: even though the picker UI only ever shows courses from the
    // lecturer's own institution, verify server-side too before trusting the course id.
    const { data: course } = await supabase.from("courses").select("id, title, institution_id").eq("id", courseId).single();
    if (!course || course.institution_id !== platform.institution_id) {
      return errorPage("Invalid course", "That course does not belong to this institution.");
    }

    const privateKeyPem = Deno.env.get("LTI_TOOL_PRIVATE_KEY");
    if (!privateKeyPem) return errorPage("Not configured", "LTI_TOOL_PRIVATE_KEY is not set as a Supabase secret.", 500);
    const privateKey = await importPKCS8(privateKeyPem, "RS256");

    const contentItem = {
      type: "ltiResourceLink",
      url: `${LAUNCH_URL}?course=${encodeURIComponent(course.id)}`,
      title: course.title,
    };

    const nonce = crypto.randomUUID();
    const responseJwt = await new SignJWT({
      "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
      "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id": platform.deployment_id,
      "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [contentItem],
      ...(session.data ? { "https://purl.imsglobal.org/spec/lti-dl/claim/data": session.data } : {}),
      nonce,
      aud: platform.issuer,
    })
      .setProtectedHeader({ alg: "RS256", kid: KID })
      .setIssuedAt()
      .setExpirationTime("5m")
      .setIssuer(platform.client_id)
      .sign(privateKey);

    // The LMS expects this as a real browser form POST (response_mode=form_post), not a fetch —
    // an auto-submitting form is the standard way every LTI tool implementation does this.
    const html = `<!doctype html><html><body onload="document.forms[0].submit()">
      <form action="${session.deepLinkReturnUrl}" method="POST">
        <input type="hidden" name="JWT" value="${responseJwt}"/>
      </form>
      <p style="font-family:system-ui;color:#6B7280;text-align:center;margin-top:60px">Returning to your LMS…</p>
    </body></html>`;

    return new Response(html, { headers: { "content-type": "text/html" } });
  } catch (err) {
    console.error("lti-deep-link-respond error:", String((err as any)?.message || err));
    return errorPage("Failed to complete the link", String((err as any)?.message || err), 500);
  }
});
