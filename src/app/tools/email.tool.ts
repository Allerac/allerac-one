export { EMAIL_TOOL_DEFINITIONS } from './email.tool.definitions';

import pool from '@/app/clients/db';
import { ImapService } from '@/app/services/email/imap.service';
import { SmtpService } from '@/app/services/email/smtp.service';
import { safeDecrypt } from '@/app/services/crypto/encryption.service';
import type { EmailAccount } from '@/app/services/email/imap.service';

const imap = new ImapService();
const smtp = new SmtpService();

async function loadAccounts(userId: string): Promise<EmailAccount[]> {
  const res = await pool.query(
    `SELECT id, label, email_address, imap_host, imap_port, imap_secure,
            smtp_host, smtp_port, smtp_secure, username, password_encrypted
     FROM user_email_accounts WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id,
    label: r.label,
    email_address: r.email_address,
    imap_host: r.imap_host,
    imap_port: r.imap_port,
    imap_secure: r.imap_secure,
    smtp_host: r.smtp_host,
    smtp_port: r.smtp_port,
    smtp_secure: r.smtp_secure,
    username: r.username,
    password: safeDecrypt(r.password_encrypted) ?? '',
  }));
}

async function pickAccount(userId: string, accountId?: string): Promise<EmailAccount | null> {
  const accounts = await loadAccounts(userId);
  if (accounts.length === 0) return null;
  if (accountId) return accounts.find(a => a.id === accountId) ?? accounts[0];
  return accounts[0];
}

export function buildEmailTools(userId: string) {
  return {
    list_emails: async (args: { account_id?: string; limit?: number; unread_only?: boolean }) => {
      const accounts = await loadAccounts(userId);
      if (accounts.length === 0) return { error: 'No email accounts configured. Ask the user to add one in the Email domain settings.' };

      const target = args.account_id ? accounts.find(a => a.id === args.account_id) ?? accounts[0] : accounts[0];
      const messages = await imap.listMessages(target, args.limit ?? 20);
      const filtered = args.unread_only ? messages.filter(m => !m.seen) : messages;

      return {
        account: { id: target.id, label: target.label, email: target.email_address },
        total: filtered.length,
        messages: filtered.map(m => ({
          uid: m.uid,
          account_id: target.id,
          subject: m.subject,
          from: m.fromName || m.from,
          from_address: m.from,
          date: m.date,
          snippet: m.snippet,
          unread: !m.seen,
        })),
      };
    },

    read_email: async (args: { uid: number; account_id?: string }) => {
      const account = await pickAccount(userId, args.account_id);
      if (!account) return { error: 'No email accounts configured.' };

      const msg = await imap.getMessage(account, args.uid);
      if (!msg) return { error: `Email UID ${args.uid} not found.` };

      return {
        uid: msg.uid,
        account_id: account.id,
        subject: msg.subject,
        from: msg.fromName || msg.from,
        from_address: msg.from,
        to: msg.to,
        cc: msg.cc,
        date: msg.date,
        message_id: msg.messageId,
        body: msg.bodyText || msg.bodyHtml,
      };
    },

    send_email: async (args: { to: string; subject: string; body: string; account_id?: string; in_reply_to?: string; references?: string }) => {
      const account = await pickAccount(userId, args.account_id);
      if (!account) return { error: 'No email accounts configured.' };

      await smtp.send({
        account,
        to: args.to,
        subject: args.subject,
        body: args.body,
        inReplyTo: args.in_reply_to,
        references: args.references,
      });

      return { success: true, from: account.email_address, to: args.to, subject: args.subject };
    },
  };
}
