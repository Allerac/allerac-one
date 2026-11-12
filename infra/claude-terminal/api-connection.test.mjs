import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApiConnectionStore, mcpLaunchArguments } from './api-connection.mjs';
import { createAlleracMcp, apiRequestUrl } from './allerac-mcp.mjs';

const token = `alr_live_${'a'.repeat(64)}`;
const payload = () => ({ keyId: '11111111-1111-4111-8111-111111111111', token, scopes: ['profile:read'], expiresAt: new Date(Date.now() + 86400_000).toISOString() });

test('credentials persist locally, metadata never exposes the token, and disconnect is immediate', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allerac-mcp-'));
  const file = path.join(directory, 'connection.json');
  const store = createApiConnectionStore({ file, apiUrl: 'http://localhost:8080' });
  try {
    assert.equal(store.metadata().connected, false);
    store.install(payload());
    assert.equal(store.metadata().connected, true);
    assert.equal(JSON.stringify(store.metadata()).includes(token), false);
    const reopened = createApiConnectionStore({ file, apiUrl: 'http://localhost:8080' });
    assert.equal(reopened.metadata().connected, true);
    assert.equal(reopened.clear().previousKeyId, payload().keyId);
    assert.equal(store.metadata().connected, false);
    assert.throws(() => store.install({ ...payload(), token: 'invalid' }));
    fs.writeFileSync(file, `{"token":"${token}"`);
    assert.throws(() => store.metadata(), error => !error.message.includes(token) && error.message.includes('Conexão local inválida'));
  } finally { for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); }
});

test('API requests cannot escape the local /api/v1 boundary', () => {
  assert.equal(apiRequestUrl('http://localhost:8080', '/notes?limit=5').href, 'http://localhost:8080/api/v1/notes?limit=5');
  for (const invalid of ['https://evil.test/', '//evil.test/', '/../config', '/%2e%2e/config', '/a/../../config', '/a%5c..%5cconfig', '/me#secret']) assert.throws(() => apiRequestUrl('http://localhost:8080', invalid));
});

test('native launch arguments contain only MCP configuration and file paths, never API credentials', () => {
  const config = { node: 'C:\\Program Files\\nodejs\\node.exe', script: 'C:\\unit\\allerac-mcp.mjs', file: 'C:\\unit\\.tools\\api.json' };
  const claude = mcpLaunchArguments('claude', config);
  assert.equal(JSON.parse(claude[1]).mcpServers.allerac_unit.command, config.node);
  const codex = mcpLaunchArguments('codex', config);
  assert.ok(codex.includes(`mcp_servers.allerac_unit.command=${JSON.stringify(config.node)}`));
  assert.equal(JSON.stringify([...claude, ...codex]).includes(token), false);
});

test('real MCP discovery and tool calls use the managed key, propagate denials, and reread disconnects', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'allerac-mcp-'));
  const file = path.join(directory, 'connection.json');
  const store = createApiConnectionStore({ file, apiUrl: 'http://localhost:8080' });
  const requests = [];
  const server = createAlleracMcp({ file, fetchImpl: async (url, options) => {
    requests.push({ url: url.href, options });
    return url.pathname.endsWith('/me') ? Response.json({ data: { user: { email: 'owner@example.com' } } }) : Response.json({ error: { code: 'missing_scope' } }, { status: 403 });
  } });
  const client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    assert.equal((await client.listTools()).tools.length, 3);
    assert.equal((await client.callTool({ name: 'allerac_status', arguments: {} })).isError, true);
    store.install(payload());
    const status = await client.callTool({ name: 'allerac_status', arguments: {} });
    assert.equal(status.isError, false); assert.match(status.content[0].text, /owner@example.com/);
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(requests[0].options.redirect, 'error');
    const denied = await client.callTool({ name: 'allerac_request', arguments: { method: 'GET', path: '/notes' } });
    assert.equal(denied.isError, true); assert.match(denied.content[0].text, /403/);
    const external = await client.callTool({ name: 'allerac_request', arguments: { path: '//evil.test' } });
    assert.equal(external.isError, true); assert.equal(requests.length, 2);
    store.clear();
    assert.equal((await client.callTool({ name: 'allerac_status', arguments: {} })).isError, true);
    assert.equal(requests.length, 2);
  } finally { await client.close(); await server.close(); if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(directory); }
});
