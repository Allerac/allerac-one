jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));

import pool from '@/app/clients/db';
import { loadChatSoulIdentity } from '@/federation/unit-profile.repository';
import { listActivePeerLabels, resetPeerPresenceCacheForTests } from '@/federation/peer-presence';

const query = (pool as unknown as { query: jest.Mock }).query;

describe('loadChatSoulIdentity', () => {
  const OLD = process.env.ALLERAC_UNIT_NAME;
  beforeEach(() => {
    query.mockReset();
    resetPeerPresenceCacheForTests();
    process.env.ALLERAC_UNIT_NAME = 'barcelona';
  });
  afterAll(() => { process.env.ALLERAC_UNIT_NAME = OLD; });

  it('falls back to the capitalized unit name with no saved profile', async () => {
    query.mockResolvedValue({ rows: [] });
    const identity = await loadChatSoulIdentity('chat', false, async () => ['santos']);
    expect(identity?.displayName).toBe('Barcelona');
    expect(identity?.pairedUnits).toBeUndefined();
  });

  it('adds paired units only when federation is offered', async () => {
    query.mockResolvedValue({ rows: [] });
    const identity = await loadChatSoulIdentity('chat', true, async () => ['santos']);
    expect(identity?.pairedUnits).toEqual(['santos']);
  });

  it('keeps the identity when listing peers fails', async () => {
    query.mockResolvedValue({ rows: [] });
    const identity = await loadChatSoulIdentity('chat', true, async () => { throw new Error('db'); });
    expect(identity?.displayName).toBe('Barcelona');
  });

  it('formats active peer labels', async () => {
    query.mockResolvedValue({ rows: [{ unit_name: 'santos', display_name: 'Santos HQ' }, { unit_name: 'napols', display_name: 'Napols' }] });
    await expect(listActivePeerLabels()).resolves.toEqual(['Santos HQ (santos)', 'napols']);
  });
});
