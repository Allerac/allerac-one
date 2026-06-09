jest.mock('@/app/services/llm/llm.service', () => ({
  LLMService: jest.fn(),
}));
jest.mock('@/app/services/chat/chat-tool-runner', () => ({
  executeChatTool: jest.fn(),
}));

import { LLMService } from '@/app/services/llm/llm.service';
import { runChatPipeline } from '@/app/services/chat/chat-pipeline';
import { executeChatTool } from '@/app/services/chat/chat-tool-runner';

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Ada',
  is_admin: false,
  created_at: new Date(),
};

function asyncTokens(tokens: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const token of tokens) yield token;
    },
  };
}

describe('runChatPipeline', () => {
  const chatCompletion = jest.fn();
  const streamChatCompletion = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (LLMService as jest.Mock).mockImplementation(() => ({
      chatCompletion,
      streamChatCompletion,
    }));
  });

  test('streams a direct response', async () => {
    chatCompletion.mockResolvedValue({ choices: [{ message: { role: 'assistant', content: '' } }] });
    streamChatCompletion.mockReturnValue(asyncTokens(['hello', ' world']));
    const emit = jest.fn();

    await expect(runChatPipeline({
      provider: 'ollama',
      modelBaseUrl: 'http://ollama',
      modelId: 'model',
      githubToken: '',
      googleApiKey: '',
      anthropicApiKey: '',
      user,
      conversationId: 'conv-1',
      message: 'hi',
      locale: 'en',
      activeSkill: null,
      activeTools: [],
      messages: [{ role: 'user', content: 'hi' }],
      emit,
      keepalive: jest.fn(),
    })).resolves.toBe('hello world');

    expect(emit).toHaveBeenCalledWith({ type: 'token', content: 'hello' });
  });

  test('executes tools before streaming', async () => {
    chatCompletion
      .mockResolvedValueOnce({
        choices: [{
          message: {
            role: 'assistant',
            tool_calls: [{
              id: 'call-1',
              function: { name: 'search_web', arguments: '{"query":"news"}' },
            }],
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { role: 'assistant', content: '' } }] });
    (executeChatTool as jest.Mock).mockResolvedValue({ answer: 'result' });
    streamChatCompletion.mockReturnValue(asyncTokens(['done']));
    const messages: any[] = [{ role: 'user', content: 'news' }];
    const emit = jest.fn();

    await runChatPipeline({
      provider: 'github',
      modelBaseUrl: 'https://models',
      modelId: 'model',
      githubToken: 'token',
      googleApiKey: '',
      anthropicApiKey: '',
      tavilyApiKey: 'tavily',
      user,
      conversationId: 'conv-1',
      message: 'news',
      locale: 'en',
      activeSkill: null,
      activeTools: [],
      messages,
      emit,
      keepalive: jest.fn(),
    });

    expect(executeChatTool).toHaveBeenCalledWith(
      'search_web',
      { query: 'news' },
      expect.objectContaining({ user, tavilyApiKey: 'tavily' }),
    );
    expect(messages).toContainEqual(expect.objectContaining({
      role: 'tool',
      tool_call_id: 'call-1',
    }));
  });
});
