const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_API_URL = 'https://open.tiktokapis.com';

export interface TikTokTokenResponse {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: string;
}

export interface TikTokProfile {
  openId: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface TikTokApiError {
  code?: string;
  message?: string;
  log_id?: string;
}

function getConfig() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY?.trim() ?? '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI?.trim() ?? '',
  };
}

function assertConfigured() {
  const config = getConfig();
  if (!config.clientKey || !config.clientSecret || !config.redirectUri) {
    throw new Error('TikTok is not configured');
  }
  return config;
}

async function parseResponse<T extends object>(response: Response, operation: string): Promise<T> {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  const rawError = body?.error;
  const error = rawError && typeof rawError === 'object'
    ? rawError as TikTokApiError
    : undefined;
  const errorCode = typeof rawError === 'string' ? rawError : error?.code;

  if (!response.ok || (errorCode && errorCode !== 'ok')) {
    const code = errorCode || `http_${response.status}`;
    throw new Error(`TikTok ${operation} failed (${code})`);
  }

  return body as T;
}

export class TikTokApiService {
  isConfigured(): boolean {
    const config = getConfig();
    return Boolean(config.clientKey && config.clientSecret && config.redirectUri);
  }

  buildAuthUrl(state: string): string {
    const config = assertConfigured();
    const params = new URLSearchParams({
      client_key: config.clientKey,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      state,
    });
    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string): Promise<TikTokTokenResponse> {
    const config = assertConfigured();
    return this.requestToken({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }, 'token exchange');
  }

  async refreshAccessToken(refreshToken: string): Promise<TikTokTokenResponse> {
    const config = assertConfigured();
    return this.requestToken({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }, 'token refresh');
  }

  async revokeAccess(accessToken: string): Promise<void> {
    const config = assertConfigured();
    const response = await fetch(`${TIKTOK_API_URL}/v2/oauth/revoke/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        token: accessToken,
      }),
    });
    await parseResponse<Record<string, never>>(response, 'token revoke');
  }

  async getProfile(accessToken: string): Promise<TikTokProfile> {
    const response = await fetch(
      `${TIKTOK_API_URL}/v2/user/info/?fields=open_id,avatar_url,display_name`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await parseResponse<{
      data?: { user?: { open_id?: string; avatar_url?: string; display_name?: string } };
    }>(response, 'profile request');
    const user = body.data?.user;
    if (!user?.open_id) throw new Error('TikTok profile response did not include open_id');
    return {
      openId: user.open_id,
      displayName: user.display_name?.trim() || 'TikTok user',
      avatarUrl: user.avatar_url || null,
    };
  }

  private async requestToken(
    parameters: Record<string, string>,
    operation: string,
  ): Promise<TikTokTokenResponse> {
    const response = await fetch(`${TIKTOK_API_URL}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters),
    });
    const token = await parseResponse<TikTokTokenResponse>(response, operation);
    if (!token.access_token || !token.refresh_token || !token.open_id) {
      throw new Error(`TikTok ${operation} returned incomplete credentials`);
    }
    return token;
  }
}
