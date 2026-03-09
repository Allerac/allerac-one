const RESEND_API_URL = 'https://api.resend.com/emails';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  from = `Allerac One <${process.env.FROM_EMAIL ?? 'noreply@allerac.ai'}>`,
}: SendEmailOptions): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Resend error ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
