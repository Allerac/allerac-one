import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { ImapService } from '@/app/services/email/imap.service';
import { loadAccountForUser } from '@/app/actions/email';

const authService = new AuthService();
const imap = new ImapService();

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = new URL(req.url).searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  try {
    const account = await loadAccountForUser(accountId, user.id);
    const messages = await imap.listMessages(account, 30);
    return NextResponse.json({ messages });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
