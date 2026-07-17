import { z } from 'zod';
import { requireApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';
import { SmtpService } from '@/app/services/email/smtp.service';

const sendSchema = z.object({
  accountId: z.string().trim().min(1),
  to: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  inReplyTo: z.string().trim().optional(),
  references: z.string().trim().optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('email:write', request);
    const parsed = sendSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid email send payload', 400, parsed.error.flatten());
    }

    const account = await loadEmailAccountForUser(parsed.data.accountId, user.id);
    await new SmtpService().send({
      account,
      to: parsed.data.to,
      subject: parsed.data.subject,
      body: parsed.data.body,
      inReplyTo: parsed.data.inReplyTo,
      references: parsed.data.references,
    });
    return apiData({ sent: true });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    if (error instanceof EmailAccountNotFoundError) {
      return apiError('not_found', 'Email account not found', 404);
    }
    return apiInternalError('POST /api/v1/email/send failed', error);
  }
}
