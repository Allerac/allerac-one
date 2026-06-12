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

export type TikTokPrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'FOLLOWER_OF_CREATOR'
  | 'SELF_ONLY';

export interface TikTokCreatorInfo {
  creatorAvatarUrl: string | null;
  creatorUsername: string;
  creatorNickname: string;
  privacyLevelOptions: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface TikTokPhotoPostInput {
  title: string;
  description: string;
  privacyLevel: TikTokPrivacyLevel;
  disableComment: boolean;
  autoAddMusic: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  photoImages: string[];
  photoCoverIndex: number;
}

export interface TikTokPublishStatus {
  status: 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED';
  failReason: string | null;
  postIds: string[];
  uploadedBytes: number | null;
  downloadedBytes: number | null;
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

  async getCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const response = await fetch(`${TIKTOK_API_URL}/v2/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });
    const body = await parseResponse<{
      data?: {
        creator_avatar_url?: string;
        creator_username?: string;
        creator_nickname?: string;
        privacy_level_options?: TikTokPrivacyLevel[];
        comment_disabled?: boolean;
        duet_disabled?: boolean;
        stitch_disabled?: boolean;
        max_video_post_duration_sec?: number;
      };
    }>(response, 'creator info request');
    const data = body.data;
    if (!data?.creator_username || !Array.isArray(data.privacy_level_options)) {
      throw new Error('TikTok creator info response was incomplete');
    }
    return {
      creatorAvatarUrl: data.creator_avatar_url || null,
      creatorUsername: data.creator_username,
      creatorNickname: data.creator_nickname || data.creator_username,
      privacyLevelOptions: data.privacy_level_options,
      commentDisabled: Boolean(data.comment_disabled),
      duetDisabled: Boolean(data.duet_disabled),
      stitchDisabled: Boolean(data.stitch_disabled),
      maxVideoPostDurationSec: data.max_video_post_duration_sec || 0,
    };
  }

  async publishPhoto(accessToken: string, input: TikTokPhotoPostInput): Promise<{ publishId: string }> {
    const response = await fetch(`${TIKTOK_API_URL}/v2/post/publish/content/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: input.title,
          description: input.description,
          privacy_level: input.privacyLevel,
          disable_comment: input.disableComment,
          auto_add_music: input.autoAddMusic,
          brand_content_toggle: input.brandContentToggle,
          brand_organic_toggle: input.brandOrganicToggle,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: input.photoCoverIndex,
          photo_images: input.photoImages,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      }),
    });
    const body = await parseResponse<{ data?: { publish_id?: string } }>(
      response,
      'photo publish request',
    );
    const publishId = body.data?.publish_id;
    if (!publishId) throw new Error('TikTok photo publish response did not include publish_id');
    return { publishId };
  }

  async getPublishStatus(accessToken: string, publishId: string): Promise<TikTokPublishStatus> {
    const response = await fetch(`${TIKTOK_API_URL}/v2/post/publish/status/fetch/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const body = await parseResponse<{
      data?: {
        status?: TikTokPublishStatus['status'];
        fail_reason?: string;
        publicaly_available_post_id?: Array<string | number>;
        uploaded_bytes?: number;
        downloaded_bytes?: number;
      };
    }>(response, 'publish status request');
    const data = body.data;
    if (!data?.status) throw new Error('TikTok publish status response was incomplete');
    return {
      status: data.status,
      failReason: data.fail_reason || null,
      postIds: (data.publicaly_available_post_id || []).map(String),
      uploadedBytes: data.uploaded_bytes ?? null,
      downloadedBytes: data.downloaded_bytes ?? null,
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
