import { z } from 'zod';
import { inboxService } from '@/federation/inbox.instance';
import { inboxData, inboxErrorResponse, readBody, requireInboxUser } from '../_lib/guard';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  peerId: z.string().uuid(),
  agent: z.string().min(1).max(100),
  // P4b: `new: true` creates an additional thread instead of returning the default one.
  new: z.boolean().optional(),
  title: z.string().max(200).nullable().optional(),
});

/** Opens (or returns) the default thread with a remote agent, or creates a new one. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireInboxUser(request);
    const parsed = bodySchema.safeParse(await readBody(request));
    if (!parsed.success) {
      return Response.json({ error: { code: 'validation_error', message: 'peerId and agent are required' } }, { status: 400 });
    }
    const thread = await inboxService.openThread(user, parsed.data.peerId, parsed.data.agent, {
      newThread: parsed.data.new === true, title: parsed.data.title ?? null,
    });
    return inboxData({ thread: { id: thread.id, title: thread.title } }, 201);
  } catch (error) {
    return inboxErrorResponse('POST /api/inbox/threads failed', error);
  }
}
