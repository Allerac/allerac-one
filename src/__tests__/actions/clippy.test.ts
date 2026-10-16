/** @jest-environment node */

/* eslint-disable @typescript-eslint/no-require-imports */
import { requireCurrentUser, assertDomainAccess } from '@/app/lib/auth-session';

type ClippyModule = typeof import('@/app/actions/clippy');

// Load a fresh module per test so the once-per-process warning state resets.
let generateClippyBubble: ClippyModule['generateClippyBubble'];
let isGrampeadorEnabled: ClippyModule['isGrampeadorEnabled'];

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentUser: jest.fn(),
  assertDomainAccess: jest.fn(),
}));

const mockFetch = jest.fn();
const originalFetch = global.fetch;
const originalEnv = process.env.GRAMPEADOR_ENABLED;

beforeEach(async () => {
  jest.mocked(requireCurrentUser).mockResolvedValue({ id: 'u1' } as never);
  jest.mocked(assertDomainAccess).mockResolvedValue(undefined as never);
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  delete process.env.GRAMPEADOR_ENABLED;
  jest.isolateModules(() => {
    ({ generateClippyBubble, isGrampeadorEnabled } = require('@/app/actions/clippy'));
  });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalEnv === undefined) delete process.env.GRAMPEADOR_ENABLED;
  else process.env.GRAMPEADOR_ENABLED = originalEnv;
});

describe('Grampeador bubbles', () => {
  it('is enabled by default', async () => {
    expect(await isGrampeadorEnabled()).toBe(true);
  });

  it('returns null without calling Ollama when GRAMPEADOR_ENABLED=false', async () => {
    process.env.GRAMPEADOR_ENABLED = 'false';
    expect(await isGrampeadorEnabled()).toBe(false);
    expect(await generateClippyBubble('hub', 'en')).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('still checks auth when disabled', async () => {
    process.env.GRAMPEADOR_ENABLED = 'false';
    await generateClippyBubble('hub', 'en');
    expect(requireCurrentUser).toHaveBeenCalled();
    expect(assertDomainAccess).toHaveBeenCalled();
  });

  it('returns the generated text when Ollama answers', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ response: 'Hello there' }) });
    expect(await generateClippyBubble('hub', 'en')).toBe('Hello there');
  });

  it('warns only once per process when Ollama keeps failing', async () => {
    mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND ollama'));
    expect(await generateClippyBubble('hub', 'en')).toBeNull();
    expect(await generateClippyBubble('hub', 'en')).toBeNull();
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    expect(await generateClippyBubble('hub', 'en')).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
