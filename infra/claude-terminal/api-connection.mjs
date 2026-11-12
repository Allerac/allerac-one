import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function readApiConnection(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!/^alr_live_[a-f0-9]{64}$/.test(value.token) || !Array.isArray(value.scopes) || !value.keyId || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error('Invalid API connection');
    return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Conexão local inválida. Reconecte pela página Conexões.'); }
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
      fs.mkdirSync(path.dirname(file), { recursive: true });
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
