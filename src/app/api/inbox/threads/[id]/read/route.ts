import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../../../_lib/guard';

export const dynamic = 'force-dynamic';

/** Marks a thread read, e.g. when a late reply appears in the open panel (P4c). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    await inboxService.markThreadRead(user, id);
    return inboxData({ read: true });
  } catch (error) {
    return inboxErrorResponse('POST /api/inbox/threads/:id/read failed', error);
  }
}
