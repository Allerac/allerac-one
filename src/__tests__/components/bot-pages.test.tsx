/**
 * @jest-environment node
 *
 * Multi-bot PR 4: `/agents/self/<slug>` and `/agents/self/<slug>/settings`.
 */
const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
jest.mock('next/navigation', () => ({ redirect: jest.fn(), notFound: () => mockNotFound() }));
jest.mock('@/app/lib/domain-access', () => ({ requireDomainAccess: jest.fn(async () => ({ id: 'u', is_admin: true })) }));
const mockAdmin = jest.fn();
jest.mock('@/app/lib/auth-session', () => ({ requireCurrentAdmin: () => mockAdmin() }));
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn() } }));
jest.mock('@/app/services/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({ canAccessDomain: async () => true })),
}));
jest.mock('@/app/services/agent/agent-tool-settings.repository', () => ({ loadAgentToolSettings: async () => ({ modules: {}, tools: {}, skills: {} }) }));
const mockGetUnitAgent = jest.fn();
jest.mock('@/app/services/agent/unit-agents.repository', () => ({ getUnitAgent: (slug: string) => mockGetUnitAgent(slug) }));
jest.mock('@/app/agents/_shell/LocalAgentClient', () => function LocalAgentClient() { return null; });
jest.mock('@/app/agents/[unit]/[agent]/AgentChatClient', () => function AgentChatClient() { return null; });
jest.mock('@/app/components/bots/BotForm', () => function BotForm() { return null; });

import AgentChatPage from '@/app/agents/[unit]/[agent]/page';
import BotSettingsPage from '@/app/agents/[unit]/[agent]/settings/page';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const args = (agent: string) => ({ params: Promise.resolve({ unit: 'self', agent }), searchParams: Promise.resolve({}) });
const doctor = (patch: Partial<UnitAgent> = {}) => ({
  slug: 'doctor', displayName: 'Doctor', emoji: '🩺', role: 'your health', isDefault: false, enabled: true, archivedAt: null,
  toolSettings: { modules: { health: true }, tools: {}, skills: {} }, ...patch,
});
type Element = { type: { name?: string }; props: Record<string, unknown> };

describe('bot pages', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ALLERAC_BOTS = 'true';
    mockAdmin.mockResolvedValue({ id: 'admin' });
  });
  afterEach(() => { process.env = { ...env }; });

  it('renders a bot chat with its slug, header and data pages', async () => {
    process.env.HEALTH_WORKER_SECRET = 'x';
    mockGetUnitAgent.mockResolvedValueOnce(doctor());
    const element = await AgentChatPage(args('doctor')) as unknown as Element;
    expect(element.type.name).toBe('LocalAgentClient');
    expect(element.props).toMatchObject({ botsEnabled: true, bot: { slug: 'doctor', displayName: 'Doctor', emoji: '🩺' } });
  });

  it('renders the creation form at /agents/self/new', async () => {
    const element = await AgentChatPage(args('new')) as unknown as Element;
    expect(element.type.name).toBe('BotForm');
    expect(mockGetUnitAgent).not.toHaveBeenCalled();
  });

  it('404s for unknown, archived and disabled bots, non-admins and with the flag off', async () => {
    mockGetUnitAgent.mockResolvedValueOnce(null);
    await expect(AgentChatPage(args('ghost'))).rejects.toThrow('NEXT_NOT_FOUND');
    mockGetUnitAgent.mockResolvedValueOnce(doctor({ archivedAt: '2026-11-27T00:00:00.000Z' }));
    await expect(AgentChatPage(args('doctor'))).rejects.toThrow('NEXT_NOT_FOUND');
    mockGetUnitAgent.mockResolvedValueOnce(doctor({ enabled: false }));
    await expect(AgentChatPage(args('doctor'))).rejects.toThrow('NEXT_NOT_FOUND');

    mockAdmin.mockRejectedValueOnce(new Error('forbidden'));
    await expect(AgentChatPage(args('doctor'))).rejects.toThrow('NEXT_NOT_FOUND');

    delete process.env.ALLERAC_BOTS;
    await expect(AgentChatPage(args('new'))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('keeps /agents/self/agent as the default agent', async () => {
    const element = await AgentChatPage(args('agent')) as unknown as Element;
    expect(element.type.name).toBe('LocalAgentClient');
    expect(element.props.bot).toBeUndefined();
    expect(element.props.botsEnabled).toBe(true);
    delete process.env.ALLERAC_BOTS;
    expect(((await AgentChatPage(args('agent'))) as unknown as Element).props.botsEnabled).toBe(false);
  });

  it('settings: edits bots (archived included), never the default agent', async () => {
    mockGetUnitAgent.mockResolvedValueOnce(doctor({ archivedAt: '2026-11-27T00:00:00.000Z' }));
    const element = await BotSettingsPage({ params: Promise.resolve({ unit: 'self', agent: 'doctor' }) }) as unknown as Element;
    expect(element.type.name).toBe('BotForm');
    expect((element.props.initial as { slug: string }).slug).toBe('doctor');

    mockGetUnitAgent.mockResolvedValueOnce({ ...doctor(), slug: 'chat', isDefault: true });
    await expect(BotSettingsPage({ params: Promise.resolve({ unit: 'self', agent: 'chat' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
