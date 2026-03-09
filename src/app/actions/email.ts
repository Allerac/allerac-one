'use server';

import { sendEmail } from '@/app/services/email/email.service';
import { welcomeEmail } from '@/app/services/email/templates';

export async function sendWelcomeEmail(
  name: string,
  toEmail: string,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.allerac.ai';

  return sendEmail({
    to: toEmail,
    subject: 'Welcome to Allerac One — Your Access is Ready',
    html: welcomeEmail({ name, appUrl, apiKey }),
  });
}
