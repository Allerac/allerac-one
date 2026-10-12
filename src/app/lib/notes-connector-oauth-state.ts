import { randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NotesConnectorProvider } from '@/app/services/notes-connectors/types';

const STATE_MAX_AGE_SECONDS = 600;

function cookieName(provider: NotesConnectorProvider): string {
  return `notes_connector_oauth_state_${provider}`;
}

function equal(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

/** Creates signed OAuth state tied to the current user and sets it as an httpOnly cookie. Returns the state to send to the provider. */
export async function createOAuthState(provider: NotesConnectorProvider, userId: string): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  (await cookies()).set(cookieName(provider), `${userId}:${state}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_MAX_AGE_SECONDS,
    path: '/',
  });
  return state;
}

/** Validates the callback's state against the cookie set by createOAuthState, and clears the cookie either way. */
export async function verifyOAuthState(provider: NotesConnectorProvider, userId: string, receivedState: string): Promise<boolean> {
  const store = await cookies();
  const stored = store.get(cookieName(provider))?.value ?? '';
  store.delete(cookieName(provider));

  const separator = stored.indexOf(':');
  const storedUser = separator >= 0 ? stored.slice(0, separator) : '';
  const storedState = separator >= 0 ? stored.slice(separator + 1) : '';

  return Boolean(receivedState) && storedUser === userId && equal(storedState, receivedState);
}
