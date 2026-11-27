/** @jest-environment node */
import {
  BotModelError,
  botSoulIdentity,
  botsEnabled,
  enabledBotCapabilities,
  explicitBotToolSettings,
  isCandidateBotSlug,
  isRunnableBot,
  resolveBotModel,
} from '@/app/services/agent/bot-runtime';
import { buildSoul } from '@/app/config/allerac-soul';
import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';
import type { UnitAgent } from '@/app/services/agent/unit-agents';
import type { UnitProfile } from '@/federation/unit-profile';
import type { User } from '@/app/services/auth/auth.service';

const profile: UnitProfile = {
  name: 'napols', displayName: 'Napols', emoji: null, role: 'personal assistant', description: null,
  tags: [], agentDescriptions: {}, identityInPublicDomains: false, instructions: 'Unit-level rules.',
};

const bot = (patch: Partial<UnitAgent> = {}): UnitAgent => ({
  id: 'id', slug: 'doctor', displayName: 'Gian Doctor', emoji: '🩺', avatarUrl: null, role: 'your health',
  description: null, instructions: 'Ask about symptoms first.', isDefault: false, enabled: true, sortOrder: 0,
  toolSettings: { modules: { health: true }, tools: {}, skills: {} }, memoryMode: 'isolated', shareMemoriesByDefault: false, canCall: [],
  modelId: null, modelProvider: null, cloudAllowed: true, defaultSkillId: null, federationExposed: false,
  template: null, archivedAt: null, createdAt: null, updatedAt: null, ...patch,
});

describe('flag and slug checks', () => {
  it('is off unless ALLERAC_BOTS=true', () => {
    expect(botsEnabled({})).toBe(false);
    expect(botsEnabled({ ALLERAC_BOTS: '1' })).toBe(false);
    expect(botsEnabled({ ALLERAC_BOTS: 'true' })).toBe(true);
  });

  it('never treats the default or public slugs as bots', () => {
    const on = { ALLERAC_BOTS: 'true' };
    expect(isCandidateBotSlug('doctor', on)).toBe(true);
    expect(isCandidateBotSlug('doctor', {})).toBe(false);
    for (const slug of ['chat', 'openworld', 'alleracweb', '', null, undefined]) expect(isCandidateBotSlug(slug, on)).toBe(false);
  });

  it('runs only enabled, non-archived, non-default bots', () => {
    expect(isRunnableBot(bot())).toBe(true);
    expect(isRunnableBot(bot({ enabled: false }))).toBe(false);
    expect(isRunnableBot(bot({ archivedAt: '2026-11-27T00:00:00.000Z' }))).toBe(false);
    expect(isRunnableBot(bot({ isDefault: true }))).toBe(false);
    expect(isRunnableBot(null)).toBe(false);
  });
});

describe('explicit tool settings', () => {
  it('turns every unchecked capability off, including default-on ones', () => {
    const explicit = explicitBotToolSettings({ modules: { health: true }, tools: { x: false }, skills: {} });
    expect(explicit.modules.health).toBe(true);
    expect(explicit.modules.notes).toBe(false);
    expect(explicit.modules.memory).toBe(false);
    expect(explicit.tools).toEqual({ x: false });
  });

  it('lists the enabled capabilities', () => {
    expect(enabledBotCapabilities({ modules: { notes: true, tickets: false }, tools: {}, skills: {} })).toEqual(['notes']);
  });
});

describe('model choice', () => {
  const resolved = { modelId: 'gpt-4o', provider: 'github' };

  it('keeps the resolved model when the bot has none', () => {
    expect(resolveBotModel(bot(), resolved)).toEqual(resolved);
  });

  it('uses the bot model when set', () => {
    expect(resolveBotModel(bot({ modelId: 'qwen2.5:3b' }), resolved)).toEqual({ modelId: 'qwen2.5:3b', provider: 'ollama' });
  });

  it('rejects unknown models', () => {
    expect(() => resolveBotModel(bot({ modelId: 'nope' }), resolved)).toThrow(BotModelError);
  });

  it('never runs a local-only bot on a cloud model', () => {
    expect(() => resolveBotModel(bot({ cloudAllowed: false }), resolved)).toThrow(expect.objectContaining({ code: 'cloud_not_allowed' }));
    expect(resolveBotModel(bot({ cloudAllowed: false, modelId: 'qwen2.5:3b' }), resolved).provider).toBe('ollama');
  });
});

describe('bot soul', () => {
  const siblings = [bot({ slug: 'agenda', displayName: 'Gian Agenda', role: 'your calendar' }), bot({ slug: 'compras', displayName: 'Compras', role: null })];

  it('introduces the bot as one of the Unit assistants, with its own instructions', () => {
    const soul = buildSoul('doctor', botSoulIdentity(bot(), profile));
    expect(soul).toMatch(/^You are Gian Doctor, one of the assistants of Napols, a private Allerac unit\./);
    expect(soul).toContain('say you are Gian Doctor and that you take care of your health');
    expect(soul).toContain('Ask about symptoms first.');
    expect(soul).not.toContain('Unit-level rules.');
  });

  it('keeps the health guidance only when health is checked', () => {
    expect(buildSoul('doctor', botSoulIdentity(bot(), profile))).toContain('use the health tools');
    const shopper = bot({ slug: 'compras', displayName: 'Compras', role: 'shopping', toolSettings: { modules: { notes: true }, tools: {}, skills: {} } });
    expect(buildSoul('compras', botSoulIdentity(shopper, profile))).not.toContain('health');
  });

  it('lists only allowed, runnable siblings', () => {
    const withSiblings = botSoulIdentity(bot({ canCall: ['agenda'] }), profile, siblings);
    expect(withSiblings.siblings).toEqual([{ name: 'Gian Agenda', role: 'your calendar' }]);
    expect(buildSoul('doctor', withSiblings)).toContain('Other assistants in this Unit: Gian Agenda (your calendar).');
    expect(buildSoul('doctor', botSoulIdentity(bot(), profile, siblings))).not.toContain('Other assistants');
    const archived = [bot({ slug: 'agenda', archivedAt: '2026-11-27T00:00:00.000Z' })];
    expect(botSoulIdentity(bot({ canCall: ['agenda'] }), profile, archived).siblings).toEqual([]);
  });

  it('leaves the default agent soul unchanged', () => {
    const identity = { displayName: 'Napols', role: 'personal assistant', instructions: 'Unit-level rules.' };
    const soul = buildSoul('chat', identity);
    expect(soul).toMatch(/^You are Napols, an Allerac unit: a private AI assistant\./);
    expect(soul).toContain('- When asked about health or fitness: use the health tools.\n');
    expect(buildSoul('chat')).toMatch(/^You are Allerac, a private AI assistant\./);
  });

  it('flows through the chat system prompt', () => {
    const prompt = buildChatSystemPrompt({
      user: { id: 'u', name: 'Gian' } as User, locale: 'pt', domain: 'doctor', userLocation: null,
      tavilyConfigured: false, unitIdentity: botSoulIdentity(bot(), profile), now: new Date('2026-11-27T15:00:00Z'),
    });
    expect(prompt).toContain('You are Gian Doctor, one of the assistants of Napols');
    expect(prompt).toContain('- Name: Gian');
  });
});
