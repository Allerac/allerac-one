/**
 * @jest-environment node
 *
 * Multi-bot PR 7: the Manager (default agent) consults a bot with ask_agent.
 */
import {
  askAgent, consultableBots, consultTimeoutMs, MAX_CONSULTS_PER_TURN, type BotConsultDeps, type ConsultContext, type ConsultRecord,
} from '@/app/services/agent/bot-consult';
import type { UnitAgent } from '@/app/services/agent/unit-agents';

const agent = (patch: Partial<UnitAgent> = {}): UnitAgent => ({
  id: 'id', slug: 'doctor', displayName: 'Doctor', emoji: '🩺', avatarUrl: null, role: 'your health',
  description: null, instructions: 'x', isDefault: false, enabled: true, sortOrder: 0,
  toolSettings: { modules: { health: true }, tools: {}, skills: {} }, memoryMode: 'isolated', shareMemoriesByDefault: false,
  canCall: [], modelId: null, modelProvider: null, cloudAllowed: true, defaultSkillId: null, federationExposed: false,
  template: null, archivedAt: null, createdAt: null, updatedAt: null, ...patch,
});

const BOTS: Record<string, UnitAgent> = {
  chat: agent({ slug: 'chat', displayName: 'Napols', isDefault: true }),
  doctor: agent(),
  nutri: agent({ slug: 'nutri', displayName: 'Nutrition', role: 'food' }),
  off: agent({ slug: 'off', displayName: 'Off', enabled: false }),
  old: agent({ slug: 'old', displayName: 'Old', archivedAt: '2026-11-27T00:00:00.000Z' }),
  local: agent({ slug: 'local', displayName: 'Local', cloudAllowed: false }),
};

function setup(run?: BotConsultDeps['run']) {
  const records: ConsultRecord[] = [];
  const handoffs = new Map<string, string>();
  const runs: Parameters<BotConsultDeps['run']>[0][] = [];
  let created = 0;
  const deps: BotConsultDeps = {
    getBot: jest.fn(async (slug: string) => BOTS[slug] ?? null),
    listBots: async () => Object.values(BOTS),
    store: {
      latestHandoff: async (_user, caller, target) => handoffs.get(`${caller}|${target}`) ?? null,
      createHandoff: async () => `handoff-${++created}`,
      record: async (row) => {
        records.push(row);
        if (row.callerConversationId && row.handoffConversationId) handoffs.set(`${row.callerConversationId}|${row.targetSlug}`, row.handoffConversationId);
      },
    },
    run: run ?? (async (input) => { runs.push(input); return { content: `answer from ${input.bot.slug}`, empty: false }; }),
    timeoutMs: 50,
  };
  const ctx = (patch: Partial<ConsultContext> = {}): ConsultContext => ({
    user: { id: 'admin', is_admin: true } as ConsultContext['user'],
    callerConversationId: 'manager-conv',
    model: { modelId: 'gpt-4o', provider: 'github' },
    locale: 'pt',
    turn: { consults: 0 },
    managerName: 'Napols',
    ...patch,
  });
  return { deps, ctx, records, runs };
}

describe('askAgent', () => {
  it('runs the bot turn and returns only its answer, with a continue link', async () => {
    const { deps, ctx, records, runs } = setup();
    const result = await askAgent({ agent: ' Doctor ', question: 'Is my sleep ok?' }, ctx(), deps);
    expect(result).toEqual({
      agent: 'doctor', name: 'Doctor', answer: 'answer from doctor', truncated: false, continueHref: '/agents/self/doctor',
    });
    expect(runs[0]).toMatchObject({ conversationId: 'handoff-1', modelId: 'gpt-4o', provider: 'github', locale: 'pt' });
    expect(runs[0].bot.slug).toBe('doctor');
    expect(runs[0].message).toContain('Napols');
    expect(runs[0].message).toContain('Is my sleep ok?');
    expect(records).toEqual([expect.objectContaining({
      userId: 'admin', callerSlug: 'chat', callerConversationId: 'manager-conv', targetSlug: 'doctor',
      handoffConversationId: 'handoff-1', status: 'ok', errorCode: null, question: 'Is my sleep ok?',
    })]);
  });

  it('continues the same hand-off conversation from the same Manager conversation', async () => {
    const { deps, ctx, runs } = setup();
    await askAgent({ agent: 'doctor', question: 'a' }, ctx(), deps);
    await askAgent({ agent: 'doctor', question: 'b' }, ctx(), deps);
    await askAgent({ agent: 'nutri', question: 'c' }, ctx(), deps);
    await askAgent({ agent: 'doctor', question: 'd' }, ctx({ callerConversationId: 'other-conv' }), deps);
    expect(runs.map((r) => r.conversationId)).toEqual(['handoff-1', 'handoff-1', 'handoff-2', 'handoff-3']);
  });

  it('never consults the default agent, disabled, archived or unknown bots', async () => {
    const { deps, ctx, runs } = setup();
    for (const slug of ['chat', 'off', 'old', 'ghost']) {
      const result = await askAgent({ agent: slug, question: 'q' }, ctx(), deps);
      expect(result).toMatchObject({ error: `No bot "${slug}" to consult.` });
      expect((result as { availableAgents: Array<{ id: string }> }).availableAgents.map((a) => a.id)).toEqual(['doctor', 'nutri', 'local']);
    }
    expect(deps.getBot).not.toHaveBeenCalledWith('chat');
    expect(runs).toHaveLength(0);
  });

  it('caps consults per Manager turn', async () => {
    const { deps, ctx, runs } = setup();
    const turn = { consults: 0 };
    for (let i = 0; i < MAX_CONSULTS_PER_TURN; i += 1) {
      expect(await askAgent({ agent: 'doctor', question: `q${i}` }, ctx({ turn }), deps)).toHaveProperty('answer');
    }
    expect(await askAgent({ agent: 'nutri', question: 'one more' }, ctx({ turn }), deps)).toMatchObject({ error: expect.stringContaining('At most') });
    expect(runs).toHaveLength(MAX_CONSULTS_PER_TURN);
  });

  it('applies the bot model rules (local-only bots refuse a cloud Manager model)', async () => {
    const { deps, ctx, records, runs } = setup();
    const refused = await askAgent({ agent: 'local', question: 'q' }, ctx(), deps);
    expect(refused).toMatchObject({ agent: 'local', error: expect.stringContaining('only runs on local models') });
    expect(records[0]).toMatchObject({ status: 'error', errorCode: 'cloud_not_allowed' });
    await askAgent({ agent: 'local', question: 'q' }, ctx({ model: { modelId: 'qwen2.5:3b', provider: 'ollama' } }), deps);
    expect(runs[0]).toMatchObject({ provider: 'ollama' });
  });

  it('reports timeouts and failures without throwing, and audits them', async () => {
    const slow = setup(() => new Promise(() => undefined));
    expect(await askAgent({ agent: 'doctor', question: 'q' }, slow.ctx(), slow.deps)).toEqual({ agent: 'doctor', error: 'Doctor took too long to answer.' });
    expect(slow.records[0]).toMatchObject({ status: 'timeout', handoffConversationId: 'handoff-1' });

    const broken = setup(async () => { throw new Error('boom'); });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await askAgent({ agent: 'doctor', question: 'q' }, broken.ctx(), broken.deps)).toEqual({ agent: 'doctor', error: 'Doctor could not answer.' });
    expect(broken.records[0]).toMatchObject({ status: 'error', errorCode: 'exception' });
  });

  it('validates the arguments and truncates long answers', async () => {
    const { deps, ctx } = setup(async () => ({ content: 'x'.repeat(9000), empty: false }));
    expect(await askAgent({ agent: 'doctor' }, ctx(), deps)).toEqual({ error: 'agent and question are required.' });
    expect(await askAgent({ agent: 'doctor', question: 'q'.repeat(4001) }, ctx(), deps)).toMatchObject({ error: expect.stringContaining('too long') });
    const long = await askAgent({ agent: 'doctor', question: 'q' }, ctx(), deps) as { answer: string; truncated: boolean };
    expect(long.answer).toHaveLength(8000);
    expect(long.truncated).toBe(true);

    const empty = setup(async () => ({ content: 'fallback text', empty: true }));
    expect(await askAgent({ agent: 'doctor', question: 'q' }, empty.ctx(), empty.deps)).toMatchObject({ answer: 'Doctor gave no answer.' });
    expect(empty.records[0]).toMatchObject({ status: 'ok', errorCode: 'empty_reply' });
  });

  it('lists consultable bots and reads the timeout from the env', () => {
    expect(consultableBots(Object.values(BOTS)).map((b) => b.slug)).toEqual(['doctor', 'nutri', 'local']);
    expect(consultTimeoutMs({})).toBe(120_000);
    expect(consultTimeoutMs({ ALLERAC_BOT_CONSULT_TIMEOUT_MS: '30000' })).toBe(30_000);
    expect(consultTimeoutMs({ ALLERAC_BOT_CONSULT_TIMEOUT_MS: '1' })).toBe(120_000);
  });
});
