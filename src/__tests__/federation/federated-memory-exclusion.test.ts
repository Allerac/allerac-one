/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import '../__mocks__/db';
import pool from '@/app/clients/db';
import { AskDedupeRepository } from '@/federation/ask-dedupe.repository';
import { notFederatedSummarySql } from '@/app/services/memory/federated-memory-filter';

const SRC = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const mockQuery = pool.query as unknown as jest.Mock;

describe('federated conversations stay out of memory and RAG (P4 decision 1)', () => {
  it('builds a filter on the summary conversation', () => {
    expect(notFederatedSummarySql('cs')).toContain("fed_cc.id = cs.conversation_id AND fed_cc.source = 'federation'");
  });

  it('is applied to memory creation, recall, indexing and knowledge search', () => {
    const memory = read('app/services/memory/conversation-memory.service.ts');
    expect(memory).toContain("cc.source <> 'federation'");
    expect(memory.match(/notFederatedSummarySql\('conversation_summaries'\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(read('app/services/knowledge/memory-index.service.ts').match(/notFederatedSummarySql\('cs'\)/g)?.length).toBe(2);
    expect(read('app/services/knowledge/knowledge-search.service.ts').match(/notFederatedSummarySql\('cs'\)/g)?.length).toBe(2);
  });

  it('migration 147 adds principal ownership, dedupe and drops derived index rows', () => {
    const sql = read('database/migrations/147_federation_conversations.sql');
    expect(sql).toContain('federation_principal_id');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS federation_ask_dedupe');
    expect(sql).toContain('WHERE is_default');
    expect(sql).toMatch(/DELETE FROM knowledge_semantic_index[\s\S]*cc\.source = 'federation'/);
  });
});

describe('AskDedupeRepository', () => {
  beforeEach(() => mockQuery.mockReset());

  it('claims a new key with an insert', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 1, rows: [{}] });
    expect(await new AskDedupeRepository().begin('p', 'k', 'h', new Date(0))).toEqual({ kind: 'new' });
    expect(mockQuery.mock.calls[1][0]).toContain('ON CONFLICT (principal_id, idempotency_key) DO NOTHING');
  });

  it('replays a done row and takes over a stale one with compare-and-swap', async () => {
    const now = new Date(10 * 60 * 1000);
    const done = { request_hash: 'h', status: 'done', response: { answer: 'a', truncated: false, conversation_id: null, message_id: null }, created_at: new Date(0), updated_at: new Date(0) };
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rows: [done] });
    expect(await new AskDedupeRepository().begin('p', 'k', 'h', now)).toMatchObject({ kind: 'replay' });

    mockQuery.mockReset();
    const stale = { ...done, status: 'in_progress', response: null };
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [stale] }).mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await new AskDedupeRepository().begin('p', 'k', 'h', now)).toEqual({ kind: 'in_progress' });
    expect(mockQuery.mock.calls[3][0]).toContain('AND updated_at = $5');
  });
});
