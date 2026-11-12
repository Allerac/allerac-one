import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { connectionMetadata, readApiConnection } from './api-connection.mjs';

const routes = [
  { scope: 'profile:read', method: 'GET', path: '/me', description: 'Identity and preferences of the authenticated user.' },
  { scope: 'capabilities:read', method: 'GET', path: '/capabilities', description: 'Available services; contains no credentials.' },
  { scope: 'domains:read', method: 'GET', path: '/domains', description: 'Areas the user can access.' },
  { scope: 'notes:read', method: 'GET', path: '/notes?limit=20', description: 'List notes.' },
  { scope: 'notes:read', method: 'GET', path: '/notes/search?q=text', description: 'Search notes.' },
  { scope: 'notes:write', method: 'POST', path: '/notes', description: 'Create a note: body {title?, content, tags?}. PATCH/DELETE /notes/{id} to edit/remove.' },
  { scope: 'tickets:read', method: 'GET', path: '/tickets', description: 'List tasks/tickets.' },
  { scope: 'tickets:write', method: 'POST', path: '/tickets', description: 'Create a ticket: body {title, description?, type: task|bug|improvement|question}.' },
  { scope: 'jobs:read', method: 'GET', path: '/jobs', description: 'List scheduled automations.' },
  { scope: 'jobs:write', method: 'POST', path: '/jobs', description: 'Create a schedule: body {name, cronExpr, prompt, channels, enabled?}. May use API credits and send notifications; confirm with the user.' },
  { scope: 'memory:read', method: 'GET', path: '/memories', description: 'List memories.' },
  { scope: 'documents:read', method: 'GET', path: '/documents', description: 'List documents.' },
  { scope: 'health:read', method: 'GET', path: '/health/summary', description: 'Health data summary.' },
  { scope: 'health:proxy:read', method: 'GET', path: '/health/proxy/status', description: 'Garmin connection status for real-time queries.' },
];

export function apiRequestUrl(origin, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('/') || relative.startsWith('//') || relative.includes('#')) throw new Error('Use a relative API path, for example /me.');
  const decoded = decodeURIComponent(relative.split('?')[0]);
  if (decoded.includes('\\') || decoded.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Invalid path.');
  const base = new URL(origin);
  const target = new URL(`/api/v1${relative}`, base);
  if (target.origin !== base.origin || !target.pathname.startsWith('/api/v1/')) throw new Error('Access is limited to this Allerac API.');
  return target;
}

async function responseText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Response too large. Use filters or pagination.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createAlleracMcp({ file, fetchImpl = fetch }) {
  const server = new McpServer({ name: 'allerac-unit', version: '1.0.0' }, { instructions: 'Allerac API tools for this unit. Call allerac_help to learn the granted permissions and routes. Authorization is that of the user connected under Connections; do not look for or display API keys. Confirm write actions with the user.' });
  const result = (value, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError });
  const active = () => {
    const value = readApiConnection(file);
    if (!value || Date.parse(value.expiresAt) <= Date.now()) throw new Error('API connection disabled or expired. Open Connections in Allerac and connect the API to the terminal.');
    return value;
  };
  const call = async (method, relative, body) => {
    const value = active();
    const response = await fetchImpl(apiRequestUrl(value.apiUrl, relative), {
      method, redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${value.token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined && method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
    const text = (await responseText(response)).replaceAll(value.token, '[redacted]');
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, ok: response.ok, response: data };
  };
  const safely = handler => async args => {
    try { return await handler(args); }
    catch (error) { return result({ error: error.message === 'fetch failed' ? 'API unavailable on this unit.' : error.message }, true); }
  };
  server.registerTool('allerac_help', { description: 'Discover the granted access and example Allerac API routes.', inputSchema: {}, annotations: { readOnlyHint: true } }, safely(async () => {
    const value = readApiConnection(file);
    return result({ connection: connectionMetadata(value), endpoints: routes.filter(route => value?.scopes.includes(route.scope)), usage: 'Use allerac_request with method, a relative path (for example /notes?limit=10) and an optional JSON body. The API checks permissions and data access on every call.' });
  }));
  server.registerTool('allerac_status', { description: 'Check the Allerac connection and read the authenticated identity via GET /me.', inputSchema: {}, annotations: { readOnlyHint: true } }, safely(async () => { const response = await call('GET', '/me'); return result(response, !response.ok); }));
  server.registerTool('allerac_request', {
    description: 'Call this unit\'s Allerac API with the granted access. See allerac_help for routes. External URLs and authentication headers are not accepted. Confirm changes with the user.',
    inputSchema: { method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).default('GET'), path: z.string().min(1).max(2048), body: z.unknown().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, safely(async ({ method, path, body }) => { const response = await call(method, path, body); return result(response, !response.ok); }));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[process.argv.indexOf('--connection-file') + 1];
  if (!process.argv.includes('--connection-file') || !file) throw new Error('Missing connection file');
  await createAlleracMcp({ file }).connect(new StdioServerTransport());
}
