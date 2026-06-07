import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';

export interface EmailAccount {
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
  password: string;
}

export interface EmailSummary {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  fromName: string;
  date: string;
  snippet: string;
  seen: boolean;
}

export interface EmailDetail extends EmailSummary {
  to: string;
  cc: string;
  bodyText: string;
  bodyHtml: string;
}

export class ImapService {
  private buildClient(account: EmailAccount): ImapFlow {
    return new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      auth: { user: account.username, pass: account.password },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async listMessages(account: EmailAccount, limit = 30, sinceUid?: number): Promise<EmailSummary[]> {
    const client = this.buildClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages: EmailSummary[] = [];

        if (sinceUid !== undefined) {
          // Incremental: only UIDs newer than sinceUid
          try {
            for await (const msg of client.fetch(`${sinceUid + 1}:*`, {
              uid: true, flags: true, envelope: true, bodyStructure: true,
            }, { uid: true })) {
              const env = msg.envelope;
              const fromAddr = env?.from?.[0];
              messages.push({
                uid: msg.uid,
                messageId: env?.messageId ?? String(msg.uid),
                subject: env?.subject ?? '(no subject)',
                from: fromAddr?.address ?? '',
                fromName: fromAddr?.name || fromAddr?.address || '',
                date: env?.date?.toISOString() ?? '',
                snippet: '',
                seen: msg.flags?.has('\\Seen') ?? false,
              });
            }
          } catch { /* empty range = no new messages */ }

          for (const summary of messages.slice(0, 5)) {
            try {
              const raw = await client.download(String(summary.uid), undefined, { uid: true });
              if (raw?.content) {
                const parsed = await simpleParser(raw.content);
                summary.snippet = (parsed.text ?? '').slice(0, 120).replace(/\s+/g, ' ').trim();
              }
            } catch { /* skip */ }
          }

          return messages.reverse();
        }

        // Full fetch: last N messages by sequence
        const mailbox = client.mailbox as { exists: number } | false | undefined;
        const count = mailbox ? (mailbox as { exists: number }).exists : 0;
        if (count === 0) return [];

        const from = Math.max(1, count - limit + 1);

        for await (const msg of client.fetch(`${from}:*`, {
          uid: true, flags: true, envelope: true, bodyStructure: true,
        })) {
          const env = msg.envelope;
          const fromAddr = env?.from?.[0];
          messages.push({
            uid: msg.uid,
            messageId: env?.messageId ?? String(msg.uid),
            subject: env?.subject ?? '(no subject)',
            from: fromAddr?.address ?? '',
            fromName: fromAddr?.name || fromAddr?.address || '',
            date: env?.date?.toISOString() ?? '',
            snippet: '',
            seen: msg.flags?.has('\\Seen') ?? false,
          });
        }

        const recent = messages.slice(-10).reverse();
        for (const summary of recent) {
          try {
            const raw = await client.download(String(summary.uid), undefined, { uid: true });
            if (raw?.content) {
              const parsed = await simpleParser(raw.content);
              summary.snippet = (parsed.text ?? '').slice(0, 120).replace(/\s+/g, ' ').trim();
            }
          } catch { /* skip */ }
        }

        return messages.reverse();
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async getMessage(account: EmailAccount, uid: number): Promise<EmailDetail | null> {
    const client = this.buildClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const raw = await client.download(String(uid), undefined, { uid: true });
        if (!raw?.content) return null;

        const parsed: ParsedMail = await simpleParser(raw.content);

        // Mark as read
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });

        const fromAddr = parsed.from?.value?.[0];
        const toAddrs = parsed.to ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to]) : [];
        const ccAddrs = parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) : [];

        return {
          uid,
          messageId: parsed.messageId ?? String(uid),
          subject: parsed.subject ?? '(no subject)',
          from: fromAddr?.address ?? '',
          fromName: fromAddr?.name || fromAddr?.address || '',
          date: parsed.date?.toISOString() ?? '',
          snippet: (parsed.text ?? '').slice(0, 120).replace(/\s+/g, ' ').trim(),
          seen: true,
          to: toAddrs.flatMap(a => a.value).map(v => v.address).filter(Boolean).join(', '),
          cc: ccAddrs.flatMap(a => a.value).map(v => v.address).filter(Boolean).join(', '),
          bodyText: parsed.text ?? '',
          bodyHtml: parsed.html || parsed.textAsHtml || parsed.text || '',
        };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async deleteMessage(account: EmailAccount, uid: number): Promise<void> {
    const client = this.buildClient(account);
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const trashFolders = ['[Gmail]/Trash', 'Deleted Items', 'Deleted Messages', 'Trash'];
        let moved = false;
        for (const folder of trashFolders) {
          try {
            await client.messageMove(String(uid), folder, { uid: true });
            moved = true;
            break;
          } catch { /* try next */ }
        }
        if (!moved) {
          await client.messageFlagsAdd(String(uid), ['\\Deleted'], { uid: true });
          await client.messageDelete(String(uid), { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout();
    }
  }

  async testConnection(account: EmailAccount): Promise<{ ok: boolean; error?: string }> {
    const client = this.buildClient(account);
    try {
      await client.connect();
      await client.logout();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }
}
