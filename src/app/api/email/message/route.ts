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
    const uid = Number(params.get('uid'));
    if (!accountId || !uid) return NextResponse.json({ error: 'accountId and uid required' }, { status: 400 });

    const account = await loadEmailAccountForUser(accountId, user.id);
    const message = await imap.getMessage(account, uid);
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    return NextResponse.json({ message });
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
