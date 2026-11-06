import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, readBody, requireInboxUser } from '../../_lib/guard';

export const dynamic = 'force-dynamic';

/** Thread with its latest messages (marks the thread as read). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    return inboxData(await inboxService.getThread(user, id));
  } catch (error) {
    return inboxErrorResponse('GET /api/inbox/threads/:id failed', error);
  }
}

/** Renames a thread (paired units only). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    const body = await readBody(request);
    return inboxData({ thread: await inboxService.renameThread(user, id, body.title) });
  } catch (error) {
    return inboxErrorResponse('PATCH /api/inbox/threads/:id failed', error);
  }
}

/** Deletes one archived thread's local history (the peer keeps its own copy). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    await inboxService.deleteThread(user, id);
    return inboxData({ deleted: true });
  } catch (error) {
    return inboxErrorResponse('DELETE /api/inbox/threads/:id failed', error);
  }
}
