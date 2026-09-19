import TurndownService from 'turndown';
import type { NotesConnector, NotesConnectorContent, NotesConnectorItem, NotesConnectorTokens } from './types';

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_API = 'https://graph.microsoft.com/v1.0';

// common tenant + these scopes: works for both personal Microsoft accounts
// (outlook.com/hotmail/live) and work/school accounts, whichever the user
// actually has OneNote content on. Notes.Read only — read-only, no write.
const SCOPES = 'openid profile email offline_access Notes.Read';

interface GraphTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
  scope?: string;
}

interface OneNoteNotebook {
  id: string;
  displayName: string;
  sections?: OneNoteSection[];
}

interface OneNoteSection {
  id: string;
  displayName: string;
}

interface OneNotePage {
  id: string;
  title: string;
  lastModifiedDateTime: string;
  links?: { oneNoteWebUrl?: { href: string } };
}

function config() {
  return {
    clientId: process.env.ONENOTE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.ONENOTE_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.ONENOTE_REDIRECT_URI?.trim() ?? '',
  };
}

function requireConfig() {
  const value = config();
  if (!value.clientId || !value.clientSecret || !value.redirectUri) {
    throw new Error('OneNote connector is not configured');
  }
  return value;
}

async function graphFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
}

async function parseJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Microsoft Graph ${operation} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

/** Best-effort display label from the ID token's claims — not signature-verified, used only to show "connected as ..." in the UI. */
function decodeIdTokenLabel(idToken: string | undefined): { accountId?: string; accountLabel?: string } {
  if (!idToken) return {};
  try {
    const payload = idToken.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const claims = JSON.parse(json) as { oid?: string; sub?: string; email?: string; preferred_username?: string; name?: string };
    return {
      accountId: claims.oid ?? claims.sub,
      accountLabel: claims.email ?? claims.preferred_username ?? claims.name,
    };
  } catch {
    return {};
  }
}

export class OneNoteConnectorService implements NotesConnector {
  readonly provider = 'onenote' as const;
  private readonly turndown = new TurndownService();

  isConfigured(): boolean {
    const value = config();
    return Boolean(value.clientId && value.clientSecret && value.redirectUri);
  }

  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = requireConfig();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: SCOPES,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<NotesConnectorTokens> {
    const { clientId, clientSecret, redirectUri } = requireConfig();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: SCOPES,
      }),
    });
    const tokens = await parseJson<GraphTokenResponse>(response, 'token exchange');
    if (!tokens.refresh_token) {
      throw new Error('Microsoft did not return a refresh token — retry the connection');
    }
    const { accountId, accountLabel } = decodeIdTokenLabel(tokens.id_token);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      accountId,
      accountLabel,
      scopes: tokens.scope ?? SCOPES,
    };
  }

  async refreshToken(refreshToken: string): Promise<NotesConnectorTokens> {
    const { clientId, clientSecret } = requireConfig();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', scope: SCOPES,
      }),
    });
    const tokens = await parseJson<GraphTokenResponse>(response, 'token refresh');
    if (!tokens.refresh_token) {
      throw new Error('Microsoft did not return a refresh token on refresh');
    }
    return {
      accessToken: tokens.access_token,
      // Unlike Google, Microsoft always reissues a refresh token — the new one must replace the old one.
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
  }

  async *listItems(accessToken: string): AsyncIterable<NotesConnectorItem> {
    const notebooksRes = await graphFetch(accessToken, '/me/onenote/notebooks?$expand=sections');
    const { value: notebooks } = await parseJson<{ value: OneNoteNotebook[] }>(notebooksRes, 'notebooks listing');

    // One request per section, run concurrently — sequential (section by
    // section, awaited one at a time) was slow enough to look hung for
    // anyone with more than a handful of sections.
    const sections = notebooks.flatMap(notebook =>
      (notebook.sections ?? []).map(section => ({ notebook, section })),
    );

    const pagesBySection = await Promise.all(
      sections.map(async ({ notebook, section }) => {
        const pagesRes = await graphFetch(
          accessToken,
          `/me/onenote/sections/${section.id}/pages?$select=id,title,lastModifiedDateTime,links&$top=100`,
        );
        const { value: pages } = await parseJson<{ value: OneNotePage[] }>(pagesRes, 'pages listing');
        return { notebook, section, pages };
      }),
    );

    for (const { notebook, section, pages } of pagesBySection) {
      for (const page of pages) {
        yield {
          externalId: page.id,
          title: page.title || '(untitled)',
          sourceUrl: page.links?.oneNoteWebUrl?.href ?? '',
          parentLabel: `${notebook.displayName} / ${section.displayName}`,
          modifiedAt: page.lastModifiedDateTime,
        };
      }
    }
  }

  async fetchContent(accessToken: string, externalId: string): Promise<NotesConnectorContent> {
    const response = await graphFetch(accessToken, `/me/onenote/pages/${externalId}/content`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OneNote page content fetch failed (${response.status}): ${body.slice(0, 300)}`);
    }
    const raw = await response.text();
    return { raw, mimeType: 'text/html' };
  }

  normalizeToMarkdown(content: NotesConnectorContent): string {
    return this.turndown.turndown(content.raw);
  }
}
