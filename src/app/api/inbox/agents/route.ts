import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../_lib/guard';

export const dynamic = 'force-dynamic';

/** Local agents plus each paired Unit's exposed agents, grouped by Unit. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    return inboxData(await inboxService.list(user));
  } catch (error) {
    return inboxErrorResponse('GET /api/inbox/agents failed', error);
  }
}
