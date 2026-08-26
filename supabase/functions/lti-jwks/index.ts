// Publishes SEMAI's own public signing key so an LMS can verify anything SEMAI signs
// (used during tool registration, and for Deep Linking responses / grade passback).
// The private half of this keypair is never in this file — it's the Supabase secret
// LTI_TOOL_PRIVATE_KEY, used only by functions that need to sign something, not this one.

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

const JWK = {
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  kid: "semai-lti-2026-08b",
  n: "jXpRq9F8JHERscgq3GMIt1KStcENDV-P7llnnGY8EzSE_MvRZ6D4YIs5nsTy6GK7LRluEyNKA8Wi_FrwsxS1OflO83aMOKgbyiIKObCpgCOjiFVZDk24Xvz205nyzmRtuL2ex5DPSL8fLep0jCBSzys62qR3XHW_S9cr9JDDpXo0zw_Km9L5OOWH5s0upLRzoM3UNVfF_WsAyorpyqUl84t_RoGMCXjBG8kJIgVf6dOU3Gqu3wAYuGfNCgJHvv0Rv4jvIDmImLFFELFZSxsrGFF-kELMJd_5XtgUIMW3FG60_Cabr6svfE4FtkVhhS2JyeNFkN5ldLpRdtfyLihhpw",
  e: "AQAB",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ keys: [JWK] }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
