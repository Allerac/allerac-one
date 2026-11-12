import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Directory for the managed API connection files. It defaults to a per-user
 * config directory so the token is never inside the CLI working directory
 * (where Claude Code and Codex read and write project files):
 *   Windows: %APPDATA%\allerac\terminal
 *   other:   $XDG_CONFIG_HOME/allerac/terminal or ~/.config/allerac/terminal
 * ALLERAC_TERMINAL_STATE_DIR overrides it; it must still be outside `cwd`.
 */
export function terminalStateDirectory({ env = process.env, platform = process.platform, home = os.homedir(), cwd } = {}) {
  const pathFor = platform === 'win32' ? path.win32 : path.posix;
  const configured = env.ALLERAC_TERMINAL_STATE_DIR;
  const directory = configured
    ? pathFor.resolve(configured)
    : platform === 'win32'
      ? pathFor.join(env.APPDATA || pathFor.join(home, 'AppData', 'Roaming'), 'allerac', 'terminal')
      : pathFor.join(env.XDG_CONFIG_HOME || pathFor.join(home, '.config'), 'allerac', 'terminal');
  if (cwd) {
    const relative = pathFor.relative(pathFor.resolve(cwd), directory);
    if (relative === '' || (!relative.startsWith('..') && !pathFor.isAbsolute(relative))) throw new Error('The terminal state directory must be outside the CLI working directory');
  }
  return directory;
}

export function apiConnectionFile(provider, options = {}) {
  if (!['claude', 'codex'].includes(provider)) throw new Error('Unknown terminal provider');
  const pathFor = (options.platform ?? process.platform) === 'win32' ? path.win32 : path.posix;
  return pathFor.join(terminalStateDirectory(options), `allerac-api-${provider}.json`);
}

export function readApiConnection(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^alr_live_[a-f0-9]{64}$/.test(value.token) || !Array.isArray(value.scopes) || !value.keyId || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error('Invalid API connection');
    return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Invalid local connection. Reconnect from the Connections page.'); }
}

export function connectionMetadata(value) {
  return value ? { connected: Date.parse(value.expiresAt) > Date.now(), keyId: value.keyId, scopes: value.scopes, expiresAt: value.expiresAt } : { connected: false, keyId: null, scopes: [], expiresAt: null };
}

export function createApiConnectionStore({ file, apiUrl }) {
  const base = new URL(apiUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('Invalid Allerac API origin');
  return {
    metadata: () => connectionMetadata(readApiConnection(file)),
    install(input) {
      if (!/^alr_live_[a-f0-9]{64}$/.test(input.token) || !/^[a-f0-9-]{36}$/.test(input.keyId) || !Array.isArray(input.scopes) || !input.scopes.every(scope => typeof scope === 'string') || !(Date.parse(input.expiresAt) > Date.now()) || Date.parse(input.expiresAt) > Date.now() + 31 * 86400_000) throw new Error('Invalid API connection');
      const previousKeyId = readApiConnection(file)?.keyId || null;
      const value = { keyId: input.keyId, token: input.token, scopes: input.scopes, expiresAt: input.expiresAt, apiUrl: base.origin };
      // Owner-only where the platform supports POSIX modes; on Windows the per-user profile ACL applies.
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temporary, file); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      return { ...connectionMetadata(value), previousKeyId };
    },
    clear() {
      const previousKeyId = readApiConnection(file)?.keyId || null;
      try { fs.unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      return { ...connectionMetadata(null), previousKeyId };
    },
  };
}

export function mcpLaunchArguments(provider, { node, script, file }) {
  const args = [script, '--connection-file', file];
  if (provider === 'claude') return ['--mcp-config', JSON.stringify({ mcpServers: { allerac_unit: { type: 'stdio', command: node, args } } })];
  if (provider !== 'codex') throw new Error('Unknown terminal provider');
  return ['-c', `mcp_servers.allerac_unit.command=${JSON.stringify(node)}`, '-c', `mcp_servers.allerac_unit.args=${JSON.stringify(args)}`];
}
