'use server';

import { sendEmail } from '@/app/services/email/email.service';
import { welcomeEmail } from '@/app/services/email/templates';
import pool from '@/app/clients/db';
import { getCurrentUser } from '@/app/actions/auth';
import { redirect } from 'next/navigation';
import { encrypt, safeDecrypt } from '@/app/services/crypto/encryption.service';
import { ImapService } from '@/app/services/email/imap.service';
import { SmtpService } from '@/app/services/email/smtp.service';
import type { EmailAccount } from '@/app/services/email/imap.service';

async function assertUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export interface EmailAccountRow {
  id: string;
  label: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  username: string;
}

export interface CreateEmailAccountInput {
  label: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  username: string;
  password: string;
}

export async function loadAccountForUser(accountId: string, userId: string): Promise<EmailAccount> {
  const result = await pool.query(
    `SELECT * FROM user_email_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Account not found');
  return {
    id: row.id,
    label: row.label,
    email_address: row.email_address,
    imap_host: row.imap_host,
    imap_port: row.imap_port,
    imap_secure: row.imap_secure,
    smtp_host: row.smtp_host,
    smtp_port: row.smtp_port,
    smtp_secure: row.smtp_secure,
    username: row.username,
    password: safeDecrypt(row.password_encrypted) ?? '',
  };
}

export async function listEmailAccounts(): Promise<EmailAccountRow[]> {
  const user = await assertUser();
  const result = await pool.query(
    `SELECT id, label, email_address, imap_host, imap_port, imap_secure,
            smtp_host, smtp_port, smtp_secure, username
     FROM user_email_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
    [user.id]
  );
  return result.rows;
}

function formatConnectionError(protocol: string, raw?: string): string {
  const msg = (raw ?? '').toLowerCase();
  if (msg.includes('auth') || msg.includes('credential') || msg.includes('invalid') || msg.includes('535') || msg.includes('534')) {
    return `${protocol} authentication failed. Make sure you're using an App Password — your regular password won't work. Check the setup guide in the modal.`;
  }
  if (msg.includes('econnrefused') || msg.includes('connect')) {
    return `${protocol} connection refused. Check the server host and port.`;
  }
  if (msg.includes('timeout') || msg.includes('etimedout')) {
    return `${protocol} connection timed out. Check the server host and your network.`;
  }
  if (msg.includes('certificate') || msg.includes('tls') || msg.includes('ssl')) {
    return `${protocol} TLS/SSL error. Try toggling the SSL option.`;
  }
  return `${protocol} connection failed${raw ? `: ${raw}` : '.'}`;
}

export async function createEmailAccount(input: CreateEmailAccountInput): Promise<{ id: string } | { error: string }> {
  const user = await assertUser();
  const imap = new ImapService();
  const smtp = new SmtpService();

  const account: EmailAccount = {
    id: '',
    label: input.label,
    email_address: input.email_address,
    imap_host: input.imap_host,
    imap_port: input.imap_port,
    imap_secure: input.imap_secure,
    smtp_host: input.smtp_host,
    smtp_port: input.smtp_port,
    smtp_secure: input.smtp_secure,
    username: input.username,
    password: input.password,
  };

  const [imapResult, smtpResult] = await Promise.all([
    imap.testConnection(account),
    smtp.testConnection(account),
  ]);

  if (!imapResult.ok) return { error: formatConnectionError('IMAP', imapResult.error) };
  if (!smtpResult.ok) return { error: formatConnectionError('SMTP', smtpResult.error) };

  const encrypted = encrypt(input.password);
  const result = await pool.query(
    `INSERT INTO user_email_accounts
       (user_id, label, email_address, imap_host, imap_port, imap_secure,
        smtp_host, smtp_port, smtp_secure, username, password_encrypted)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [user.id, input.label, input.email_address, input.imap_host, input.imap_port,
     input.imap_secure, input.smtp_host, input.smtp_port, input.smtp_secure,
     input.username, encrypted]
  );
  return { id: result.rows[0].id };
}

export async function deleteEmailAccount(accountId: string): Promise<void> {
  const user = await assertUser();
  await pool.query(
    `DELETE FROM user_email_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, user.id]
  );
}

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
