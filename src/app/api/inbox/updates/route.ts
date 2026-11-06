import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../_lib/guard';

export const dynamic = 'force-dynamic';

/** Unread counts and pending replies per thread (P4c); also polls this user's due replies. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    return inboxData(await inboxService.updates(user));
  } catch (error) {
    return inboxErrorResponse('GET /api/inbox/updates failed', error);
  }
}
