/**
 * /api/instagram/conversations — List DM threads + messages
 */

import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';

const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

export async function GET(request: Request) {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'social');
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  const credentialsUserId = await credService.resolveCredentialsUserId(user.id);
  const status = await credService.getStatus(credentialsUserId);
  if (!status.is_connected || !status.ig_user_id) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 400 });
  }

  const accessToken = await credService.getAccessToken(credentialsUserId);
  if (!accessToken) return new Response(JSON.stringify({ error: 'No access token' }), { status: 400 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');
  if (conversationId && (conversationId.length > 200 || !/^[a-zA-Z0-9._:-]+$/.test(conversationId))) {
    return Response.json({ error: 'Invalid conversationId' }, { status: 400 });
  }

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
