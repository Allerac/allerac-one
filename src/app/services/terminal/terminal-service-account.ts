import pool from '@/app/clients/db';
import { apiKeyService } from '@/app/services/api-keys/api-key.service';
import { TERMINAL_PROVIDERS } from '@/app/terminal/providers';
import { terminalApiKeyName, terminalScopeDomains } from './terminal-api-policy';

/**
 * The Unit's terminal service account: the identity of the allerac_unit MCP
 * tools in the shared terminal sessions. No password (password login fails),
 * no sessions (validateSession rejects it), not admin, hidden from user
 * management. The reserved .invalid TLD cannot belong to a real mailbox.
 */
export const TERMINAL_SERVICE_ACCOUNT_EMAIL = 'terminal@service.allerac.invalid';

export async function findTerminalServiceAccount(): Promise<string | null> {
  const result = await pool.query('SELECT id, is_service_account FROM users WHERE email = $1', [TERMINAL_SERVICE_ACCOUNT_EMAIL]);
  const row = result.rows[0];
  if (!row) return null;
  if (!row.is_service_account) throw new Error('The terminal service account email belongs to a regular user');
  return row.id;
}

export async function ensureTerminalServiceAccount(): Promise<string> {
  const existing = await findTerminalServiceAccount();
  if (existing) return existing;
  await pool.query(
    `INSERT INTO users (email, name, is_admin, is_active, is_service_account)
     VALUES ($1, 'Terminal da unit', false, true, true)
     ON CONFLICT (email) DO NOTHING`,
    [TERMINAL_SERVICE_ACCOUNT_EMAIL],
  );
  const created = await findTerminalServiceAccount();
  if (!created) throw new Error('Could not create the terminal service account');
  return created;
}

/** Active managed terminal keys of the service account, for every provider. */
export async function terminalServiceKeys(serviceUserId: string) {
  const names = new Set<string>(TERMINAL_PROVIDERS.map(terminalApiKeyName));
  const now = Date.now();
  return (await apiKeyService.list(serviceUserId)).filter(key => names.has(key.name) && !key.revokedAt && (!key.expiresAt || key.expiresAt.getTime() > now));
}

/**
 * Grants the service account exactly the domains its active terminal keys
 * need (the API checks domain access of the key owner on each route).
 */
export async function syncTerminalServiceAccountDomains(serviceUserId: string): Promise<void> {
  const keys = await terminalServiceKeys(serviceUserId);
  const domains = terminalScopeDomains([...new Set(keys.flatMap(key => key.scopes))]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_domain_access WHERE user_id = $1', [serviceUserId]);
    if (domains.length > 0) {
      await client.query(
        `INSERT INTO user_domain_access (user_id, domain_id)
         SELECT $1, d.id FROM domains d WHERE d.slug = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [serviceUserId, domains],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
