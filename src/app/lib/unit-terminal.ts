import pool from '@/app/clients/db';
import type { User } from '@/app/services/auth/auth.service';
import { ForbiddenError } from '@/app/lib/auth-errors';
import { TERMINAL_PROVIDERS, type TerminalProvider } from '@/app/terminal/providers';

// Compose service names of the Unit terminal (profile "terminal").
const DEFAULT_URLS: Record<TerminalProvider, string> = {
  claude: 'http://terminal-claude:3015',
  codex: 'http://terminal-codex:3016',
};

export function terminalConfiguration(provider: TerminalProvider) {
  const prefix = provider === 'codex' ? 'CODEX_TERMINAL' : 'CLAUDE_TERMINAL';
  return { url: process.env[`${prefix}_URL`] || DEFAULT_URLS[provider], secret: process.env[`${prefix}_SECRET`] };
}

/** A provider is enabled in this Unit when its service secret is configured. */
export function isTerminalConfigured(provider: TerminalProvider): boolean {
  const config = terminalConfiguration(provider);
  return Boolean(config.url && config.secret && config.secret.length >= 32);
}

/** Admins implicitly; other users only when an admin granted the terminal. Service accounts never. */
export async function hasTerminalPermission(user: Pick<User, 'id' | 'is_admin'>): Promise<boolean> {
  if (user.is_admin) return true;
  const result = await pool.query(
    `SELECT 1
     FROM user_terminal_access a
     JOIN users u ON u.id = a.user_id
     WHERE a.user_id = $1 AND u.is_active = true AND u.is_service_account = false
     LIMIT 1`,
    [user.id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function availableTerminalProviders(user: Pick<User, 'id' | 'is_admin'>): Promise<TerminalProvider[]> {
  const configured = TERMINAL_PROVIDERS.filter(isTerminalConfigured);
  if (configured.length === 0 || !(await hasTerminalPermission(user))) return [];
  return configured;
}

export async function canUseTerminal(user: Pick<User, 'id' | 'is_admin'>, provider: TerminalProvider): Promise<boolean> {
  return isTerminalConfigured(provider) && hasTerminalPermission(user);
}

export async function assertTerminalAccess(user: Pick<User, 'id' | 'is_admin'>, provider: TerminalProvider) {
  if (!(await canUseTerminal(user, provider))) throw new ForbiddenError('Terminal access is not enabled for this user');
}
