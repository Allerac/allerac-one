/**
 * /api/instagram/conversations — List DM threads + messages
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';

const authService      = new AuthService();
const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const status = await credService.getStatus(user.id);
  if (!status.is_connected || !status.ig_user_id) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 400 });
  }

  const accessToken = await credService.getAccessToken(user.id);
  if (!accessToken) return new Response(JSON.stringify({ error: 'No access token' }), { status: 400 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  try {
    if (conversationId) {
      // Get messages for a specific conversation
      const messages = await instagramService.getMessages(accessToken, conversationId);
      return new Response(JSON.stringify({ messages }), { headers: { 'Content-Type': 'application/json' } });
    } else {
      // List all conversations
      const conversations = await instagramService.getConversations(accessToken, status.ig_user_id);
      return new Response(JSON.stringify({ conversations, igUserId: status.ig_user_id, username: status.username }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
