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
  uid: z.coerce.number().int().positive(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('email:read', request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid email message query', 400, parsed.error.flatten());
    }

    const account = await loadEmailAccountForUser(parsed.data.accountId, user.id);
    const message = await new ImapService().getMessage(account, parsed.data.uid);
    if (!message) {
      return apiError('not_found', 'Email message not found', 404);
    }
    return apiData({ message });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof EmailAccountNotFoundError) {
      return apiError('not_found', 'Email account not found', 404);
    }
    return apiInternalError('GET /api/v1/email/message failed', error);
  }
}
