import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';
import { buildSoul } from '@/app/config/allerac-soul';
import type { User } from '@/app/services/auth/auth.service';

const user = { id: 'u1', name: 'Gianclaudio', email: 'g@example.com', is_admin: true } as unknown as User;
const base = {
  user,
  locale: 'pt',
  userLocation: null,
  tavilyConfigured: false,
  now: new Date('2026-10-29T08:00:00Z'),
  timezone: 'Europe/Madrid',
};

describe('chat system prompt unit identity', () => {
  it('opens with the unit identity in the default chat domain', () => {
    const prompt = buildChatSystemPrompt({ ...base, domain: 'chat', unitIdentity: { displayName: 'Barcelona' } });
    expect(prompt).toMatch(/^You are Barcelona, an Allerac unit/);
    expect(prompt).not.toMatch(/You are Allerac,/);
  });

  it('lists paired units in private domains', () => {
    const prompt = buildChatSystemPrompt({
      ...base,
      domain: 'chat',
      unitIdentity: { displayName: 'Barcelona', pairedUnits: ['Santos (santos)'] },
    });
    expect(prompt).toContain('Paired Allerac Units you can contact: Santos (santos).');
    expect(prompt).toContain('list_peer_agents');
  });

  it('never lists paired units in public domains, even with identity opt-in', () => {
    const soul = buildSoul('openworld', { displayName: 'Barcelona', pairedUnits: ['santos'] });
    expect(soul).toMatch(/^You are Barcelona, an Allerac unit speaking with a visitor/);
    expect(soul).not.toContain('santos');
  });

  it('omits the paired line when there are no peers', () => {
    expect(buildSoul('chat', { displayName: 'Barcelona', pairedUnits: [] })).not.toContain('Paired Allerac Units');
  });
});
