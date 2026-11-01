/** @jest-environment node */
const mockSave = jest.fn();
const mockLoad = jest.fn();
jest.mock('@/app/api/v1/_lib/auth', () => ({ requireSessionAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }) }));
jest.mock('@/federation/unit-profile.repository', () => ({
  loadUnitProfileRow: () => mockLoad(),
  saveUnitProfile: (input: unknown, userId: string) => mockSave(input, userId),
}));

import { GET, PUT } from '@/app/api/v1/unit/profile/route';

const stored = {
  displayName: 'Santos', emoji: '🏖️', role: 'research', description: null, tags: [], agentDescriptions: {},
  identityInPublicDomains: null, instructions: 'Be brief.', updatedAt: null,
};
const put = (body: unknown) => PUT(new Request('http://x/api/v1/unit/profile', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

describe('/api/v1/unit/profile', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; jest.clearAllMocks(); });

  it('saves instructions and reports the single agent', async () => {
    process.env.ALLERAC_SINGLE_AGENT = 'true';
    mockSave.mockResolvedValueOnce(stored);
    const response = await put({ instructions: 'Be brief.' });
    expect(response.status).toBe(200);
    expect(mockSave).toHaveBeenCalledWith({ instructions: 'Be brief.' }, 'admin-1');
    const { data } = await response.json();
    expect(data).toMatchObject({ exposedAgents: ['chat'], singleAgent: true, effective: { instructions: 'Be brief.' } });
  });

  it('rejects instructions over 4000 characters', async () => {
    const response = await put({ instructions: 'x'.repeat(4001) });
    expect(response.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('lists the legacy agents when the flag is off', async () => {
    process.env.ALLERAC_FEDERATION_AGENTS = 'health';
    delete process.env.ALLERAC_SINGLE_AGENT;
    mockLoad.mockResolvedValueOnce(stored);
    const { data } = await (await GET()).json();
    expect(data).toMatchObject({ exposedAgents: ['health'], singleAgent: false });
  });
});
