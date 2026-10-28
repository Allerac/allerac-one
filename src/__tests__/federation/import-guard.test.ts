/** @jest-environment node */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('federation import guard', () => {
  it('only src/federation may use the low-level PeerClient transport', () => {
    const offenders = walk(SRC)
      .filter(file => !file.startsWith(path.join(SRC, 'federation') + path.sep))
      .filter(file => {
        const source = fs.readFileSync(file, 'utf8');
        // Shared Zod schemas may be imported; the transport itself may not.
        return /import\s*\{[^}]*\bPeerClient\b[^}]*\}\s*from\s*['"][^'"]*federation\/peer-client['"]/.test(source)
          || /\bcallPeer\s*\(/.test(source);
      })
      .map(file => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
