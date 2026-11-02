import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../../../_lib/guard';

export const dynamic = 'force-dynamic';

/** "New topic" (phase 5): adds a divider; the next ask restarts the remote agent's context. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    return inboxData(await inboxService.newTopic(user, id));
  } catch (error) {
    return inboxErrorResponse('POST /api/inbox/threads/:id/topic failed', error);
  }
}
