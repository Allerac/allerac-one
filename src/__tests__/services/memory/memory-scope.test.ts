import { memoryReadDomain } from '@/app/services/memory/memory-scope';
import { KNOWLEDGE_SOURCE_TYPES } from '@/app/services/knowledge/knowledge-search.service';

describe('memoryReadDomain', () => {
  it('reads every domain for the chat agent', () => {
    expect(memoryReadDomain('chat')).toBeNull();
  });

  it('keeps legacy domains and paired Units scoped', () => {
    expect(memoryReadDomain('health')).toBe('health');
    expect(memoryReadDomain('chat', { federated: true })).toBe('chat');
    expect(memoryReadDomain(null)).toBeNull();
  });

  it('never makes tickets a knowledge source', () => {
    expect([...KNOWLEDGE_SOURCE_TYPES] as string[]).not.toContain('ticket');
  });
});
