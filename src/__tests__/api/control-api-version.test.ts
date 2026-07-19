/** @jest-environment node */

import fs from 'fs/promises';
import { readBuildInfo } from '@/app/lib/build-info';
import { GET } from '@/app/api/v1/version/route';

const mockReadFile = jest.spyOn(fs, 'readFile');

describe('Control API v1 version', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns public deployment identity without caching', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      commit: '0d1cf337b6139af859e0ce6bc6498e6f0add6688',
      date: '2026-07-18T14:30:59Z',
      release: 'v0.0.13',
    }));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(await response.json()).toEqual({
      data: {
        release: 'v0.0.13',
        commit: '0d1cf337b6139af859e0ce6bc6498e6f0add6688',
        builtAt: '2026-07-18T14:30:59Z',
      },
    });
  });

  it('returns safe fallback values when build info is unavailable', async () => {
    mockReadFile.mockRejectedValue(new Error('missing build-info.json'));

    await expect(readBuildInfo()).resolves.toEqual({
      commit: 'unknown',
      date: 'unknown',
      release: 'unreleased',
    });
  });

  it('normalizes missing or invalid build fields', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({
      commit: 123,
      date: '',
      release: 'v0.0.13',
    }));

    await expect(readBuildInfo()).resolves.toEqual({
      commit: 'unknown',
      date: 'unknown',
      release: 'v0.0.13',
    });
  });
});
