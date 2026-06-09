/**
 * /api/instagram/publish — Publish post with public image URL
 */

import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';
import { InstagramTool } from '@/app/tools/instagram.tool';

const igTool = new InstagramTool();

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

  let body: { caption?: string; image_url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { caption, image_url } = body;
  let imageUrl: URL;
  try {
    imageUrl = new URL(image_url ?? '');
  } catch {
    return Response.json({ error: 'Invalid image_url' }, { status: 400 });
  }
  if (
    typeof caption !== 'string'
    || !caption.trim()
    || caption.length > 2_200
    || imageUrl.protocol !== 'https:'
  ) {
    return Response.json({ error: 'Invalid caption or image_url' }, { status: 400 });
  }

  try {
    const result = await igTool.publishPost(user.id, caption, imageUrl.toString());
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
