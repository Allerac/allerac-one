/** @jest-environment node */
import {
  DEFAULT_AGENT_SLUG,
  MAX_AGENT_INSTRUCTIONS_CHARS,
  RESERVED_AGENT_SLUGS,
  createUnitAgentSchema,
  defaultAgentFromProfile,
  lockedDefaultAgentFields,
  resolveUnitAgent,
  slugProblem,
  sortUnitAgents,
  updateUnitAgentSchema,
  type UnitAgentRow,
} from '@/app/services/agent/unit-agents';
import { EMPTY_AGENT_TOOL_SETTINGS } from '@/app/services/agent/agent-tool-settings';
import type { UnitProfile } from '@/federation/unit-profile';

const profile: UnitProfile = {
  name: 'napols', displayName: 'Napols', emoji: '🌋', role: 'personal', description: 'Home unit',
  tags: [], agentDescriptions: {}, identityInPublicDomains: false, instructions: 'Be brief.',
};
const unitTools = { modules: {}, tools: { save_note: false }, skills: {} };

const row = (patch: Partial<UnitAgentRow> = {}): UnitAgentRow => ({
  id: 'id-1', slug: 'doctor', displayName: 'Doctor', emoji: '🩺', avatarUrl: null, role: 'health', description: null,
  instructions: 'Ask about symptoms.', isDefault: false, enabled: true, sortOrder: 0,
  toolSettings: EMPTY_AGENT_TOOL_SETTINGS, memoryMode: 'isolated', shareMemoriesByDefault: false, canCall: [], modelId: null, modelProvider: null,
  cloudAllowed: true, defaultSkillId: null, federationExposed: false, template: null, archivedAt: null,
  createdAt: '2026-11-27T10:00:00.000Z', updatedAt: null, ...patch,
});

describe('slugProblem', () => {
  it('accepts simple kebab-case slugs', () => {
    expect(slugProblem('doctor')).toBeNull();
    expect(slugProblem('gian-dentist')).toBeNull();
    expect(slugProblem('trainer2')).toBeNull();
  });

  it('rejects bad formats', () => {
    for (const slug of ['', 'Doctor', '-doctor', 'doc tor', 'doc_tor', 'é', 'a'.repeat(64)]) {
      expect(slugProblem(slug)).toBe('invalid_format');
    }
  });

  it('rejects the default slug, legacy domains and agents UI words', () => {
    for (const slug of [DEFAULT_AGENT_SLUG, 'agent', 'self', 'new', 'health', 'notes', 'tickets', 'jobs', 'openworld', 'alleracweb', 'api']) {
      expect(slugProblem(slug)).toBe('reserved');
    }
  });

  it('reserves every public domain', () => {
    expect(RESERVED_AGENT_SLUGS.has('openworld')).toBe(true);
    expect(RESERVED_AGENT_SLUGS.has('alleracweb')).toBe(true);
  });
});

describe('createUnitAgentSchema', () => {
  it('requires a slug and a display name', () => {
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'Doctor' }).success).toBe(true);
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor' }).success).toBe(false);
    expect(createUnitAgentSchema.safeParse({ displayName: 'Doctor' }).success).toBe(false);
  });

  it('rejects reserved slugs and self calls', () => {
    expect(createUnitAgentSchema.safeParse({ slug: 'health', displayName: 'Health' }).success).toBe(false);
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'D', canCall: ['doctor'] }).success).toBe(false);
  });

  it('caps instructions at 8000 characters', () => {
    const ok = 'x'.repeat(MAX_AGENT_INSTRUCTIONS_CHARS);
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'D', instructions: ok }).success).toBe(true);
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'D', instructions: `${ok}x` }).success).toBe(false);
  });

  it('only accepts known memory modes and no unknown keys', () => {
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'D', memoryMode: 'everything' }).success).toBe(false);
    expect(createUnitAgentSchema.safeParse({ slug: 'doctor', displayName: 'D', isDefault: true }).success).toBe(false);
  });
});

describe('updateUnitAgentSchema', () => {
  it('does not allow changing the slug', () => {
    expect(updateUnitAgentSchema.safeParse({ slug: 'other' }).success).toBe(false);
    expect(updateUnitAgentSchema.safeParse({ role: 'shopping' }).success).toBe(true);
  });
});

describe('lockedDefaultAgentFields', () => {
  it('lists the profile-owned fields an update touches', () => {
    expect(lockedDefaultAgentFields({ sortOrder: 2, modelId: 'qwen' })).toEqual([]);
    expect(lockedDefaultAgentFields({ displayName: 'X', instructions: 'Y', enabled: false })).toEqual(['displayName', 'instructions', 'enabled']);
  });
});

describe('resolveUnitAgent', () => {
  it('takes identity, instructions and tools of the default bot from the Unit profile', () => {
    const agent = resolveUnitAgent(row({ slug: 'chat', isDefault: true, displayName: null, instructions: null, modelId: 'qwen' }), profile, unitTools);
    expect(agent).toMatchObject({
      slug: 'chat', isDefault: true, displayName: 'Napols', emoji: '🌋', role: 'personal',
      instructions: 'Be brief.', toolSettings: unitTools, modelId: 'qwen', enabled: true, archivedAt: null,
    });
  });

  it('keeps a regular bot as stored, falling back to the slug for an empty name', () => {
    expect(resolveUnitAgent(row(), profile, unitTools)).toMatchObject({ displayName: 'Doctor', instructions: 'Ask about symptoms.', toolSettings: EMPTY_AGENT_TOOL_SETTINGS });
    expect(resolveUnitAgent(row({ displayName: '  ' }), profile, unitTools).displayName).toBe('doctor');
  });
});

describe('defaultAgentFromProfile', () => {
  it('builds the default bot without a row', () => {
    expect(defaultAgentFromProfile(profile, unitTools)).toMatchObject({
      slug: 'chat', isDefault: true, displayName: 'Napols', instructions: 'Be brief.', memoryMode: 'all', shareMemoriesByDefault: true, federationExposed: false,
    });
  });
});

describe('sortUnitAgents', () => {
  it('puts the default bot first, then sort order, then creation time', () => {
    const sorted = sortUnitAgents([
      row({ slug: 'late', sortOrder: 0, createdAt: '2026-11-27T12:00:00.000Z' }),
      row({ slug: 'early', sortOrder: 0, createdAt: '2026-11-27T09:00:00.000Z' }),
      row({ slug: 'first', sortOrder: -1 }),
      row({ slug: 'chat', isDefault: true, sortOrder: 5 }),
    ]);
    expect(sorted.map((agent) => agent.slug)).toEqual(['chat', 'first', 'early', 'late']);
  });
});
