# Domain: Email

**Slug:** `email`  
**Route:** `/email`  
**Icon:** ✉️  
**Status:** Active  
**Default Skill:** None (uses domain default)

## Purpose

AI-powered email assistant. Users connect their email accounts (Gmail, Outlook, or any IMAP/SMTP server) and the AI helps read, draft, and send emails. Supports multiple accounts per user.

## Key Files

| Layer | Path |
|-------|------|
| Page (server) | `src/app/email/page.tsx` |
| Client layout | `src/app/email/EmailClient.tsx` |
| Email service | `src/app/services/email/email.service.ts` |
| IMAP service | `src/app/services/email/imap.service.ts` |
| SMTP service | `src/app/services/email/smtp.service.ts` |
| Templates | `src/app/services/email/templates.ts` |
| Migration | `src/database/migrations/049_user_email_accounts.sql` |
| Domain migration | `src/database/migrations/050_domain_email.sql` |

## External Integrations

- **IMAP** — read emails from Gmail, Outlook, custom servers
- **SMTP** — send emails
- Credentials stored encrypted in `user_email_accounts`

## DB Tables

| Table | Purpose |
|-------|---------|
| `user_email_accounts` | IMAP/SMTP credentials per user (encrypted) |

## Notes

- Supports multi-account: each user can connect more than one inbox.
- Credentials (host, port, username, password) are encrypted at rest using the same encryption service as other secrets.
