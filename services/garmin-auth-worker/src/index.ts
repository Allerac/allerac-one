export interface Env {
  WORKER_SECRET: string;
}

const OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";
const GARMIN_DOMAIN = "garmin.com";
const PREAUTH_BASE = `https://connectapi.${GARMIN_DOMAIN}/oauth-service/oauth/preauthorized`;
const LOGIN_URL = `https://sso.${GARMIN_DOMAIN}/sso/embed`;
const USER_AGENT = "com.garmin.android.apps.connectmobile";

let oauthConsumer: { consumer_key: string; consumer_secret: string } | null = null;

async function getOAuthConsumer() {
  if (oauthConsumer) return oauthConsumer;
  const resp = await fetch(OAUTH_CONSUMER_URL);
  if (!resp.ok) throw new Error(`Failed to fetch OAuth consumer credentials: ${resp.status}`);
  oauthConsumer = (await resp.json()) as { consumer_key: string; consumer_secret: string };
  return oauthConsumer;
}

function pctEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function buildOAuth1Header(
  consumerKey: string,
  consumerSecret: string,
  method: string,
  baseUrl: string,
  queryParams: Record<string, string>
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0",
  };

  const allParams = { ...queryParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(allParams[k])}`)
    .join("&");

  const sigBase = `${method}&${pctEncode(baseUrl)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(consumerSecret)}&`; // no token secret

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBase));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  oauthParams["oauth_signature"] = signature;

  return (
    "OAuth " +
    Object.keys(oauthParams)
      .map((k) => `${k}="${pctEncode(oauthParams[k])}"`)
      .join(", ")
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", time: new Date().toISOString() });
    }

    const workerSecret = request.headers.get("X-Worker-Secret");
    if (!env.WORKER_SECRET || workerSecret !== env.WORKER_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (request.method === "POST" && url.pathname === "/preauthorize") {
      try {
        const body = (await request.json()) as { ticket?: string };
        if (!body.ticket) {
          return Response.json({ error: "ticket is required" }, { status: 400 });
        }

        const consumer = await getOAuthConsumer();

        const queryParams: Record<string, string> = {
          ticket: body.ticket,
          "login-url": LOGIN_URL,
          "accepts-mfa-tokens": "true",
        };

        const authHeader = await buildOAuth1Header(
          consumer.consumer_key,
          consumer.consumer_secret,
          "GET",
          PREAUTH_BASE,
          queryParams
        );

        const fullUrl = `${PREAUTH_BASE}?${new URLSearchParams(queryParams)}`;
        const resp = await fetch(fullUrl, {
          headers: {
            Authorization: authHeader,
            "User-Agent": USER_AGENT,
          },
        });

        if (!resp.ok) {
          const text = await resp.text();
          return Response.json(
            { error: `Garmin returned ${resp.status}`, detail: text },
            { status: resp.status }
          );
        }

        // Garmin responds with URL-encoded form: oauth_token=...&oauth_token_secret=...
        const text = await resp.text();
        const parsed = Object.fromEntries(new URLSearchParams(text));
        return Response.json(parsed);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
