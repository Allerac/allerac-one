import nodemailer from 'nodemailer';
import type { EmailAccount } from './imap.service';

export interface SendEmailParams {
  account: EmailAccount;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}

export class SmtpService {
  async send(params: SendEmailParams): Promise<void> {
    const { account, to, subject, body, replyTo, inReplyTo, references } = params;

    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_secure,
      auth: { user: account.username, pass: account.password },
      tls: { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from: `${account.label} <${account.email_address}>`,
      to,
      subject,
      text: body,
      ...(replyTo ? { replyTo } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references ? { references } : {}),
    });
  }

  async testConnection(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
    const transporter = nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port,
      secure: account.smtp_secure,
      auth: { user: account.username, pass: account.password },
      tls: { rejectUnauthorized: false },
    });
    try {
      await transporter.verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }
}
