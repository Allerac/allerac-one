/** @jest-environment node */
import { needsTerminalUnlock, readTerminalResponse, terminalErrorMessage, TerminalRequestError } from '@/app/terminal/terminal-request';

const translate = (key: string) => `t:${key}`;

test('known error codes are translated and flagged for unlock', async () => {
  const error = await readTerminalResponse(Response.json({ error: 'Recent sign-in required', code: 'reauth_required' }, { status: 403 })).catch(e => e);
  expect(error).toBeInstanceOf(TerminalRequestError);
  expect(needsTerminalUnlock(error)).toBe(true);
  expect(terminalErrorMessage(error, translate)).toBe('t:reauth_required');
});

test('unknown codes fall back to the server message or a translated default', async () => {
  const bridge = await readTerminalResponse(Response.json({ error: 'Session changed. Reconnect.' }, { status: 409 })).catch(e => e);
  expect(needsTerminalUnlock(bridge)).toBe(false);
  expect(terminalErrorMessage(bridge, translate)).toBe('Session changed. Reconnect.');
  const empty = await readTerminalResponse(new Response('not json', { status: 502 })).catch(e => e);
  expect(terminalErrorMessage(empty, translate, 'startFailed')).toBe('t:startFailed');
  expect(terminalErrorMessage(new Error('network'), translate)).toBe('t:generic');
  expect(await readTerminalResponse(Response.json({ ok: true }))).toEqual({ ok: true });
});
