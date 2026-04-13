/**
 * /api/instagram/publish — Publish post with public image URL
 */

import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { InstagramTool } from '@/app/tools/instagram.tool';

const authService = new AuthService();
const igTool = new InstagramTool();

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session_token')?.value;
  if (!sessionToken) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const user = await authService.validateSession(sessionToken);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { caption, image_url } = await request.json();
  if (!caption || !image_url) {
    return new Response(JSON.stringify({ error: 'caption and image_url required' }), { status: 400 });
  }

  try {
    const result = await igTool.publishPost(user.id, caption, image_url);
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
