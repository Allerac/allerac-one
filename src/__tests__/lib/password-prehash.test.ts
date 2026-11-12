import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { TextEncoder as NodeTextEncoder } from 'util';
import {
  isPrehashedPassword,
  prehashPassword,
  sha256Fallback,
} from '@/app/lib/password-prehash';

if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as unknown as { TextEncoder: typeof NodeTextEncoder }).TextEncoder = NodeTextEncoder;
}

const nodeSha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

const SAMPLES = [
  '',
  'password123',
  'correct horse battery staple',
  'çãõ-ñ-€-😀',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'y'.repeat(1000),
];

describe('password prehash', () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true, writable: true });
  });

  it.each(SAMPLES)('pure-JS SHA-256 matches node crypto for %j', (sample) => {
    expect(toHex(sha256Fallback(new NodeTextEncoder().encode(sample)))).toBe(nodeSha256(sample));
  });

  it('returns lowercase hex SHA-256 when Web Crypto is unavailable (plain HTTP)', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
    await expect(prehashPassword('password123')).resolves.toBe(nodeSha256('password123'));
  });

  it('uses Web Crypto when available and returns the same value', async () => {
    const { webcrypto } = jest.requireActual('crypto') as typeof import('crypto');
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true });
    const digest = jest.spyOn(webcrypto.subtle, 'digest');
    await expect(prehashPassword('çãõ-ñ-€-😀')).resolves.toBe(nodeSha256('çãõ-ñ-€-😀'));
    expect(digest).toHaveBeenCalled();
    digest.mockRestore();
  });

  it('output always passes the server-side shape check', async () => {
    for (const sample of SAMPLES) {
      expect(isPrehashedPassword(await prehashPassword(sample))).toBe(true);
    }
  });

  it('rejects plaintext and malformed values', () => {
    expect(isPrehashedPassword('password123')).toBe(false);
    expect(isPrehashedPassword(nodeSha256('a').toUpperCase())).toBe(false);
    expect(isPrehashedPassword(nodeSha256('a').slice(1))).toBe(false);
    expect(isPrehashedPassword(undefined)).toBe(false);
  });
});

describe('every password form uses the shared prehash', () => {
  const root = path.resolve(__dirname, '../../..');
  const FORMS = [
    'src/app/components/setup/SetupWizard.tsx',
    'src/app/login/LoginClient.tsx',
    'src/app/join/JoinClient.tsx',
    'src/app/reset-password/ResetPasswordClient.tsx',
    'src/app/components/auth/LoginModal.tsx',
  ];

  it.each(FORMS)('%s imports prehashPassword and has no local hash', (file) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    expect(source).toMatch(/import \{[^}]*\bprehashPassword\b[^}]*\} from '@\/app\/lib\/password-prehash'/);
    expect(source).not.toMatch(/crypto\.subtle/);
    expect(source).not.toMatch(/function hashPassword/);
  });

  it.each(FORMS)('%s never passes the raw password to an auth action', (file) => {
    const source = readFileSync(path.join(root, file), 'utf8');
    const calls = source.match(/\b(register|registerWithInvite|login|migratePassword|resetPassword)\(([^)]*)\)/g) ?? [];
    for (const call of calls) {
      expect(call).not.toMatch(/[(,]\s*password\s*[,)]/);
    }
  });
});
