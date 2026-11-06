import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, readBody, requireInboxUser } from '../../../_lib/guard';

export const dynamic = 'force-dynamic';
// The peer ask waits up to 60s (P4a is synchronous); leave headroom for local writes.
export const maxDuration = 75;

/** Older messages: `?before=<message id>&limit=50`, oldest first, with `nextCursor`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const limit = search.get('limit');
    return inboxData(await inboxService.listMessages(user, id, search.get('before'), limit ? Number(limit) : undefined));
  } catch (error) {
    return inboxErrorResponse('GET /api/inbox/threads/:id/messages failed', error);
  }
}

/** Sends a message to the remote agent and waits for its reply. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const { id } = await params;
    const body = await readBody(request);
    const content = typeof body.content === 'string' ? body.content : '';
    return inboxData(await inboxService.send(user, id, content));
  } catch (error) {
    return inboxErrorResponse('POST /api/inbox/threads/:id/messages failed', error);
  }
}
