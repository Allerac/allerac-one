/** @jest-environment node */
const mockGetUnitAgent = jest.fn();
jest.mock('@/app/services/agent/unit-agents.repository', () => ({ getUnitAgent: (slug: string) => mockGetUnitAgent(slug) }));

import { botMemoryScope, domainMemoryScope, resolveMemoryScope } from '@/app/services/memory/memory-scope';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const bot = (patch: Partial<UnitAgent> = {}): UnitAgent => ({
  id: 'id', slug: 'doctor', displayName: 'Doctor', emoji: null, avatarUrl: null, role: null, description: null,
  instructions: null, isDefault: false, enabled: true, sortOrder: 0, toolSettings: { modules: {}, tools: {}, skills: {} },
  memoryMode: 'isolated', shareMemoriesByDefault: false, canCall: [], modelId: null, modelProvider: null, cloudAllowed: true,
  defaultSkillId: null, federationExposed: false, template: null, archivedAt: null, createdAt: null, updatedAt: null, ...patch,
});

describe('memory scope for bots', () => {
  const env = { ...process.env };
  beforeEach(() => mockGetUnitAgent.mockReset());
  afterEach(() => { process.env = { ...env }; });

  it('keeps the default agent and legacy domains unchanged', () => {
    expect(domainMemoryScope('chat')).toEqual({ domainSlug: null, includeShared: false, includeNotes: false, memories: true, locked: false, writeShared: true });
    expect(domainMemoryScope('chat', { federated: true }).domainSlug).toBe('chat');
    expect(domainMemoryScope('health').domainSlug).toBe('health');
  });

  it('isolated: own slug plus shared, locked, private writes', () => {
    expect(botMemoryScope(bot())).toEqual({ domainSlug: 'doctor', includeShared: true, includeNotes: false, memories: true, locked: true, writeShared: false });
  });

  it('all, none, notes capability and share-by-default', () => {
    expect(botMemoryScope(bot({ memoryMode: 'all' }))).toMatchObject({ domainSlug: null, locked: true });
    expect(botMemoryScope(bot({ memoryMode: 'none' }))).toMatchObject({ memories: false, includeShared: false });
    expect(botMemoryScope(bot({ toolSettings: { modules: { notes: true }, tools: {}, skills: {} } })).includeNotes).toBe(true);
    expect(botMemoryScope(bot({ shareMemoriesByDefault: true })).writeShared).toBe(true);
  });

  it('looks bots up only with the flag on, never for peers or the default slug', async () => {
    mockGetUnitAgent.mockResolvedValue(bot());
    expect((await resolveMemoryScope('doctor')).locked).toBe(false);
    expect(mockGetUnitAgent).not.toHaveBeenCalled();

    process.env.ALLERAC_BOTS = 'true';
    expect((await resolveMemoryScope('doctor')).locked).toBe(true);
    expect((await resolveMemoryScope('doctor', { federated: true })).locked).toBe(false);
    expect((await resolveMemoryScope('chat')).locked).toBe(false);
    expect(mockGetUnitAgent).toHaveBeenCalledTimes(1);
  });

  it('an archived bot reads nothing; an unknown slug is a legacy domain', async () => {
    process.env.ALLERAC_BOTS = 'true';
    mockGetUnitAgent.mockResolvedValueOnce(bot({ archivedAt: '2026-11-27T00:00:00.000Z' }));
    expect((await resolveMemoryScope('doctor')).memories).toBe(false);
    mockGetUnitAgent.mockResolvedValueOnce(null);
    expect(await resolveMemoryScope('health')).toEqual(domainMemoryScope('health'));
  });
});
