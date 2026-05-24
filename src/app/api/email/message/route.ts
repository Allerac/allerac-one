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

  const params = new URL(req.url).searchParams;
  const accountId = params.get('accountId');
  const uid = Number(params.get('uid'));
  if (!accountId || !uid) return NextResponse.json({ error: 'accountId and uid required' }, { status: 400 });

  try {
    const account = await loadAccountForUser(accountId, user.id);
    const message = await imap.getMessage(account, uid);
    if (!message) return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    return NextResponse.json({ message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
