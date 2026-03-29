export interface Env {
  WORKER_SECRET: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OAUTH_CONSUMER_URL = "https://thegarth.s3.amazonaws.com/oauth_consumer.json";
const GARMIN_DOMAIN = "garmin.com";
const SSO_BASE = `https://sso.${GARMIN_DOMAIN}/sso`;
const SSO_EMBED = `${SSO_BASE}/embed`;
const PREAUTH_BASE = `https://connectapi.${GARMIN_DOMAIN}/oauth-service/oauth/preauthorized`;
const EXCHANGE_BASE = `https://connectapi.${GARMIN_DOMAIN}/oauth-service/oauth/exchange/user/2.0`;
const USER_AGENT = "com.garmin.android.apps.connectmobile";

const SIGNIN_PARAMS = new URLSearchParams({
  id: "gauth-widget",
  embedWidget: "true",
  gauthHost: SSO_EMBED,
  service: SSO_EMBED,
  source: SSO_EMBED,
  redirectAfterAccountLoginUrl: SSO_EMBED,
  redirectAfterAccountCreationUrl: SSO_EMBED,
});

// ---------------------------------------------------------------------------
// OAuth consumer (cached per isolate lifetime)
// ---------------------------------------------------------------------------

let oauthConsumer: { consumer_key: string; consumer_secret: string } | null = null;

async function getOAuthConsumer() {
  if (oauthConsumer) return oauthConsumer;
  const resp = await fetch(OAUTH_CONSUMER_URL);
  if (!resp.ok) throw new Error(`Failed to fetch OAuth consumer: ${resp.status}`);
  oauthConsumer = (await resp.json()) as { consumer_key: string; consumer_secret: string };
  return oauthConsumer;
}

// ---------------------------------------------------------------------------
// Cookie jar helpers
// ---------------------------------------------------------------------------

type CookieJar = Record<string, string>;

function updateCookies(resp: Response, jar: CookieJar): void {
  // CF Workers supports getAll() for set-cookie
  const setCookies = resp.headers.getAll("set-cookie");
  for (const cookie of setCookies) {
    const nameVal = cookie.split(";")[0];
    const eqIdx = nameVal.indexOf("=");
    if (eqIdx > 0) {
      const name = nameVal.slice(0, eqIdx).trim();
      const value = nameVal.slice(eqIdx + 1).trim();
      jar[name] = value;
    }
  }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ---------------------------------------------------------------------------
// garminFetch — fetch with cookie jar + redirect following
// ---------------------------------------------------------------------------

async function garminFetch(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: string },
  jar: CookieJar,
  maxRedirects = 8
): Promise<{ text: string; status: number }> {
  let currentUrl = url;
  let method = options.method;
  let body: string | undefined = options.body;

  for (let i = 0; i <= maxRedirects; i++) {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      ...(options.headers ?? {}),
    };
    const cookies = cookieHeader(jar);
    if (cookies) headers["Cookie"] = cookies;

    const resp = await fetch(currentUrl, { method, headers, body, redirect: "manual" });
    updateCookies(resp, jar);

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) throw new Error("Redirect without Location header");
      currentUrl = location.startsWith("http")
        ? location
        : new URL(location, currentUrl).toString();
      // Follow redirect as GET
      method = "GET";
      body = undefined;
      delete options.headers?.["Content-Type"];
      continue;
    }

    const text = await resp.text();
    return { text, status: resp.status };
  }

  throw new Error("Too many redirects");
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function extractCsrf(html: string): string {
  const m = html.match(/name="_csrf"\s+value="(.+?)"/);
  if (!m) throw new Error("CSRF token not found in page");
  return m[1];
}

function extractTitle(html: string): string {
  const m = html.match(/<title>([\s\S]+?)<\/title>/i);
  if (!m) throw new Error(`Title not found. Page preview: ${html.slice(0, 300)}`);
  return m[1].trim();
}

function extractTicket(html: string): string {
  const m = html.match(/embed\?ticket=([^"&]+)/);
  if (!m) throw new Error("Ticket not found in success page");
  return m[1];
}

// ---------------------------------------------------------------------------
// OAuth1 HMAC-SHA1 header builder
// ---------------------------------------------------------------------------

function pctEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21").replace(/'/g, "%27")
    .replace(/\(/g, "%28").replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

async function buildOAuth1Header(
  consumerKey: string,
  consumerSecret: string,
  method: string,
  baseUrl: string,
  queryParams: Record<string, string> = {},
  oauthToken?: string,
  oauthTokenSecret?: string
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
  if (oauthToken) oauthParams["oauth_token"] = oauthToken;

  const allParams = { ...queryParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(allParams[k])}`)
    .join("&");

  const sigBase = `${method}&${pctEncode(baseUrl)}&${pctEncode(paramString)}`;
  const signingKey = `${pctEncode(consumerSecret)}&${oauthTokenSecret ? pctEncode(oauthTokenSecret) : ""}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(signingKey),
    { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBase));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
  oauthParams["oauth_signature"] = signature;

  return "OAuth " + Object.keys(oauthParams)
    .map((k) => `${k}="${pctEncode(oauthParams[k])}"`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// completeLogin — ticket → oauth1 → oauth2
// ---------------------------------------------------------------------------

interface GarminTokens {
  oauth1: Record<string, string>;
  oauth2: Record<string, unknown>;
}

async function completeLogin(html: string): Promise<GarminTokens> {
  const ticket = extractTicket(html);
  const consumer = await getOAuthConsumer();

  // OAuth1 preauthorized
  const queryParams: Record<string, string> = {
    ticket,
    "login-url": SSO_EMBED,
    "accepts-mfa-tokens": "true",
  };
  const oauth1Header = await buildOAuth1Header(
    consumer.consumer_key, consumer.consumer_secret, "GET", PREAUTH_BASE, queryParams
  );
  const preAuthResp = await fetch(`${PREAUTH_BASE}?${new URLSearchParams(queryParams)}`, {
    headers: { Authorization: oauth1Header, "User-Agent": USER_AGENT },
  });
  if (!preAuthResp.ok) {
    const t = await preAuthResp.text();
    throw new Error(`Preauth failed ${preAuthResp.status}: ${t}`);
  }
  const oauth1 = Object.fromEntries(new URLSearchParams(await preAuthResp.text()));

  // OAuth1 → OAuth2 exchange
  const exchangeHeader = await buildOAuth1Header(
    consumer.consumer_key, consumer.consumer_secret,
    "POST", EXCHANGE_BASE, {},
    oauth1.oauth_token, oauth1.oauth_token_secret
  );
  const exchangeBody = new URLSearchParams();
  if (oauth1.mfa_token) exchangeBody.set("mfa_token", oauth1.mfa_token);

  const exchangeResp = await fetch(EXCHANGE_BASE, {
    method: "POST",
    headers: {
      Authorization: exchangeHeader,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: exchangeBody.toString(),
  });
  if (!exchangeResp.ok) {
    const t = await exchangeResp.text();
    throw new Error(`Exchange failed ${exchangeResp.status}: ${t}`);
  }

  const oauth2 = await exchangeResp.json() as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  oauth2.expires_at = now + (oauth2.expires_in as number);
  oauth2.refresh_token_expires_at = now + (oauth2.refresh_token_expires_in as number);

  return { oauth1, oauth2 };
}

// ---------------------------------------------------------------------------
// Login state (passed between /login-start and /login-complete)
// ---------------------------------------------------------------------------

interface LoginState {
  cookies: CookieJar;
  mfa_csrf: string;
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Public health check
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", time: new Date().toISOString(), version: "v3-full-rewrite" });
    }

    // Auth guard
    const workerSecret = request.headers.get("X-Worker-Secret");
    if (!env.WORKER_SECRET || workerSecret !== env.WORKER_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // POST /login-start — runs the SSO form flow, pauses at MFA if needed
    if (request.method === "POST" && url.pathname === "/login-start") {
      try {
        const { email, password } = (await request.json()) as { email?: string; password?: string };
        if (!email || !password) {
          return Response.json({ error: "email and password are required" }, { status: 400 });
        }

        const jar: CookieJar = {};

        // 1. Set initial SSO cookies
        await garminFetch(`${SSO_EMBED}?id=gauth-widget&embedWidget=true&gauthHost=${encodeURIComponent(SSO_BASE)}`, { method: "GET" }, jar);

        // 2. Get CSRF token
        const { text: signinPage } = await garminFetch(
          `${SSO_BASE}/signin?${SIGNIN_PARAMS}`,
          { method: "GET", headers: { Referer: SSO_EMBED } },
          jar
        );
        const csrf = extractCsrf(signinPage);

        // 3. Submit credentials
        const { text: afterLogin } = await garminFetch(
          `${SSO_BASE}/signin?${SIGNIN_PARAMS}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: `${SSO_BASE}/signin?${SIGNIN_PARAMS}`,
            },
            body: new URLSearchParams({ username: email, password, embed: "true", _csrf: csrf }).toString(),
          },
          jar
        );

        let title: string;
        try {
          title = extractTitle(afterLogin);
        } catch {
          return Response.json({ error: "title_parse_failed", html: afterLogin.slice(0, 500) }, { status: 500 });
        }

        if (title.includes("MFA")) {
          const mfaCsrf = extractCsrf(afterLogin);
          const state: LoginState = { cookies: jar, mfa_csrf: mfaCsrf };
          return Response.json({ mfa_required: true, state });
        }

        if (title !== "Success") {
          return Response.json({ error: `Unexpected page: ${title}` }, { status: 400 });
        }

        const tokens = await completeLogin(afterLogin);
        return Response.json({ mfa_required: false, tokens });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    // POST /login-complete — submits MFA code, returns final tokens
    if (request.method === "POST" && url.pathname === "/login-complete") {
      try {
        const { state, mfa_code } = (await request.json()) as { state?: LoginState; mfa_code?: string };
        if (!state || !mfa_code) {
          return Response.json({ error: "state and mfa_code are required" }, { status: 400 });
        }

        const jar: CookieJar = { ...state.cookies };

        const { text: afterMfa } = await garminFetch(
          `${SSO_BASE}/verifyMFA/loginEnterMfaCode?${SIGNIN_PARAMS}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Referer: `${SSO_BASE}/signin?${SIGNIN_PARAMS}`,
            },
            body: new URLSearchParams({
              "mfa-code": mfa_code,
              embed: "true",
              _csrf: state.mfa_csrf,
              fromPage: "setupEnterMfaCode",
            }).toString(),
          },
          jar
        );

        const title = extractTitle(afterMfa);
        if (title !== "Success") {
          return Response.json({ error: `MFA failed, page: ${title}` }, { status: 400 });
        }

        const tokens = await completeLogin(afterMfa);
        return Response.json({ tokens });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
