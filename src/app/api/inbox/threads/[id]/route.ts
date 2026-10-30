import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../../_lib/guard';

export const dynamic = 'force-dynamic';

/** Thread messages (marks the thread as read). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    return inboxData(await inboxService.getThread(user, id));
  } catch (error) {
    return inboxErrorResponse('GET /api/inbox/threads/:id failed', error);
  }
}
