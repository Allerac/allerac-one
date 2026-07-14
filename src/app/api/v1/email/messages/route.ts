import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';
import { ImapService } from '@/app/services/email/imap.service';

const querySchema = z.object({
  accountId: z.string().trim().min(1),
  sinceUid: z.coerce.number().int().positive().optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('email:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid email messages query', 400, parsed.error.flatten());
    }

    const account = await loadEmailAccountForUser(parsed.data.accountId, user.id);
    const messages = await new ImapService().listMessages(account, 30, parsed.data.sinceUid);
    return apiData({ messages });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof EmailAccountNotFoundError) {
      return apiError('not_found', 'Email account not found', 404);
    }
    return apiInternalError('GET /api/v1/email/messages failed', error);
  }
}
