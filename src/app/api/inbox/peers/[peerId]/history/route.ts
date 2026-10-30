import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../../../_lib/guard';

export const dynamic = 'force-dynamic';

/** Deletes local history with a Unit that is no longer paired. */
export async function DELETE(request: Request, { params }: { params: Promise<{ peerId: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { peerId } = await params;
    return inboxData({ deleted: await inboxService.deleteArchivedHistory(user, peerId) });
  } catch (error) {
    return inboxErrorResponse('DELETE /api/inbox/peers/:peerId/history failed', error);
  }
}
