/** @jest-environment node */
import {
  checkTerminalUnlock, grantTerminalUnlock, revokeTerminalUnlock, terminalReauthResponse, TerminalReauthRequiredError,
  TERMINAL_UNLOCK_IDLE_MS, TERMINAL_UNLOCK_MAX_MS,
} from '@/app/lib/terminal-unlock';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));

afterEach(() => { revokeTerminalUnlock('session-a'); revokeTerminalUnlock('session-b'); });

test('an unlock is bound to one session and one user', () => {
  grantTerminalUnlock('session-a', 'owner', 0);
  expect(checkTerminalUnlock('session-a', 'owner', { now: 1 })).not.toBeNull();
  expect(checkTerminalUnlock('session-b', 'owner', { now: 1 })).toBeNull();
  expect(checkTerminalUnlock('session-a', 'someone-else', { now: 1 })).toBeNull();
  // A mismatched user also discards the unlock.
  expect(checkTerminalUnlock('session-a', 'owner', { now: 2 })).toBeNull();
});

test('the unlock slides with activity but never exceeds the absolute maximum', () => {
  grantTerminalUnlock('session-a', 'owner', 0);
  expect(checkTerminalUnlock('session-a', 'owner', { now: TERMINAL_UNLOCK_IDLE_MS - 1 })).not.toBeNull();
  // Reading without touching does not extend it.
  expect(checkTerminalUnlock('session-a', 'owner', { now: TERMINAL_UNLOCK_IDLE_MS })).toBeNull();

  grantTerminalUnlock('session-a', 'owner', 0);
  let now = 0;
  while (now + TERMINAL_UNLOCK_IDLE_MS / 2 < TERMINAL_UNLOCK_MAX_MS) {
    now += TERMINAL_UNLOCK_IDLE_MS / 2;
    expect(checkTerminalUnlock('session-a', 'owner', { now, touch: true })).not.toBeNull();
  }
  expect(checkTerminalUnlock('session-a', 'owner', { now: TERMINAL_UNLOCK_MAX_MS, touch: true })).toBeNull();
});

test('revocation is immediate and the reauth response has a stable code', async () => {
  grantTerminalUnlock('session-a', 'owner', 0);
  revokeTerminalUnlock('session-a');
  expect(checkTerminalUnlock('session-a', 'owner', { now: 1 })).toBeNull();
  const response = terminalReauthResponse(new TerminalReauthRequiredError())!;
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: 'Recent sign-in required', code: 'reauth_required' });
  expect(terminalReauthResponse(new Error('other'))).toBeNull();
});
