import { NextRequest, NextResponse } from 'next/server';
import { authenticationErrorResponse, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ImapService } from '@/app/services/email/imap.service';
import {
  EmailAccountNotFoundError,
  loadEmailAccountForUser,
} from '@/app/services/email/email-account.service';

const imap = new ImapService();

export async function GET(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    const params = new URL(req.url).searchParams;
    const accountId = params.get('accountId');
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });
    const sinceUid = params.get('sinceUid');

    const account = await loadEmailAccountForUser(accountId, user.id);
    const messages = await imap.listMessages(account, 30, sinceUid ? parseInt(sinceUid, 10) : undefined);
    return NextResponse.json({ messages });
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
