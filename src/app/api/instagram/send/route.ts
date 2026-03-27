/**
 * /api/instagram/send — Send an approved DM reply
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { InstagramCredentialsService } from '@/app/services/instagram/instagram-credentials.service';
import { InstagramGraphService } from '@/app/services/instagram/instagram-graph.service';

const authService      = new AuthService();
const credService      = new InstagramCredentialsService();
const instagramService = new InstagramGraphService();

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { recipientId, text } = await request.json() as { recipientId: string; text: string };
  if (!recipientId || !text?.trim()) {
    return new Response(JSON.stringify({ error: 'recipientId and text required' }), { status: 400 });
  }

  const status = await credService.getStatus(user.id);
  if (!status.is_connected || !status.ig_user_id) {
    return new Response(JSON.stringify({ error: 'Instagram not connected' }), { status: 400 });
  }

  const accessToken = await credService.getAccessToken(user.id);
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
