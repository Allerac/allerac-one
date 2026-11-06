/**
 * @jest-environment node
 */
jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: jest.fn(), connect: jest.fn() } }));

import {
  COMPACTION_KEEP_RECENT,
  COMPACTION_TRIGGER_MESSAGES,
  TOPIC_MARKER_KIND,
  assemblePromptHistory,
  estimateTokens,
  liveWindow,
  planCompaction,
  type StoredMessage,
} from '@/app/services/chat/primary-conversation';

const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
const msgs = (n: number, from = 0, content = 'hi'): StoredMessage[] =>
  Array.from({ length: n }, (_, k) => ({
    id: `m${from + k}`, role: (from + k) % 2 === 0 ? 'user' : 'assistant', content, created_at: at(from + k),
  }));

describe('planCompaction', () => {
  it('does nothing under both thresholds', () => {
    expect(planCompaction(msgs(COMPACTION_TRIGGER_MESSAGES))).toBeNull();
  });

  it('triggers on message count and keeps the recent window', () => {
    const plan = planCompaction(msgs(COMPACTION_TRIGGER_MESSAGES + 1));
    expect(plan).not.toBeNull();
    expect(plan!.keep).toHaveLength(COMPACTION_KEEP_RECENT);
    expect(plan!.toSummarize).toHaveLength(COMPACTION_TRIGGER_MESSAGES + 1 - COMPACTION_KEEP_RECENT);
    expect(plan!.toSummarize[0].id).toBe('m0');
  });

  it('triggers on approximate tokens with few messages', () => {
    const big = msgs(14, 0, 'x'.repeat(8000));
    expect(estimateTokens(big)).toBeGreaterThan(16_000);
    const plan = planCompaction(big);
    expect(plan!.toSummarize).toHaveLength(14 - COMPACTION_KEEP_RECENT);
  });

  it('never summarizes when only the recent window is left', () => {
    expect(planCompaction(msgs(COMPACTION_KEEP_RECENT, 0, 'x'.repeat(100_000)))).toBeNull();
  });

  it('ignores topic markers', () => {
    const list = [...msgs(5), { id: 't', role: 'system', content: '', kind: TOPIC_MARKER_KIND, created_at: at(5) }];
    expect(planCompaction(list, { triggerMessages: 4, keepRecent: 2 })!.toSummarize.map(m => m.id)).toEqual(['m0', 'm1', 'm2']);
  });
});

describe('liveWindow', () => {
  it('restarts context after the latest topic marker', () => {
    const list = [
      ...msgs(4),
      { id: 't', role: 'system', content: '', kind: TOPIC_MARKER_KIND, created_at: at(4) },
      ...msgs(2, 5),
    ];
    const segments = [{ summary: 'old', start_at: at(0), end_at: at(1) }];
    const live = liveWindow(list, segments);
    expect(live.segments).toEqual([]);
    expect(live.messages.map(m => m.id)).toEqual(['m5', 'm6']);
  });

  it('drops messages already covered by a segment', () => {
    const live = liveWindow(msgs(6), [{ summary: 's', start_at: at(0), end_at: at(3) }]);
    expect(live.segments).toHaveLength(1);
    expect(live.messages.map(m => m.id)).toEqual(['m4', 'm5']);
  });
});

describe('assemblePromptHistory', () => {
  it('puts the latest segment summaries first, then raw user/assistant messages', () => {
    const segments = [1, 2, 3, 4, 5].map(i => ({ summary: `s${i}`, start_at: at(i), end_at: at(i) }));
    const out = assemblePromptHistory(segments, [
      ...msgs(3, 10),
      { id: 't', role: 'system', content: 'x', kind: TOPIC_MARKER_KIND, created_at: at(20) },
    ], { maxSegments: 2 });
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('- s4\n- s5');
    expect(out[0].content).not.toContain('s3');
    expect(out.slice(1).map(m => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('caps raw messages to the most recent ones and omits the summary block when empty', () => {
    const out = assemblePromptHistory([], msgs(10), { maxMessages: 3 });
    expect(out).toHaveLength(3);
    expect(out[0].role).toBe('assistant');
  });
});
