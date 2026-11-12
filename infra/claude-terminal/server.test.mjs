import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBridge, parseCodexLoginStatus, resolveListenHost, resolveExecutable } from './server.mjs';

test('bridge authenticates every operation and preserves one interactive session', async () => {
  let data, exit, spawned = 0, killed = 0;
  const inputs = [], sizes = [];
  const server = createBridge({ secret: 's'.repeat(40), ownerId: 'owner', executable: 'claude', cwd: process.cwd(),
    spawn: (exe, args, options) => {
      spawned++;
      assert.equal(exe, 'claude');
      assert.deepEqual(args, ['--permission-mode', 'default']);
      assert.equal(options.env.CLAUDE_TERMINAL_SECRET, undefined);
      assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
      return { onData: cb => { data = cb; }, onExit: cb => { exit = cb; }, write: value => inputs.push(value), resize: (...size) => sizes.push(size), kill: () => { killed++; exit({ exitCode: 0 }); } };
    },
    status: async () => ({ loggedIn: true, email: 'owner@example.com', subscriptionType: 'pro', secretToken: 'never expose' }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${'s'.repeat(40)}`, 'X-Terminal-Owner': 'owner', 'Content-Type': 'application/json' };
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.equal((await fetch(base + '/status')).status, 403);
    assert.equal((await fetch(base + '/status', { headers: { ...headers, 'X-Terminal-Owner': 'other' } })).status, 403);
    assert.equal((await fetch(base + '/status', { headers: { ...headers, Origin: 'http://evil.test' } })).status, 403);
    const status = await (await fetch(base + '/status', { headers })).json();
    assert.equal(status.plan, 'pro'); assert.equal(status.secretToken, undefined);
    assert.equal((await post('/start', { cols: 0, rows: 20 })).status, 400);
    const first = await (await post('/start', { cols: 100, rows: 30 })).json();
    const second = await (await post('/start', { cols: 100, rows: 30 })).json();
    assert.equal(first.id, second.id); assert.equal(spawned, 1);
    assert.equal((await post('/input', { id: 'wrong', data: 'bad' })).status, 409);
    await post('/input', { id: first.id, data: 'hello\r' });
    assert.deepEqual(inputs, ['hello\r']);
    await post('/resize', { id: first.id, cols: 80, rows: 24 });
    assert.deepEqual(sizes, [[80, 24]]);
    data('hello');
    const output = await (await fetch(base + '/output?cursor=0', { headers })).json();
    assert.equal(output.data, 'hello'); assert.equal(output.cursor, 5);
    const tail = await (await fetch(base + '/output?cursor=5', { headers })).json();
    assert.equal(tail.data, '');
    assert.equal((await fetch(base + '/output?cursor=-1', { headers })).status, 400);
    assert.equal((await post('/input', { id: first.id, data: 'x'.repeat(40_000) })).status, 413);
    await post('/stop', { id: first.id }); assert.equal(killed, 1);
    assert.equal((await post('/input', { id: first.id, data: 'bad' })).status, 409);
    const third = await (await post('/start', { cols: 80, rows: 24 })).json();
    assert.notEqual(third.id, first.id); assert.equal(spawned, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('bridge fails closed without an explicit owner and secret', () => {
  assert.throws(() => createBridge({ secret: 'short', ownerId: 'owner', executable: 'claude', cwd: '.' }));
  assert.throws(() => createBridge({ secret: 's'.repeat(40), executable: 'claude', cwd: '.' }));
});

test('Codex login status reports the authentication method without exposing credentials', () => {
  assert.deepEqual(parseCodexLoginStatus('Logged in using ChatGPT\r\n'), { loggedIn: true, authMethod: 'chatgpt' });
  assert.deepEqual(parseCodexLoginStatus('Logged in using an API key - sk-secret'), { loggedIn: true, authMethod: 'api' });
  assert.deepEqual(parseCodexLoginStatus('Not logged in'), { loggedIn: false, authMethod: null });
});

test('a separate Codex bridge launches the configured CLI without inheriting API credentials', async () => {
  const args = ['--no-daemon', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'];
  let called = false;
  const server = createBridge({ secret: 's'.repeat(40), ownerId: 'owner', executable: 'codex.exe', cwd: process.cwd(), args, label: 'Codex',
    status: async () => ({ loggedIn: true, authMethod: 'chatgpt' }),
    spawn: (executable, received, options) => {
      called = true; assert.equal(executable, 'codex.exe'); assert.deepEqual(received, args);
      assert.equal(options.env.OPENAI_API_KEY, undefined); assert.equal(options.env.CODEX_TERMINAL_SECRET, undefined);
      return { onData() {}, onExit() {}, kill() {} };
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/start`, { method: 'POST', headers: { Authorization: `Bearer ${'s'.repeat(40)}`, 'X-Terminal-Owner': 'owner' }, body: JSON.stringify({ cols: 100, rows: 30 }) });
    assert.equal(response.status, 200); assert.equal(called, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('listen host defaults to loopback and refuses wildcard addresses without explicit opt-in', () => {
  assert.deepEqual(resolveListenHost(undefined, { env: {} }), { host: '127.0.0.1', warning: null });
  for (const host of ['127.0.0.1', '127.0.1.1', 'localhost', '::1']) assert.equal(resolveListenHost(host, { env: {} }).warning, null);
  for (const host of ['0.0.0.0', '::', '[::]', '', '  ']) {
    assert.throws(() => resolveListenHost(host, { env: {} }), /Refusing to listen on all interfaces/);
    assert.throws(() => resolveListenHost(host, { env: { UNIT_TERMINAL_ALLOW_WILDCARD_HOST: '1' } }), /Refusing/);
    const allowed = resolveListenHost(host, { env: { UNIT_TERMINAL_ALLOW_WILDCARD_HOST: 'true' } });
    assert.match(allowed.warning, /all interfaces/);
  }
  assert.equal(resolveListenHost('', { env: { UNIT_TERMINAL_ALLOW_WILDCARD_HOST: 'true' } }).host, '0.0.0.0');
  const gateway = resolveListenHost('172.17.0.1', { env: {} });
  assert.equal(gateway.host, '172.17.0.1');
  assert.match(gateway.warning, /non-loopback address 172\.17\.0\.1/);
});

test('executables resolve on PATH on Linux and Windows, and explicit paths are kept', () => {
  const files = new Set(['/home/user/.local/bin/claude', 'C:\\Tools\\codex.CMD']);
  const exists = file => files.has(file);
  assert.equal(resolveExecutable('claude', { platform: 'linux', env: { PATH: '/usr/bin:/home/user/.local/bin' }, exists }), '/home/user/.local/bin/claude');
  assert.equal(resolveExecutable('codex', { platform: 'linux', env: { PATH: '/usr/bin' }, exists }), null);
  assert.equal(resolveExecutable('/opt/claude/bin/claude', { platform: 'linux', env: {}, exists }), '/opt/claude/bin/claude');
  assert.equal(resolveExecutable('codex', { platform: 'win32', env: { Path: 'C:\\Windows;C:\\Tools', PATHEXT: '.EXE;.CMD' }, exists }), 'C:\\Tools\\codex.CMD');
  assert.equal(resolveExecutable('C:\\Program Files\\claude.exe', { platform: 'win32', env: {}, exists }), 'C:\\Program Files\\claude.exe');
  assert.equal(resolveExecutable('', { platform: 'linux', env: {} }), null);
});
