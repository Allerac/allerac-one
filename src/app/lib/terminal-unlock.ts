import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Short-lived "terminal unlock" bound to one signed-in session.
 *
 * Opening a unit terminal or changing its API connection requires the user to
 * confirm their password (or to have signed in very recently). The unlock is
 * kept server-side, in process memory, keyed by a hash of the session token,
 * so it never travels to the browser and ends on sign-out, on server restart,
 * after a period without terminal activity, or after an absolute maximum.
 */
export const TERMINAL_UNLOCK_IDLE_MS = 15 * 60_000;
export const TERMINAL_UNLOCK_MAX_MS = 8 * 60 * 60_000;
/** Accounts without a password may unlock only from a session this fresh. */
export const TERMINAL_RECENT_SIGN_IN_MS = 15 * 60_000;

const SESSION_COOKIE_NAME = 'session_token';

interface UnlockEntry { userId: string; touchedAt: number; grantedAt: number }

declare global {
  var __alleracTerminalUnlocks: Map<string, UnlockEntry> | undefined;
}

const unlocks = globalThis.__alleracTerminalUnlocks ?? new Map<string, UnlockEntry>();
globalThis.__alleracTerminalUnlocks = unlocks;

export class TerminalReauthRequiredError extends Error {
  constructor() { super('Recent sign-in required'); this.name = 'TerminalReauthRequiredError'; }
}

const keyFor = (sessionToken: string) => createHash('sha256').update(sessionToken).digest('hex');

function expiresAt(entry: UnlockEntry): number {
  return Math.min(entry.touchedAt + TERMINAL_UNLOCK_IDLE_MS, entry.grantedAt + TERMINAL_UNLOCK_MAX_MS);
}

function prune(now: number) {
  for (const [key, entry] of unlocks) if (expiresAt(entry) <= now) unlocks.delete(key);
}

export function grantTerminalUnlock(sessionToken: string, userId: string, now = Date.now()): Date {
  prune(now);
  const entry = { userId, touchedAt: now, grantedAt: now };
  unlocks.set(keyFor(sessionToken), entry);
  return new Date(expiresAt(entry));
}

/** Returns the unlock expiry, or null when locked. `touch` extends the idle window. */
export function checkTerminalUnlock(sessionToken: string, userId: string, { now = Date.now(), touch = false } = {}): Date | null {
  const key = keyFor(sessionToken);
  const entry = unlocks.get(key);
  if (!entry) return null;
  if (entry.userId !== userId || expiresAt(entry) <= now) { unlocks.delete(key); return null; }
  if (touch) entry.touchedAt = now;
  return new Date(expiresAt(entry));
}

export function revokeTerminalUnlock(sessionToken: string) {
  unlocks.delete(keyFor(sessionToken));
}

export async function currentSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value || null;
}

/** Throws TerminalReauthRequiredError unless the current session is unlocked; refreshes the idle window. */
export async function requireTerminalUnlock(user: { id: string }): Promise<void> {
  const token = await currentSessionToken();
  if (!token || !checkTerminalUnlock(token, user.id, { touch: true })) throw new TerminalReauthRequiredError();
}

export function terminalReauthResponse(error: unknown): Response | null {
  if (!(error instanceof TerminalReauthRequiredError)) return null;
  return Response.json({ error: 'Recent sign-in required', code: 'reauth_required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}
