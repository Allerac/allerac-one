import { buildChatSystemPrompt } from '@/app/services/chat/prompt-builder';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Ada',
  is_admin: false,
  is_active: true,
  created_at: new Date(),
};

describe('buildChatSystemPrompt', () => {
  test('adds deterministic user context and instructions', () => {
    const prompt = buildChatSystemPrompt({
      user,
      locale: 'pt',
      domain: 'chat',
      userLocation: 'Madrid',
      tavilyConfigured: true,
      userInstructions: 'Be concise.',
      now: new Date('2026-06-09T10:11:12Z'),
      timezone: 'UTC',
    });

    expect(prompt).toContain('- Name: Ada');
    expect(prompt).toContain('- Language: Portuguese');
    expect(prompt).toContain('2026-06-09 Tuesday');
    expect(prompt).toContain('(UTC)');
    expect(prompt).toContain('## User instructions\nBe concise.');
    expect(prompt).toContain('current data for their location');
  });

  test('enriches skill, memory, RAG, and workspace paths', () => {
    const prompt = buildChatSystemPrompt({
      user,
      locale: 'en',
      domain: 'code',
      userLocation: null,
      tavilyConfigured: false,
      activeSkill: {
        id: 'skill-1',
        user_id: null,
        name: 'programmer',
        display_name: 'Programmer',
      } as any,
      skillContent: 'Work in /workspace/projects/project-a',
      conversationMemories: 'MEMORY',
      relevantContext: 'RAG',
      now: new Date('2026-06-09T10:11:12Z'),
      timezone: 'UTC',
    });

    expect(prompt.startsWith('MEMORY')).toBe(true);
    expect(prompt).toContain('# Active Skill: Programmer');
    expect(prompt).toContain('/workspace/projects/user-1/project-a');
    expect(prompt).toContain('RAG');
  });

  test('excludes private account context and persistence guidance from public domains', () => {
    const prompt = buildChatSystemPrompt({
      user,
      locale: 'pt',
      domain: 'sales',
      userLocation: 'PRIVATE_LOCATION_CANARY',
      tavilyConfigured: true,
      userInstructions: 'PRIVATE_INSTRUCTION_CANARY',
      postContext: 'UNTRUSTED_POST_CONTEXT',
      conversationMemories: 'PRIVATE_MEMORY_CANARY',
      relevantContext: 'PRIVATE_RAG_CANARY',
      now: new Date('2026-09-05T10:11:12Z'),
      timezone: 'UTC',
    });

    expect(prompt).not.toContain('- Name: Ada');
    expect(prompt).not.toContain('PRIVATE_LOCATION_CANARY');
    expect(prompt).not.toContain('PRIVATE_INSTRUCTION_CANARY');
    expect(prompt).not.toContain('UNTRUSTED_POST_CONTEXT');
    expect(prompt).not.toContain('PRIVATE_MEMORY_CANARY');
    expect(prompt).not.toContain('PRIVATE_RAG_CANARY');
    expect(prompt).not.toContain('## Memory, notes, and reminders');
    expect(prompt).not.toContain('use the search_web tool');
    expect(prompt).not.toContain('private AI assistant');
    expect(prompt).toContain('- Language: Portuguese');
  });
});
