import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';
import { SmtpService } from '@/app/services/email/smtp.service';
import { loadAccountForUser } from '@/app/actions/email';

const authService = new AuthService();
const smtp = new SmtpService();

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { accountId, to, subject, body, inReplyTo, references } = await req.json();
  if (!accountId || !to || !subject || !body) {
    return NextResponse.json({ error: 'accountId, to, subject, body required' }, { status: 400 });
  }

  try {
    const account = await loadAccountForUser(accountId, user.id);
    await smtp.send({ account, to, subject, body, inReplyTo, references });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
