/**
 * Instagram Graph API — thin wrapper
 *
 * Docs: https://developers.facebook.com/docs/instagram-api
 *
 * Env vars required:
 *   INSTAGRAM_APP_ID
 *   INSTAGRAM_APP_SECRET
 *   INSTAGRAM_REDIRECT_URI   (e.g. https://yourdomain.com/api/instagram/callback)
 */

const APP_ID       = process.env.INSTAGRAM_APP_ID          ?? '';
const APP_SECRET   = process.env.INSTAGRAM_APP_SECRET      ?? '';
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI    ?? '';
const CONFIG_ID    = process.env.INSTAGRAM_CONFIG_ID       ?? '';
// Instagram Login for Business (2024+)
// Docs: https://developers.facebook.com/docs/instagram/business-login-for-instagram
const GRAPH_URL    = 'https://graph.instagram.com/v21.0';
const IG_AUTH_URL  = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

export interface IGUser {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  biography?: string;
  followers_count?: number;
  media_count?: number;
}

export interface IGMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url?: string;
  thumbnail_url?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  permalink: string;
}

export interface IGConversation {
  id: string;
  updated_time: string;
  participants: { data: Array<{ id: string; username?: string; name?: string }> };
}

export interface IGMessage {
  id: string;
  message: string;
  from: { id: string; username?: string; name?: string };
  created_time: string;
}

export interface IGTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  user_id?: string;
}

export class InstagramGraphService {
  /** Build the OAuth authorization URL to redirect the user to */
  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     APP_ID,
      redirect_uri:  REDIRECT_URI,
      scope:         'instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish',
      response_type: 'code',
      state,
    });
    return `${IG_AUTH_URL}?${params.toString()}`;
  }

  /** Exchange authorization code for a user access token, then find the linked IG Business account */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; igUserId: string; expiresAt: Date | null }> {
    // Step 1: exchange code for short-lived user access token
    const tokenRes = await fetch(IG_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     APP_ID,
        client_secret: APP_SECRET,
        grant_type:    'authorization_code',
        redirect_uri:  REDIRECT_URI,
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      throw new Error(`Instagram OAuth error: ${err}`);
    }

    const tokenData: IGTokenResponse & { expires_in?: number } = await tokenRes.json();
    const userAccessToken = tokenData.access_token;
    // api.instagram.com returns the legacy webhook-compatible IG user ID here
    const legacyUserId = tokenData.user_id;

    // Step 2: exchange for long-lived user token (60 days)
    const longRes = await fetch(
      `${GRAPH_URL}/access_token?grant_type=ig_exchange_token&client_secret=${APP_SECRET}&access_token=${userAccessToken}`
    );
    const longToken = longRes.ok ? (await longRes.json() as IGTokenResponse & { expires_in?: number }) : tokenData;
    const accessToken = longToken.access_token ?? userAccessToken;
    const expiresAt = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000) : null;

    // Step 3: get Instagram user ID from the token
    const meRes = await fetch(`${GRAPH_URL}/me?fields=id,username&access_token=${accessToken}`);
    if (!meRes.ok) throw new Error(`Could not fetch Instagram user: ${await meRes.text()}`);
    const me = await meRes.json() as { id: string; username?: string };

    // Prefer the legacy user_id from the initial exchange — this is the ID that Meta webhooks use.
    // The /me endpoint on graph.instagram.com returns the Business Login scoped ID which differs.
    const igUserId = legacyUserId ?? me.id;
    console.log(`[Instagram] user IDs — token exchange: ${legacyUserId ?? '(none)'}, /me: ${me.id}, using: ${igUserId}`);

    return { accessToken, igUserId, expiresAt };
  }

  /** Get basic profile info */
  async getMe(accessToken: string): Promise<IGUser> {
    const res = await fetch(
      `${GRAPH_URL}/me?fields=id,username,name,profile_picture_url,biography,followers_count,media_count&access_token=${accessToken}`
    );
    if (!res.ok) throw new Error(`Instagram getMe error: ${await res.text()}`);
    return res.json();
  }

  /** Get recent media posts */
  async getMedia(accessToken: string, igUserId: string, limit = 12): Promise<IGMedia[]> {
    const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink';
    const res = await fetch(
      `${GRAPH_URL}/${igUserId}/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`
    );
    if (!res.ok) throw new Error(`Instagram getMedia error: ${await res.text()}`);
    const data = await res.json();
    return data.data ?? [];
  }

  /** Get DM conversations (requires instagram_manage_messages scope) */
  async getConversations(accessToken: string, igUserId: string): Promise<IGConversation[]> {
    const res = await fetch(
      `${GRAPH_URL}/${igUserId}/conversations?platform=instagram&fields=id,updated_time,participants&access_token=${accessToken}`
    );
    if (!res.ok) throw new Error(`Instagram getConversations error: ${await res.text()}`);
    const data = await res.json();
    return data.data ?? [];
  }

  /** Get messages in a conversation */
  async getMessages(accessToken: string, conversationId: string, limit = 20): Promise<IGMessage[]> {
    const res = await fetch(
      `${GRAPH_URL}/${conversationId}/messages?fields=id,message,from,created_time&limit=${limit}&access_token=${accessToken}`
    );
    if (!res.ok) throw new Error(`Instagram getMessages error: ${await res.text()}`);
    const data = await res.json();
    return data.data ?? [];
  }

  /** Send a DM reply */
  async sendMessage(accessToken: string, igUserId: string, recipientId: string, text: string): Promise<{ message_id: string }> {
    const res = await fetch(`${GRAPH_URL}/${igUserId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });
    if (!res.ok) throw new Error(`Instagram sendMessage error: ${await res.text()}`);
    return res.json();
  }

  /** Publish a prepared media post */
  async publishPost(accessToken: string, igUserId: string, imageUrl: string, caption: string): Promise<{ id: string }> {
    // Step 1: Create media container
    const createRes = await fetch(`${GRAPH_URL}/${igUserId}/media?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, caption }),
    });
    if (!createRes.ok) throw new Error(`Instagram createMedia error: ${await createRes.text()}`);
    const { id: creationId } = await createRes.json();

    // Step 2: Wait for container to be ready (poll up to 30s)
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 10; i++) {
      await sleep(3000);
      const statusRes = await fetch(
        `${GRAPH_URL}/${creationId}?fields=status_code&access_token=${accessToken}`
      );
      if (statusRes.ok) {
        const { status_code } = await statusRes.json() as { status_code: string };
        console.log(`[Instagram] Media container status: ${status_code}`);
        if (status_code === 'FINISHED') break;
        if (status_code === 'ERROR') throw new Error('Instagram media container processing failed');
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(`${GRAPH_URL}/${igUserId}/media_publish?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId }),
    });
    if (!publishRes.ok) throw new Error(`Instagram publishMedia error: ${await publishRes.text()}`);
    return publishRes.json();
  }

  isConfigured(): boolean {
    return !!(APP_ID && APP_SECRET && REDIRECT_URI);
  }
}
