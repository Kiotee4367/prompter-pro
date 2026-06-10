import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Narrowly-scoped GitHub proxy for the prompter-pro app.
// Holds the GitHub token server-side (as the GITHUB_TOKEN secret) so the
// browser never sees it. Callers authenticate with a separate, low-privilege
// APP_KEY. The proxy ONLY allows reading contents/ and writing requests/*.json
// on a single hard-coded repo, so a stolen app key cannot do anything else.

const REPO = "Kiotee4367/podcast-script-generator";
const ALLOW_ORIGIN = "https://kiotee4367.github.io";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-app-key",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// UTF-8 safe base64 (GitHub Contents API expects base64-encoded content).
function b64utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// Turn an upstream GitHub response into a client response. A 401/403 from
// GitHub means OUR server token (GITHUB_TOKEN) is expired, revoked, or
// rate-limited — NOT that the caller's app key is wrong. Remap it to 502 with
// a clear message so the app never shows the misleading "Invalid App Key" for
// a backend-token problem (the proxy's own app-key failure is the only 401).
function relayGitHub(r: Response, text: string): Response {
  if (r.status === 401 || r.status === 403) {
    return json({
      error: "GitHub rejected the server token (expired, revoked, or rate-limited). Update the GITHUB_TOKEN secret in Supabase.",
      upstream_status: r.status,
    }, 502);
  }
  return new Response(text, { status: r.status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const token = Deno.env.get("GITHUB_TOKEN");
  const appKey = Deno.env.get("APP_KEY");
  if (!token || !appKey) {
    return json({ error: "Backend not configured yet (missing GITHUB_TOKEN / APP_KEY secret)." }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad JSON body" }, 400);
  }

  const sent = req.headers.get("x-app-key") || "";
  if (sent !== appKey) return json({ error: "Invalid app key" }, 401);

  const ghHeaders: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "User-Agent": "prompter-pro-proxy",
  };

  const action = body.action;

  if (action === "read") {
    const ep = String(body.endpoint || "");
    if (!ep.startsWith("contents/") || ep.includes("..")) {
      return json({ error: "Only contents/ reads are allowed" }, 400);
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/${ep}`, { headers: ghHeaders });
    const text = await r.text();
    return relayGitHub(r, text);
  }

  if (action === "commit") {
    const path = String(body.path || "");
    if (!/^requests\/[A-Za-z0-9._-]+\.json$/.test(path)) {
      return json({ error: "Path must be requests/<name>.json" }, 400);
    }
    const content = b64utf8(JSON.stringify(body.payload ?? {}, null, 2));
    const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
      method: "PUT",
      headers: { ...ghHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(body.message || `request: ${path}`),
        content,
        branch: "main",
      }),
    });
    const text = await r.text();
    return relayGitHub(r, text);
  }

  return json({ error: "Unknown action" }, 400);
});
