// Publishes SEMAI's own public signing key so an LMS can verify anything SEMAI signs
// (used during tool registration, and later for Assignment & Grade Services calls).
// The private half of this keypair is never in this file — it's a Supabase secret
// (LTI_TOOL_PRIVATE_KEY), used only by functions that need to sign something, not this one.

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

// Public RSA key components only — safe to hardcode, this is not sensitive data.
const JWK = {
  kty: "RSA",
  use: "sig",
  alg: "RS256",
  kid: "semai-lti-2026-08",
  n: "mlEaQYz_xvS3VbRKXmAnK7uiq9aKJH277tGcI_jus8xn3jEj-xp-4nmrXBYTCnJsSyPM10d1XqNKFyUn4nnar81EoZOv4ZiN3nn6FMNUAaAG7PY0X6NBcX2UAk6iz5wsXBbALDdpk_gLKYVgUnbCckTQd13O2DRomGToIayNzai0xlQSt4mF0A95iyqObLJsrV8hE1WZXkuiaJYZAKRGWVn4hs0N8bp4ai39Kv5C7Sf96knwdhbqx8geZ8zfxL--A5uQhu_AW7qMi1hMQQNjphiIV37cugEU6yXGnhrGY8-xXXJYh_dBO-4ZiKaqMl6XaLQkLJW4h_pfC7oSNXlFeQ",
  e: "AQAB",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ keys: [JWK] }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});
