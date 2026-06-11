import { TikTokApiService } from '@/app/services/tiktok/tiktok-api.service';

function mockResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('TikTokApiService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TIKTOK_CLIENT_KEY: 'client-key',
      TIKTOK_CLIENT_SECRET: 'client-secret',
      TIKTOK_REDIRECT_URI: 'https://allerac.example/api/tiktok/callback',
    };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('builds a Login Kit URL with the required scopes and state', () => {
    const service = new TikTokApiService();
    const url = new URL(service.buildAuthUrl('csrf-state'));

    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('client-key');
    expect(url.searchParams.get('redirect_uri')).toBe('https://allerac.example/api/tiktok/callback');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,video.publish');
    expect(url.searchParams.get('state')).toBe('csrf-state');
  });

  it('exchanges an authorization code without exposing the secret in the URL', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(mockResponse({
      access_token: 'access',
      expires_in: 86400,
      open_id: 'open-id',
      refresh_expires_in: 31536000,
      refresh_token: 'refresh',
      scope: 'user.info.basic,video.publish',
      token_type: 'Bearer',
    }));

    const token = await new TikTokApiService().exchangeCodeForToken('auth-code');

    expect(token.access_token).toBe('access');
    expect(fetch).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/oauth/token/',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = jest.mocked(fetch).mock.calls[0];
    expect(String(request[0])).not.toContain('client-secret');
    expect(String((request[1] as RequestInit).body)).toContain('client_secret=client-secret');
  });

  it('normalizes provider failures without returning the provider message', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(mockResponse({
      error: { code: 'invalid_grant', message: 'sensitive provider detail' },
    }, 400));

    await expect(
      new TikTokApiService().exchangeCodeForToken('bad-code'),
    ).rejects.toThrow('TikTok token exchange failed (invalid_grant)');
  });
});
