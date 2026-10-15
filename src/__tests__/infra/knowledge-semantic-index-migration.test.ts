import { readFileSync } from 'fs';
import path from 'path';

const sql = readFileSync(path.join(process.cwd(), 'src/database/migrations/139_knowledge_semantic_index.sql'), 'utf8');

describe('139_knowledge_semantic_index migration', () => {
  it('only allows non-ticket source types, so tickets can never be indexed', () => {
    const check = sql.match(/CHECK \(source_type IN \(([^)]*)\)\)/);
    expect(check).not.toBeNull();
    const allowed = check![1].split(',').map(v => v.trim().replace(/'/g, ''));
    expect(allowed).toEqual(['memory']);
    expect(allowed).not.toContain('ticket');
  });

  it('is idempotent and removes index rows when a memory is deleted', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS knowledge_semantic_index');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(sql).toContain('DROP TRIGGER IF EXISTS trg_knowledge_semantic_index_drop_memory');
    expect(sql).toMatch(/AFTER DELETE ON conversation_summaries/);
  });
});
