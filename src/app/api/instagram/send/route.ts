/**
 * /api/instagram/send — Send an approved DM reply
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

export async function POST(request: Request) {
  let user;
  try {
    user = await requireCurrentUser();
    await assertDomainAccess(user, 'social');
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  let body: { recipientId?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { recipientId, text } = body;
  if (
    !recipientId
    || !/^\d{1,40}$/.test(recipientId)
    || !text?.trim()
    || text.length > 1_000
  ) {
    return Response.json({ error: 'Invalid recipientId or text' }, { status: 400 });
  }

  const credentialsUserId = await credService.resolveCredentialsUserId(user.id);
  const status = await credService.getStatus(credentialsUserId);
  if (!status.is_connected || !status.ig_user_id) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 400 });
  }

  const accessToken = await credService.getAccessToken(credentialsUserId);
  if (!accessToken) return new Response(JSON.stringify({ error: 'No access token' }), { status: 400 });

  try {
    const result = await instagramService.sendMessage(accessToken, status.ig_user_id, recipientId, text);
    console.log(`[Instagram] Sent DM to ${recipientId}: "${text.slice(0, 50)}..."`);
    return new Response(JSON.stringify({ ok: true, message_id: result.message_id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
