/** @jest-environment node */
/**
 * shell-policy.ts is bundled into the agent-worker and Telegram images, which
 * ship a single esbuild bundle and no node_modules. If it (re)imports the
 * session code, the bundle pulls in next/headers and the native bcrypt
 * module, and the workers crash at startup ("No native build was found").
 */
import { readFileSync } from 'fs';
import path from 'path';

const source = readFileSync(path.join(__dirname, '../../app/lib/shell-policy.ts'), 'utf8');
const imports = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)]
  .filter(match => !/^\s*import\s+type\s/.test(match[0]))
  .map(match => match[1]);

describe('shell-policy stays worker-safe', () => {
  it('only imports the database client', () => {
    expect(imports.sort()).toEqual(['@/app/clients/db']);
  });

  it.each(['@/app/lib/auth-session', 'next/headers', 'bcrypt', '@/app/services/auth/auth.service'])(
    'does not import %s',
    forbidden => {
      expect(imports).not.toContain(forbidden);
    },
  );
});
