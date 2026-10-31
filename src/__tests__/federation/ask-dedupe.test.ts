/** @jest-environment node */
import {
  DEDUPE_TTL_MS, InMemoryAskDedupeStore, STALE_IN_PROGRESS_MS, askRequestHash, decideExisting,
} from '@/federation/ask-dedupe';

const at = (ms: number) => new Date(ms);

describe('ask dedupe', () => {
  it('hashes agent, conversation and question', () => {
    const a = askRequestHash({ agent: 'chat', conversationId: null, question: 'q' });
    expect(a).toHaveLength(64);
    expect(askRequestHash({ agent: 'chat', conversationId: 'c', question: 'q' })).not.toBe(a);
    expect(askRequestHash({ agent: 'chat', conversationId: undefined, question: 'q' })).toBe(a);
  });

  it('decides replay, mismatch, in-progress and takeover', () => {
    const row = { requestHash: 'h', status: 'done' as const, response: { answer: 'a', truncated: false, conversation_id: null, message_id: null }, createdAt: at(0), updatedAt: at(0) };
    expect(decideExisting(row, 'h', at(10))).toMatchObject({ kind: 'replay' });
    expect(decideExisting(row, 'x', at(10))).toEqual({ kind: 'mismatch' });
    expect(decideExisting(row, 'x', at(DEDUPE_TTL_MS + 1))).toBe('takeover');
    const running = { ...row, status: 'in_progress' as const, response: null };
    expect(decideExisting(running, 'h', at(10))).toEqual({ kind: 'in_progress' });
    expect(decideExisting(running, 'h', at(STALE_IN_PROGRESS_MS + 1))).toBe('takeover');
    expect(decideExisting({ ...row, status: 'failed', response: null }, 'h', at(10))).toBe('takeover');
  });

  it('in-memory store claims, finishes and replays', async () => {
    const store = new InMemoryAskDedupeStore();
    expect(await store.begin('p', 'k', 'h', at(0))).toEqual({ kind: 'new' });
    expect(await store.begin('p', 'k', 'h', at(1))).toEqual({ kind: 'in_progress' });
    await store.finish('p', 'k', { status: 'done', response: { answer: 'a', truncated: false, conversation_id: 'c', message_id: null } });
    expect(await store.begin('p', 'k', 'h', at(2))).toMatchObject({ kind: 'replay', response: { conversation_id: 'c' } });
    expect(await store.begin('other', 'k', 'h', at(2))).toEqual({ kind: 'new' });
  });
});
