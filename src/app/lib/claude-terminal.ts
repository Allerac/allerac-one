import type { User } from '@/app/services/auth/auth.service';
import { ForbiddenError } from '@/app/lib/auth-errors';
import type { TerminalProvider } from '@/app/terminal/providers';

export function terminalConfiguration(provider: TerminalProvider) {
  const prefix = provider === 'codex' ? 'CODEX_TERMINAL' : 'CLAUDE_TERMINAL';
  return { url: process.env[`${prefix}_URL`], secret: process.env[`${prefix}_SECRET`], userId: process.env[`${prefix}_USER_ID`] };
}

export function canUseTerminal(user: Pick<User, 'id'>, provider: TerminalProvider): boolean {
  const config = terminalConfiguration(provider);
  return Boolean(config.url && config.secret && config.userId === user.id);
}

export function canUseClaudeTerminal(user: Pick<User, 'id'>): boolean {
  return canUseTerminal(user, 'claude');
}

export function assertClaudeTerminalAccess(user: Pick<User, 'id'>) {
  if (!canUseClaudeTerminal(user)) throw new ForbiddenError('Terminal access is not enabled for this user');
}

export function assertTerminalAccess(user: Pick<User, 'id'>, provider: TerminalProvider) {
  if (!canUseTerminal(user, provider)) throw new ForbiddenError('Terminal access is not enabled for this user');
}
