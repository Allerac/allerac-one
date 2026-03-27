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

const APP_ID       = process.env.INSTAGRAM_APP_ID       ?? '';
const APP_SECRET   = process.env.INSTAGRAM_APP_SECRET   ?? '';
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI ?? '';
// Facebook Login for Business — grants access to Instagram Graph API
// Docs: https://developers.facebook.com/docs/facebook-login/guides/advanced/business-login
const GRAPH_URL    = 'https://graph.facebook.com/v21.0';
const FB_AUTH_URL  = 'https://www.facebook.com/v21.0/dialog/oauth';
const FB_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';

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
    // Facebook Login for Business — scopes for Instagram Graph API access
    const params = new URLSearchParams({
      client_id:     APP_ID,
      redirect_uri:  REDIRECT_URI,
      scope:         'instagram_basic,instagram_manage_messages,instagram_content_publish,pages_show_list,pages_read_engagement',
      response_type: 'code',
      state,
    });
    return `${FB_AUTH_URL}?${params.toString()}`;
  }

  /** Exchange authorization code for a user access token, then find the linked IG Business account */
  async exchangeCodeForToken(code: string): Promise<{ accessToken: string; igUserId: string; expiresAt: Date | null }> {
    // Step 1: exchange code for short-lived user access token
    const tokenRes = await fetch(FB_TOKEN_URL, {
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

    // Step 2: exchange for long-lived user token (60 days)
    const longRes = await fetch(
      `${FB_TOKEN_URL}?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${userAccessToken}`
    );
    const longToken = longRes.ok ? (await longRes.json() as IGTokenResponse & { expires_in?: number }) : tokenData;
    const accessToken = longToken.access_token ?? userAccessToken;
    const expiresAt = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000) : null;

    // Step 3: find the Instagram Business Account linked to a Facebook Page
    const pagesRes = await fetch(`${GRAPH_URL}/me/accounts?access_token=${accessToken}`);
    if (!pagesRes.ok) throw new Error(`Could not fetch pages: ${await pagesRes.text()}`);
    const pages = await pagesRes.json() as { data: Array<{ id: string; access_token: string }> };

    for (const page of pages.data ?? []) {
      const igRes = await fetch(
        `${GRAPH_URL}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      );
      if (!igRes.ok) continue;
      const pageData = await igRes.json() as { instagram_business_account?: { id: string } };
      if (pageData.instagram_business_account?.id) {
        return { accessToken, igUserId: pageData.instagram_business_account.id, expiresAt };
      }
    }

    throw new Error('Nenhuma conta Instagram Business encontrada. Certifica-te que o teu Instagram é Business/Creator e está ligado a uma Facebook Page.');
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
    const createRes = await fetch(`${GRAPH_URL}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ image_url: imageUrl, caption }),
    });
    if (!createRes.ok) throw new Error(`Instagram createMedia error: ${await createRes.text()}`);
    const { id: creationId } = await createRes.json();

    // Step 2: Publish
    const publishRes = await fetch(`${GRAPH_URL}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ creation_id: creationId }),
    });
    if (!publishRes.ok) throw new Error(`Instagram publishMedia error: ${await publishRes.text()}`);
    return publishRes.json();
  }

  isConfigured(): boolean {
    return !!(APP_ID && APP_SECRET && REDIRECT_URI);
  }
}
