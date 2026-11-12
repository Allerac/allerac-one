import http from 'node:http';
import { timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApiConnectionStore, mcpLaunchArguments } from './api-connection.mjs';

const exec = promisify(execFile);
const LIMIT = 2 * 1024 * 1024;

export function parseCodexLoginStatus(text) {
  if (/^Logged in using ChatGPT\s*$/m.test(text)) return { loggedIn: true, authMethod: 'chatgpt' };
  if (/^Logged in using (?:an )?API key\b/im.test(text)) return { loggedIn: true, authMethod: 'api' };
  return { loggedIn: false, authMethod: null };
}

export function createBridge({ secret, ownerId, executable, cwd, spawn, status, apiConnection, args = ['--permission-mode', 'default'], label = 'Claude Code', idleMs = 30 * 60_000 }) {
  if (!secret || secret.length < 32 || !ownerId || !executable || !cwd) throw new Error('Missing terminal configuration');
  let session;
  const hash = value => createHash('sha256').update(value).digest();
  const stop = () => { if (session?.running) { session.running = false; session.pty.kill(); } };
  const timer = setInterval(() => { if (session && Date.now() - session.touched > idleMs) stop(); }, Math.min(idleMs, 30_000));
  timer.unref();
  const server = http.createServer(async (req, res) => {
    const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    // No browser-facing CORS. Only the authenticated Allerac backend calls this service.
    if (req.headers.origin || !timingSafeEqual(hash(req.headers.authorization || ''), hash(`Bearer ${secret}`)) || req.headers['x-terminal-owner'] !== ownerId) return json(403, { error: 'Forbidden' });
    try {
      const url = new URL(req.url, 'http://bridge');
      if (url.pathname === '/api-connection' && apiConnection) {
        if (req.method === 'GET') return json(200, apiConnection.metadata());
        if (req.method === 'DELETE') return json(200, apiConnection.clear());
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        const account = await status();
        return json(200, { installed: true, loggedIn: account.loggedIn === true, authMethod: account.authMethod || null, email: account.email || null, plan: account.subscriptionType || null, running: session?.running === true });
      }
      if (req.method === 'GET' && url.pathname === '/output') {
        if (!session) return json(404, { error: 'No session' });
        const cursor = Number(url.searchParams.get('cursor') || 0);
        if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > session.end) return json(400, { error: 'Invalid cursor' });
        session.touched = Date.now();
        return json(200, { id: session.id, data: session.output.slice(Math.max(0, cursor - session.base)), cursor: session.end, truncated: cursor < session.base, running: session.running, exitCode: session.exitCode });
      }
      if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 32_768) return json(413, { error: 'Request too large' }); }
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
      if (!body || typeof body !== 'object') return json(400, { error: 'Invalid body' });
      if (url.pathname === '/api-connection' && apiConnection) {
        try { return json(200, apiConnection.install(body)); }
        catch { return json(400, { error: 'Invalid API connection' }); }
      }
      const dimensions = () => Number.isInteger(body.cols) && body.cols >= 20 && body.cols <= 300 && Number.isInteger(body.rows) && body.rows >= 5 && body.rows <= 100;
      if (url.pathname === '/start') {
        if (!dimensions()) return json(400, { error: 'Invalid terminal size' });
        if (!session?.running) {
          const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
          // The pilot starts with the user's native subscription login, never an inherited API key.
          for (const key of Object.keys(env)) if (key.startsWith('CLAUDE_TERMINAL_') || key.startsWith('CODEX_TERMINAL_') || ['UNIT_TERMINAL_PROVIDER', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_THREAD_ID', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE'].includes(key)) delete env[key];
          const child = spawn(executable, args, { name: 'xterm-256color', cols: body.cols, rows: body.rows, cwd, env });
          const next = { id: randomUUID(), pty: child, output: '', base: 0, end: 0, running: true, touched: Date.now(), exitCode: null };
          session = next;
          child.onData(data => { next.output += data; next.end += data.length; if (next.output.length > LIMIT) { const cut = next.output.length - LIMIT; next.output = next.output.slice(cut); next.base += cut; } });
          child.onExit(({ exitCode }) => { next.running = false; next.exitCode = exitCode; });
        }
        session.touched = Date.now();
        return json(200, { id: session.id, running: session.running });
      }
      if (!session || body.id !== session.id) return json(409, { error: 'Session changed. Reconnect.' });
      if (url.pathname === '/stop') { stop(); return json(200, { running: false }); }
      if (!session.running) return json(409, { error: 'Session ended' });
      session.touched = Date.now();
      if (url.pathname === '/input' && typeof body.data === 'string' && body.data.length <= 16_384) { session.pty.write(body.data); return json(200, { ok: true }); }
      if (url.pathname === '/resize' && dimensions()) { session.pty.resize(body.cols, body.rows); return json(200, { ok: true }); }
      return json(400, { error: 'Invalid terminal operation' });
    } catch (error) { console.error('[unit-terminal]', error.message); return json(503, { error: `${label} unavailable on this unit` }); }
  });
  server.on('close', () => { clearInterval(timer); stop(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { spawn } = await import('node-pty');
  const provider = process.env.UNIT_TERMINAL_PROVIDER || 'claude';
  if (!['claude', 'codex'].includes(provider)) throw new Error('Unknown terminal provider');
  const prefix = provider === 'codex' ? 'CODEX_TERMINAL' : 'CLAUDE_TERMINAL';
  const executable = process.env[`${prefix}_EXECUTABLE`];
  const codexArgs = ['--no-daemon', '--no-alt-screen', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'tui.disable_paste_burst=true'];
  const cwd = process.env[`${prefix}_CWD`];
  const connectionFile = path.resolve(cwd, '.tools', `allerac-api-${provider}.json`);
  const apiConnection = createApiConnectionStore({ file: connectionFile, apiUrl: process.env.ALLERAC_TERMINAL_API_URL || 'http://localhost:8080' });
  const mcpArgs = mcpLaunchArguments(provider, { node: process.execPath, script: fileURLToPath(new URL('./allerac-mcp.mjs', import.meta.url)), file: connectionFile });
  const server = createBridge({
    secret: process.env[`${prefix}_SECRET`], ownerId: process.env[`${prefix}_USER_ID`],
    executable, cwd, spawn, apiConnection,
    args: [...(provider === 'codex' ? codexArgs : ['--permission-mode', 'default']), ...mcpArgs],
    ...(provider === 'codex' ? { label: 'Codex' } : {}),
    status: async () => {
      if (provider === 'codex') {
        try {
          const result = await exec(executable, ['login', 'status'], { timeout: 10_000, windowsHide: true });
          return parseCodexLoginStatus(result.stdout + '\n' + result.stderr);
        } catch (error) {
          if (error.code === 1) return { loggedIn: false, authMethod: null };
          throw error;
        }
      }
      try { return JSON.parse((await exec(executable, ['auth', 'status'], { timeout: 10_000, windowsHide: true })).stdout); }
      catch (error) {
        // Claude exits with code 1 when the native account is logged out.
        if (error.code === 1 && error.stdout) {
          const result = JSON.parse(error.stdout);
          if (result.loggedIn === false) return { loggedIn: false };
        }
        throw error;
      }
    },
  });
  server.listen(Number(process.env[`${prefix}_PORT`] || (provider === 'codex' ? 3016 : 3015)), process.env[`${prefix}_HOST`] || '127.0.0.1', () => console.log(`${provider} terminal bridge ready`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
