/** @jest-environment node */
import { agentDataPageIds, peerPageLinks } from '@/app/services/agent/agent-pages';
import { EMPTY_AGENT_TOOL_SETTINGS } from '@/app/services/agent/agent-tool-settings';
import { pagesForActiveAgent, type AgentItem } from '@/app/components/inbox/agents-format';

const env = { ALLERAC_MODULES: 'health,email,music', ALLERAC_PROFILE: 'personal' };

describe('agentDataPageIds', () => {
  it('lists pages of enabled modules whose capability is on (defaults apply)', () => {
    const ids = agentDataPageIds(EMPTY_AGENT_TOOL_SETTINGS, env);
    expect(ids).toEqual(expect.arrayContaining(['health', 'email', 'notes', 'jobs']));
    // Heavy modules start off.
    expect(ids).not.toContain('music');
  });

  it('follows the unit agent tool settings', () => {
    const ids = agentDataPageIds({ modules: { health: false, music: true }, tools: {}, skills: {} }, env);
    expect(ids).not.toContain('health');
    expect(ids).toContain('music');
  });

  it('never lists pages of modules disabled on the Unit', () => {
    const ids = agentDataPageIds({ modules: { health: true }, tools: {}, skills: {} }, { ...env, ALLERAC_MODULES: 'email' });
    expect(ids).not.toContain('health');
  });
});

describe('peerPageLinks', () => {
  it('links known pages to the peer origin and drops unknown ids', () => {
    expect(peerPageLinks(['health', 'bogus'], 'https://santos.example:8443/some/path')).toEqual([
      { id: 'health', label: 'Health', icon: '❤️', url: 'https://santos.example:8443/health' },
    ]);
  });

  it('shows nothing without a list or a usable origin', () => {
    expect(peerPageLinks(undefined, 'https://santos.example')).toEqual([]);
    expect(peerPageLinks(['health'], null)).toEqual([]);
    expect(peerPageLinks(['health'], 'javascript:alert(1)')).toEqual([]);
  });
});

describe('pagesForActiveAgent', () => {
  const local = [{ path: '/health', label: 'Health', icon: '❤️' }];
  const agent = (over: Partial<AgentItem>): AgentItem => ({
    key: 'santos/chat', peerId: 'p', unitName: 'santos', unitDisplayName: 'Santos', unitEmoji: null, unitRole: null,
    roleShort: null, status: 'online', slug: 'chat', name: 'Santos', available: true, unread: 0, pending: false,
    lastMessageAt: null, preview: null, defaultThreadId: null, threads: [], configureUrl: null,
    pages: [{ id: 'notes', label: 'Notes', icon: '📝', url: 'https://santos.example/notes' }], ...over,
  });

  it('uses local pages for this Unit\'s agent', () => {
    expect(pagesForActiveAgent('self', local, [agent({})])).toEqual([
      { id: '/health', label: 'Health', icon: '❤️', href: '/health', external: false },
    ]);
  });

  it('uses the peer pages for a remote agent, opening on the peer', () => {
    expect(pagesForActiveAgent('santos/chat', local, [agent({})])).toEqual([
      { id: 'notes', label: 'Notes', icon: '📝', href: 'https://santos.example/notes', external: true },
    ]);
  });

  it('shows nothing for an unknown or offline remote agent', () => {
    expect(pagesForActiveAgent('barcelona/chat', local, [agent({})])).toEqual([]);
    expect(pagesForActiveAgent('santos/chat', local, [agent({ status: 'offline' })])).toEqual([]);
  });
});
