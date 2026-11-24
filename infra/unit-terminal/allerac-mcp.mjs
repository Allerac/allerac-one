import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { connectionMetadata, readApiConnection } from './api-connection.mjs';

const routes = [
  { scope: 'profile:read', method: 'GET', path: '/me', description: 'Identidade e preferências do usuário autenticado.' },
  { scope: 'capabilities:read', method: 'GET', path: '/capabilities', description: 'Serviços disponíveis; não contém credenciais.' },
  { scope: 'domains:read', method: 'GET', path: '/domains', description: 'Áreas acessíveis ao usuário.' },
  { scope: 'notes:read', method: 'GET', path: '/notes?limit=20', description: 'Listar notas.' },
  { scope: 'notes:read', method: 'GET', path: '/notes/search?q=texto', description: 'Buscar notas.' },
  { scope: 'notes:write', method: 'POST', path: '/notes', description: 'Criar nota: body {title?, content, tags?}. PATCH/DELETE /notes/{id} para alterar/remover.' },
  { scope: 'tickets:read', method: 'GET', path: '/tickets', description: 'Listar tarefas/tickets.' },
  { scope: 'tickets:write', method: 'POST', path: '/tickets', description: 'Criar ticket: body {title, description?, type: task|bug|improvement|question}.' },
  { scope: 'jobs:read', method: 'GET', path: '/jobs', description: 'Listar automações agendadas.' },
  { scope: 'jobs:write', method: 'POST', path: '/jobs', description: 'Criar agendamento: body {name, cronExpr, prompt, channels, enabled?}. Pode consumir API e enviar notificações; confirmar com usuário.' },
  { scope: 'memory:read', method: 'GET', path: '/memories', description: 'Listar memórias.' },
  { scope: 'documents:read', method: 'GET', path: '/documents', description: 'Listar documentos.' },
  { scope: 'health:read', method: 'GET', path: '/health/summary', description: 'Resumo dos dados de saúde.' },
  { scope: 'health:proxy:read', method: 'GET', path: '/health/proxy/status', description: 'Estado da conexão Garmin para consultas em tempo real.' },
];

export function apiRequestUrl(origin, relative) {
  if (typeof relative !== 'string' || !relative.startsWith('/') || relative.startsWith('//') || relative.includes('#')) throw new Error('Use um caminho relativo da API, por exemplo /me.');
  const decoded = decodeURIComponent(relative.split('?')[0]);
  if (decoded.includes('\\') || decoded.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Caminho inválido.');
  const base = new URL(origin);
  const target = new URL(`/api/v1${relative}`, base);
  if (target.origin !== base.origin || !target.pathname.startsWith('/api/v1/')) throw new Error('O acesso é limitado à API desta Allerac.');
  return target;
}

async function responseText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Resposta muito grande. Use filtros ou paginação.'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createAlleracMcp({ file, fetchImpl = fetch }) {
  const server = new McpServer({ name: 'allerac-unit', version: '1.0.0' }, { instructions: 'Ferramentas da API da Allerac desta unit. Consulte allerac_help para conhecer permissões e rotas. A autorização é a do usuário conectado em Conexões; não procure nem exiba chaves de API. Confirme ações de escrita com o usuário.' });
  const result = (value, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError });
  const active = () => {
    const value = readApiConnection(file);
    if (!value || Date.parse(value.expiresAt) <= Date.now()) throw new Error('Conexão da API desativada ou expirada. Abra Conexões na Allerac e conecte a API ao terminal.');
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
    catch (error) { return result({ error: error.message === 'fetch failed' ? 'API indisponível nesta unit.' : error.message }, true); }
  };
  server.registerTool('allerac_help', { description: 'Descobrir os acessos autorizados e exemplos de rotas da API da Allerac.', inputSchema: {}, annotations: { readOnlyHint: true } }, safely(async () => {
    const value = readApiConnection(file);
    return result({ connection: connectionMetadata(value), endpoints: routes.filter(route => value?.scopes.includes(route.scope)), usage: 'Use allerac_request com method, path relativo (por exemplo /notes?limit=10), e body JSON opcional. A API valida permissões e acesso aos dados em cada chamada.' });
  }));
  server.registerTool('allerac_status', { description: 'Verificar a conexão com a Allerac e consultar a identidade autenticada via GET /me.', inputSchema: {}, annotations: { readOnlyHint: true } }, safely(async () => { const response = await call('GET', '/me'); return result(response, !response.ok); }));
  server.registerTool('allerac_request', {
    description: 'Chamar a API da Allerac desta unit com os acessos autorizados. Consulte allerac_help para rotas. Não aceita URLs externas nem cabeçalhos de autenticação. Confirme alterações com o usuário.',
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
