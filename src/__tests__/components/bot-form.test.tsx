/** Multi-bot PR 4: the "New bot" / edit form and the sidebar section. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/app/context/ThemeContext', () => ({ useTheme: () => ({ isDark: false }) }));

import BotForm from '@/app/components/bots/BotForm';
import MyBotsSection from '@/app/components/bots/MyBotsSection';
import { BOT_TEMPLATES, slugFromName } from '@/app/services/agent/bot-templates';
import { createUnitAgentSchema, RESERVED_AGENT_SLUGS } from '@/app/services/agent/unit-agents';
import { CORE_CAPABILITIES } from '@/app/services/agent/agent-tool-settings';

const CAPABILITIES = [
  { id: 'health', label: 'Health', kind: 'module' },
  { id: 'email', label: 'Email', kind: 'module' },
  { id: 'notes', label: 'Notes', kind: 'core' },
  { id: 'jobs', label: 'Scheduled jobs', kind: 'core' },
];

function mockFetch(routes: Record<string, (init?: RequestInit) => unknown>) {
  global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(url)}`;
    const handler = routes[key];
    const result = (handler ? handler(init) : { status: 500, body: { error: { code: 'not_mocked', message: key } } }) as { status?: number; body: unknown };
    const status = result.status ?? 200;
    // jsdom has no global Response: return the subset bots-api reads.
    return { ok: status >= 200 && status < 300, status, json: async () => result.body } as unknown as Response;
  }) as typeof fetch;
}

describe('bot templates', () => {
  it('every template validates and uses only known capability ids', () => {
    const known = new Set(['health', 'email', 'music', 'social', ...CORE_CAPABILITIES.map((c) => c.id)]);
    for (const template of BOT_TEMPLATES.filter((t) => t.slug)) {
      expect(RESERVED_AGENT_SLUGS.has(template.slug)).toBe(false);
      expect(createUnitAgentSchema.safeParse({ slug: template.slug, displayName: template.displayName, instructions: template.instructions }).success).toBe(true);
      for (const id of template.capabilities) expect(known.has(id)).toBe(true);
    }
  });

  it('derives slugs from names', () => {
    expect(slugFromName('Gian Dentista')).toBe('gian-dentista');
    expect(slugFromName('  Nutrição & Saúde! ')).toBe('nutricao-saude');
  });
});

describe('BotForm', () => {
  beforeEach(() => mockPush.mockReset());

  it('creates a bot from a template with explicit tool toggles', async () => {
    let created: Record<string, unknown> | null = null;
    mockFetch({
      'GET /api/v1/unit/agent-tools': () => ({ body: { data: { capabilities: CAPABILITIES } } }),
      'POST /api/v1/unit/agents': (init) => { created = JSON.parse(String(init?.body)); return { status: 201, body: { data: { slug: 'doctor' } } }; },
    });
    render(<BotForm />);
    fireEvent.click(screen.getByTestId('template-doctor'));
    await waitFor(() => expect(screen.getByTestId('cap-health')).toBeChecked());
    expect(screen.getByTestId('cap-email')).not.toBeChecked();
    expect(screen.getByTestId('local-only')).toBeChecked();

    fireEvent.click(screen.getByTestId('cap-notes'));
    fireEvent.click(screen.getByTestId('save-bot'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/agents/self/doctor'));
    expect(created).toMatchObject({
      slug: 'doctor', displayName: 'Doctor', template: 'doctor', memoryMode: 'isolated', cloudAllowed: false,
      toolSettings: { modules: { health: true, email: false, notes: false, jobs: false } },
    });
  });

  it('suggests the slug from the name on a blank bot and shows API slug errors', async () => {
    mockFetch({
      'GET /api/v1/unit/agent-tools': () => ({ body: { data: { capabilities: CAPABILITIES } } }),
      'POST /api/v1/unit/agents': () => ({ status: 409, body: { error: { code: 'slug_taken', message: 'taken' } } }),
    });
    render(<BotForm />);
    fireEvent.click(screen.getByTestId('template-blank'));
    fireEvent.change(screen.getByTestId('bot-name'), { target: { value: 'Gian Dentista' } });
    expect(screen.getByTestId('bot-slug')).toHaveValue('gian-dentista');
    fireEvent.click(screen.getByTestId('save-bot'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another bot already uses this slug.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('edits a bot without changing its slug, and archives it', async () => {
    let patched: Record<string, unknown>[] = [];
    mockFetch({
      'GET /api/v1/unit/agent-tools': () => ({ body: { data: { capabilities: CAPABILITIES } } }),
      'PATCH /api/v1/unit/agents/doctor': (init) => { patched = [...patched, JSON.parse(String(init?.body))]; return { body: { data: { slug: 'doctor' } } }; },
    });
    const bot = {
      id: 'id', slug: 'doctor', displayName: 'Doctor', emoji: '🩺', avatarUrl: null, role: 'health', description: null,
      instructions: 'x', isDefault: false, enabled: true, sortOrder: 0, toolSettings: { modules: { health: true }, tools: {}, skills: {} },
      memoryMode: 'isolated' as const, shareMemoriesByDefault: false, canCall: [], modelId: null, modelProvider: null, cloudAllowed: true,
      defaultSkillId: null, federationExposed: false, template: null, archivedAt: null, createdAt: null, updatedAt: null,
    };
    render(<BotForm initial={bot} />);
    expect(screen.getByTestId('bot-slug')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('cap-health')).toBeChecked());
    fireEvent.click(screen.getByTestId('save-bot'));
    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).not.toHaveProperty('slug');

    await waitFor(() => expect(screen.getByTestId('archive-bot')).toBeEnabled());
    fireEvent.click(screen.getByTestId('archive-bot'));
    await waitFor(() => expect(patched[1]).toEqual({ archived: true }));
  });
});

describe('MyBotsSection', () => {
  it('lists the non-default, enabled bots with a link to create more', async () => {
    mockFetch({
      'GET /api/v1/unit/agents': () => ({ body: { data: [
        { slug: 'chat', displayName: 'Napols', isDefault: true, enabled: true },
        { slug: 'doctor', displayName: 'Doctor', emoji: '🩺', role: 'your health', isDefault: false, enabled: true },
        { slug: 'off', displayName: 'Off', isDefault: false, enabled: false },
      ] } }),
    });
    render(<MyBotsSection isDark={false} activeKey="self/doctor" />);
    expect(await screen.findByText('Doctor')).toBeInTheDocument();
    expect(screen.queryByText('Napols')).not.toBeInTheDocument();
    expect(screen.queryByText('Off')).not.toBeInTheDocument();
    expect(screen.getByTestId('new-bot')).toHaveAttribute('href', '/agents/self/new');
    expect(screen.getByLabelText('Configure Doctor')).toHaveAttribute('href', '/agents/self/doctor/settings');
  });
});
