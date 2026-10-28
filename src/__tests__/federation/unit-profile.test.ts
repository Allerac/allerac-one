/** @jest-environment node */

import {
  soulIdentityFor, peerUnitProfileSchema, resolveUnitProfile, shouldInjectIdentity,
  toPeerProfile, unitProfileInputSchema, type UnitProfileRow,
} from '@/federation/unit-profile';
import { buildSoul } from '@/app/config/allerac-soul';
import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';

const row = (patch: Partial<UnitProfileRow> = {}): UnitProfileRow => ({
  displayName: null, emoji: null, role: null, description: null, tags: [],
  agentDescriptions: {}, identityInPublicDomains: null, updatedAt: null, ...patch,
});

describe('resolveUnitProfile', () => {
  it('falls back to env, then to the capitalized unit name', () => {
    expect(resolveUnitProfile(null, { ALLERAC_UNIT_NAME: 'barcelona' })).toMatchObject({
      name: 'barcelona', displayName: 'Barcelona', role: null, identityInPublicDomains: false,
    });
    expect(resolveUnitProfile(null, {
      ALLERAC_UNIT_NAME: 'santos', ALLERAC_UNIT_DISPLAY_NAME: 'Santos HQ',
      ALLERAC_UNIT_ROLE: 'my documents', ALLERAC_UNIT_DESCRIPTION: 'Papers', ALLERAC_UNIT_IDENTITY_PUBLIC: 'true',
    })).toMatchObject({ displayName: 'Santos HQ', role: 'my documents', description: 'Papers', identityInPublicDomains: true });
  });

  it('prefers stored values, including an explicit false toggle', () => {
    const profile = resolveUnitProfile(
      row({ displayName: 'Barça', role: 'project X', identityInPublicDomains: false }),
      { ALLERAC_UNIT_NAME: 'barcelona', ALLERAC_UNIT_ROLE: 'env role', ALLERAC_UNIT_IDENTITY_PUBLIC: 'true' },
    );
    expect(profile).toMatchObject({ displayName: 'Barça', role: 'project X', identityInPublicDomains: false });
  });
});

describe('peer profile', () => {
  it('never shares local-only fields', () => {
    const peer = toPeerProfile(resolveUnitProfile(
      row({ role: 'medical', agentDescriptions: { health: 'x' }, identityInPublicDomains: true }),
      { ALLERAC_UNIT_NAME: 'barcelona' },
    ));
    expect(peer).not.toHaveProperty('identityInPublicDomains');
    expect(peer).not.toHaveProperty('agentDescriptions');
    expect(peerUnitProfileSchema.safeParse(peer).success).toBe(true);
  });
});

describe('identity injection', () => {
  const base = resolveUnitProfile(row({ role: 'my medical matters', agentDescriptions: { health: 'Lab results.' } }), { ALLERAC_UNIT_NAME: 'barcelona' });

  it('injects for private domains and skips public ones unless opted in', () => {
    expect(shouldInjectIdentity('health', base)).toBe(true);
    expect(shouldInjectIdentity('sales', base)).toBe(false);
    expect(shouldInjectIdentity('openworld', base)).toBe(false);
    expect(shouldInjectIdentity('sales', { ...base, identityInPublicDomains: true })).toBe(true);
  });

  it('makes the Soul identity-aware', () => {
    const soul = buildSoul('health', soulIdentityFor(base, 'health'));
    expect(soul.startsWith('You are Barcelona, an Allerac unit')).toBe(true);
    expect(soul).toContain('say you are Barcelona and that you take care of my medical matters');
    expect(soul).toContain('Lab results.');
    expect(buildSoul('health')).toMatch(/^You are Allerac, a private AI assistant/);
  });

  it('keeps public domains generic unless the toggle is on', () => {
    expect(soulIdentityFor(base, 'sales')).toBeUndefined();
    expect(buildSoul('sales', soulIdentityFor(base, 'sales'))).toMatch(/^You are Allerac, an AI assistant speaking with a visitor/);
    const optedIn = soulIdentityFor({ ...base, identityInPublicDomains: true }, 'openworld');
    expect(buildSoul('openworld', optedIn)).toMatch(/^You are Barcelona, an Allerac unit speaking with a visitor/);
  });

  it('lands in the chat system prompt', () => {
    const prompt = buildChatSystemPrompt({
      user: { id: 'u', email: 'e', name: 'G' } as never, locale: 'en', domain: 'health',
      userLocation: null, tavilyConfigured: false, unitIdentity: soulIdentityFor(base, 'health'),
    });
    expect(prompt.startsWith('You are Barcelona')).toBe(true);
  });
});

describe('unitProfileInputSchema', () => {
  it('rejects unknown fields and bad agent slugs', () => {
    expect(unitProfileInputSchema.safeParse({ role: 'x', extra: 1 }).success).toBe(false);
    expect(unitProfileInputSchema.safeParse({ agentDescriptions: { 'Bad Slug': 'x' } }).success).toBe(false);
    expect(unitProfileInputSchema.safeParse({ role: 'docs', tags: ['a'], identityInPublicDomains: true }).success).toBe(true);
  });
});
