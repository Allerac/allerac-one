/** @jest-environment node */

import '../__mocks__/db';
import pool from '@/app/clients/db';
import { GET } from '@/app/.well-known/allerac/route';

jest.mock('@/app/lib/build-info', () => ({
  readBuildInfo: jest.fn().mockResolvedValue({ release: '0.1.0', commit: 'abc123', date: '2026-10-28' }),
}));

const ORIGINAL_ENV = process.env;

describe('GET /.well-known/allerac', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ALLERAC_FEDERATION_MANIFEST;
    jest.clearAllMocks();
  });
  afterAll(() => { process.env = ORIGINAL_ENV; });

  it('returns the manifest without auth or database access', async () => {
    const response = await GET(new Request('https://unit1.allerac.ai/.well-known/allerac'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = await response.json();
    expect(body).toMatchObject({ allerac: 'federation', protocolVersion: '1', software: { release: '0.1.0' } });
    expect(JSON.stringify(body)).not.toContain('abc123');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when disabled', async () => {
    process.env.ALLERAC_FEDERATION_MANIFEST = 'false';
    const response = await GET(new Request('https://unit1.allerac.ai/.well-known/allerac'));
    expect(response.status).toBe(404);
  });
});
