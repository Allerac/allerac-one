/** @jest-environment node */

// Telegram and scheduled jobs (/api/jobs/run, notifier) go through
// handleChatMessage, which only knows the user id. Shell access must be
// looked up and fail closed.

const mockChatCompletion = jest.fn();
const mockShellExecute = jest.fn();
const mockQuery = jest.fn();

jest.mock('@/app/clients/db', () => ({ __esModule: true, default: { query: (...args: unknown[]) => mockQuery(...args) } }));
jest.mock('@/app/services/llm/llm.service', () => ({
  LLMService: jest.fn().mockImplementation(() => ({ chatCompletion: mockChatCompletion })),
}));
jest.mock('@/app/tools/shell.tool', () => ({
  ShellTool: jest.fn().mockImplementation(() => ({ execute: mockShellExecute })),
}));
jest.mock('@/app/services/memory/conversation-memory.service', () => ({
  ConversationMemoryService: jest.fn().mockImplementation(() => ({
    getRecentSummaries: jest.fn().mockResolvedValue([]),
    formatMemoryContext: jest.fn(),
  })),
}));
jest.mock('@/app/services/rag/embedding.service', () => ({ EmbeddingService: jest.fn() }));
jest.mock('@/app/services/rag/vector-search.service', () => ({
  VectorSearchService: jest.fn().mockImplementation(() => ({
    getRelevantContext: jest.fn().mockResolvedValue(''),
  })),
}));
jest.mock('@/app/services/database/chat.service', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    createConversation: jest.fn().mockResolvedValue('conv-1'),
    saveMessage: jest.fn().mockResolvedValue({ success: true }),
    loadMessages: jest.fn().mockResolvedValue([]),
  })),
}));
jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: {
    getActiveSkill: jest.fn().mockResolvedValue({
      id: 'skill-programmer', name: 'programmer', display_name: 'Programmer', force_tool: 'execute_shell',
    }),
    getDefaultUserSkill: jest.fn().mockResolvedValue(null),
    getUserSkills: jest.fn().mockResolvedValue([]),
    detectIntent: jest.fn().mockResolvedValue(null),
    getSkillTools: jest.fn().mockResolvedValue(['execute_shell', 'get_today_info']),
    getEnrichedSkillContent: jest.fn().mockResolvedValue('skill'),
    completeSkillUsage: jest.fn().mockResolvedValue(undefined),
  },
}));

import { handleChatMessage } from '@/app/services/chat/chat-handler';
import { ShellTool } from '@/app/tools/shell.tool';


interface ToolDef { function: { name: string } }
interface ChatMessage { role: string; content: string }

const config = {
  userId: 'user-1',
  githubToken: '',
  selectedModel: 'test-model',
  modelProvider: 'ollama' as const,
  modelBaseUrl: 'http://ollama:11434',
  systemMessage: 'You are a helpful AI assistant.',
};

function shellCallThenAnswer() {
  mockChatCompletion
    .mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: '', tool_calls: [{
        id: 'call_1',
        function: { name: 'execute_shell', arguments: JSON.stringify({ command: 'cat /project/.env' }) },
      }] } }],
    })
    .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: 'done' } }] });
}

describe('handleChatMessage shell access (Telegram / scheduled jobs)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SHELL_ALLOWED_USER_IDS;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockShellExecute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, success: true });
  });

  afterEach(() => jest.restoreAllMocks());

  it('denies a non-admin: tool not offered, not forced, not executed', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', is_admin: false }] });
    shellCallThenAnswer();

    await handleChatMessage('do it', 'conv-1', config);

    const firstRequest = mockChatCompletion.mock.calls[0][0];
    expect(firstRequest.tools.map((tool: ToolDef) => tool.function.name)).not.toContain('execute_shell');
    expect(firstRequest.tool_choice).not.toEqual(expect.objectContaining({ function: { name: 'execute_shell' } }));
    expect(ShellTool).not.toHaveBeenCalled();
    const toolMessage = mockChatCompletion.mock.calls[1][0].messages.find((m: ChatMessage) => m.role === 'tool');
    expect(JSON.parse(toolMessage.content)).toEqual({
      error: 'Shell access is restricted to administrators on this instance.',
    });
  });

  it('fails closed when the role lookup errors', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    shellCallThenAnswer();

    await handleChatMessage('do it', 'conv-1', config);

    expect(ShellTool).not.toHaveBeenCalled();
  });

  it('allows an admin', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'user-1', is_admin: true }] });
    shellCallThenAnswer();

    await handleChatMessage('do it', 'conv-1', config);

    expect(mockChatCompletion.mock.calls[0][0].tools.map((tool: ToolDef) => tool.function.name)).toContain('execute_shell');
    expect(mockShellExecute).toHaveBeenCalledWith('cat /project/.env', '/workspace/projects/user-1', undefined);
  });
});
