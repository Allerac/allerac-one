/**
 * /api/domains/skill-chat/improvements — Cross-skill applied-changes feed
 *
 * GET — every skill-chat change this admin has actually applied, across all
 * skills/domains, newest first. Lets an improvement made to one skill (e.g.
 * "refuse programming requests") be spotted and replicated on others.
 */

import {
  authenticationErrorResponse,
  requireCurrentAdmin,
} from '@/app/lib/auth-session';
import { skillChatHistoryService } from '@/app/services/skills/skill-chat-history.service';

export async function GET() {
  let user;
  try {
    user = await requireCurrentAdmin();
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }

  const improvements = await skillChatHistoryService.getAppliedImprovements(user.id);
  return Response.json({ improvements });
}
