import { NextRequest, NextResponse } from 'next/server';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { SmtpService } from '@/app/services/email/smtp.service';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';

const smtp = new SmtpService();

export async function POST(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const { accountId, to, subject, body, inReplyTo, references } = await req.json();
    if (!accountId || !to || !subject || !body) {
      return NextResponse.json({ error: 'accountId, to, subject, body required' }, { status: 400 });
    }

    const account = await loadEmailAccountForUser(accountId, user.id);
    await smtp.send({ account, to, subject, body, inReplyTo, references });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const authError = authenticationErrorResponse(err);
    if (authError) return authError;
    if (err instanceof EmailAccountNotFoundError) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
