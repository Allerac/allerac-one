import type { NotesConnector, NotesConnectorContent, NotesConnectorTokens } from './types';
import { extractPdfText } from '@/app/services/rag/pdf-text';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// drive.file only: this connector can never see more than the files the user
// explicitly grants access to via the Google Picker (client-side). There is
// deliberately no broader drive.readonly scope here.
//
// Confirmed against the live API: drive.file's files.list only ever returns
// files the app itself created — it does NOT return the children of a folder
// granted through the Picker, even though the folder itself is accessible by
// id. So there is no folder-level bulk import; the Picker is used for
// individual (optionally multi-selected) files only.
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
}

function config() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI?.trim() ?? '',
  };
}

function requireConfig() {
  const value = config();
  if (!value.clientId || !value.clientSecret || !value.redirectUri) {
    throw new Error('Google Drive connector is not configured');
  }
  return value;
}

async function driveFetch(accessToken: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${DRIVE_API}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
}

async function parseJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google Drive ${operation} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

export class GoogleDriveConnectorService implements NotesConnector {
  readonly provider = 'google_drive' as const;

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
      scope: SCOPE,
      access_type: 'offline',
      // consent: always show consent so a refresh_token is returned even on
      // a re-connect (Google omits it by default once already granted).
      // select_account: force the account chooser instead of silently
      // reusing the active Google session — otherwise reconnecting after
      // disconnect goes straight through with whichever account was used
      // last, with no way to switch.
      prompt: 'select_account consent',
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
        code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });
    const tokens = await parseJson<GoogleTokenResponse>(response, 'token exchange');
    if (!tokens.refresh_token) {
      throw new Error('Google did not return a refresh token — retry the connection (consent must be re-shown)');
    }
    const account = await this.fetchAccountInfo(tokens.access_token);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      accountId: account?.permissionId,
      accountLabel: account?.emailAddress ?? account?.displayName,
      scopes: tokens.scope ?? SCOPE,
    };
  }

  async refreshToken(refreshToken: string): Promise<NotesConnectorTokens> {
    const { clientId, clientSecret } = requireConfig();
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token',
      }),
    });
    const tokens = await parseJson<GoogleTokenResponse>(response, 'token refresh');
    return {
      accessToken: tokens.access_token,
      // Google does not reissue a refresh_token on refresh — keep the one we have.
      refreshToken: tokens.refresh_token ?? refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
  }

  async fetchContent(accessToken: string, externalId: string): Promise<NotesConnectorContent> {
    const meta = await this.getFileMetadata(accessToken, externalId);

    if (meta.mimeType === 'application/vnd.google-apps.document') {
      const exported = await this.exportGoogleDoc(accessToken, externalId);
      return exported;
    }

    const response = await driveFetch(accessToken, `/files/${externalId}?alt=media&supportsAllDrives=true`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Google Drive file download failed (${response.status}): ${body.slice(0, 300)}`);
    }

    if (meta.mimeType === 'application/pdf') {
      const buffer = Buffer.from(await response.arrayBuffer());
      const text = await extractPdfText(buffer);
      return { raw: text, mimeType: 'application/pdf' };
    }

    const raw = await response.text();
    return { raw, mimeType: meta.mimeType === 'text/markdown' ? 'text/markdown' : 'text/plain' };
  }

  normalizeToMarkdown(content: NotesConnectorContent): string {
    // Plain text, markdown, and PDF-extracted text all pass through
    // unchanged — Drive never hands this connector HTML (Google Docs are
    // exported straight to markdown/plain text via the Docs export endpoint),
    // and pdf-parse already returns plain text, not markup.
    return content.raw;
  }

  /** Used by the import action to enrich a Picker selection with the metadata NotesConnectorItem needs. */
  async describeSelectedFile(accessToken: string, fileId: string): Promise<{ modifiedAt: string; sourceUrl: string; parentLabel: string }> {
    const meta = await this.getFileMetadata(accessToken, fileId, 'id,name,mimeType,modifiedTime,webViewLink,parents');
    const parentLabel = meta.parents?.[0] ? await this.getFolderName(accessToken, meta.parents[0]) : '';
    return {
      modifiedAt: meta.modifiedTime ?? new Date().toISOString(),
      sourceUrl: meta.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
      parentLabel,
    };
  }

  private async getFileMetadata(accessToken: string, fileId: string, fields = 'id,name,mimeType'): Promise<DriveFileMetadata> {
    // supportsAllDrives: without it, files.get 404s ("File not found") for
    // anything living in a Shared Drive, even when the token genuinely has
    // access — confirmed against the live API while debugging Phase 2.
    const response = await driveFetch(accessToken, `/files/${fileId}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
    return parseJson<DriveFileMetadata>(response, 'file metadata lookup');
  }

  private async getFolderName(accessToken: string, folderId: string): Promise<string> {
    try {
      const folder = await this.getFileMetadata(accessToken, folderId, 'name');
      return folder.name ?? '';
    } catch {
      return '';
    }
  }

  private async exportGoogleDoc(accessToken: string, fileId: string): Promise<NotesConnectorContent> {
    const markdown = await driveFetch(accessToken, `/files/${fileId}/export?mimeType=${encodeURIComponent('text/markdown')}`);
    if (markdown.ok) {
      return { raw: await markdown.text(), mimeType: 'text/markdown' };
    }
    // Markdown export isn't available for every Workspace/org policy — fall back to plain text.
    const plain = await driveFetch(accessToken, `/files/${fileId}/export?mimeType=${encodeURIComponent('text/plain')}`);
    if (!plain.ok) {
      const body = await plain.text().catch(() => '');
      throw new Error(`Google Doc export failed (${plain.status}): ${body.slice(0, 300)}`);
    }
    return { raw: await plain.text(), mimeType: 'text/plain' };
  }

  private async fetchAccountInfo(accessToken: string): Promise<{ emailAddress?: string; displayName?: string; permissionId?: string } | null> {
    try {
      const response = await driveFetch(accessToken, '/about?fields=user');
      const data = await parseJson<{ user?: { emailAddress?: string; displayName?: string; permissionId?: string } }>(response, 'about lookup');
      return data.user ?? null;
    } catch {
      return null;
    }
  }
}
