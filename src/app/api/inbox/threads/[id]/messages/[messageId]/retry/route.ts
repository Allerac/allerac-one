import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, requireInboxUser } from '../../../../../_lib/guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 75;

/** Retries a failed or timed-out message. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id, messageId } = await params;
    return inboxData(await inboxService.retry(user, id, messageId));
  } catch (error) {
    return inboxErrorResponse('POST /api/inbox/threads/:id/messages/:messageId/retry failed', error);
  }
}
