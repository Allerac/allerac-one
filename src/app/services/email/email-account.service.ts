import pool from '@/app/clients/db';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';
import type { EmailAccount } from '@/app/services/email/imap.service';

export class EmailAccountNotFoundError extends Error {
  constructor() {
    super('Email account not found');
    this.name = 'EmailAccountNotFoundError';
  }
}

export async function loadEmailAccountForUser(
  accountId: string,
  userId: string
): Promise<EmailAccount> {
  const result = await pool.query(
    `SELECT id, label, email_address, imap_host, imap_port, imap_secure,
            smtp_host, smtp_port, smtp_secure, username, password_encrypted
     FROM user_email_accounts
     WHERE id = $1 AND user_id = $2`,
    [accountId, userId]
  );
  const row = result.rows[0];
  if (!row) throw new EmailAccountNotFoundError();

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
