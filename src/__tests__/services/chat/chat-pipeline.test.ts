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

  test('forces create_memory when the user explicitly asks to remember something', async () => {
    chatCompletion.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: '' } }],
    });
    streamChatCompletion.mockReturnValue(asyncTokens(['saved']));

    await runChatPipeline({
      provider: 'anthropic',
      modelBaseUrl: 'https://anthropic',
      modelId: 'model',
      githubToken: '',
      googleApiKey: '',
      anthropicApiKey: 'token',
      user,
      conversationId: 'conv-1',
      domain: 'chat',
      message: 'Guarde na sua memória que eu torço para o Barcelona',
      locale: 'pt',
      activeSkill: null,
      activeTools: [{ type: 'function', function: { name: 'create_memory' } }],
      messages: [{ role: 'user', content: 'Guarde na sua memória que eu torço para o Barcelona' }],
      emit: jest.fn(),
      keepalive: jest.fn(),
    });

    expect(chatCompletion).toHaveBeenCalledWith(expect.objectContaining({
      tool_choice: { type: 'function', function: { name: 'create_memory' } },
    }));
  });

  test.each([
    'Guarda isso: também torço para o Barcelona',
    'Não esqueça que prefiro respostas curtas',
  ])('forces create_memory for natural memory request: %s', async (message) => {
    chatCompletion.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: '' } }],
    });
    streamChatCompletion.mockReturnValue(asyncTokens(['saved']));

    await runChatPipeline({
      provider: 'anthropic',
      modelBaseUrl: 'https://anthropic',
      modelId: 'model',
      githubToken: '',
      googleApiKey: '',
      anthropicApiKey: 'token',
      user,
      conversationId: 'conv-1',
      domain: 'chat',
      message,
      locale: 'pt',
      activeSkill: null,
      activeTools: [{ type: 'function', function: { name: 'create_memory' } }],
      messages: [{ role: 'user', content: message }],
      emit: jest.fn(),
      keepalive: jest.fn(),
    });

    expect(chatCompletion).toHaveBeenLastCalledWith(expect.objectContaining({
      tool_choice: { type: 'function', function: { name: 'create_memory' } },
    }));
  });

  test.each([
    ['Anota que preciso comprar azeite', 'save_note'],
    ['Me lembre amanhã que tenho médico', 'schedule_task'],
    ['Daqui para frente, sempre responda de forma curta', 'learn_instruction'],
  ])('routes persistence intent "%s" to %s', async (message, expectedTool) => {
    chatCompletion.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: '' } }],
    });
    streamChatCompletion.mockReturnValue(asyncTokens(['done']));

    await runChatPipeline({
      provider: 'anthropic',
      modelBaseUrl: 'https://anthropic',
      modelId: 'model',
      githubToken: '',
      googleApiKey: '',
      anthropicApiKey: 'token',
      user,
      conversationId: 'conv-1',
      domain: 'chat',
      message,
      locale: 'pt',
      activeSkill: null,
      activeTools: [
        { type: 'function', function: { name: 'create_memory' } },
        { type: 'function', function: { name: 'save_note' } },
        { type: 'function', function: { name: 'schedule_task' } },
        { type: 'function', function: { name: 'learn_instruction' } },
      ],
      messages: [{ role: 'user', content: message }],
      emit: jest.fn(),
      keepalive: jest.fn(),
    });

    expect(chatCompletion).toHaveBeenLastCalledWith(expect.objectContaining({
      tool_choice: { type: 'function', function: { name: expectedTool } },
    }));
  });

  test('switches to the configured fallback before emitting content', async () => {
    const primaryCompletion = jest.fn().mockRejectedValue(new Error('provider unavailable'));
    const fallbackCompletion = jest.fn().mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: '' } }],
    });
    const fallbackStream = jest.fn().mockReturnValue(asyncTokens(['fallback']));
    (LLMService as jest.Mock)
      .mockImplementationOnce(() => ({
        chatCompletion: primaryCompletion,
        streamChatCompletion: jest.fn(),
      }))
      .mockImplementationOnce(() => ({
        chatCompletion: fallbackCompletion,
        streamChatCompletion: fallbackStream,
      }));
    const emit = jest.fn();

    const result = await runChatPipeline({
      provider: 'github',
      modelBaseUrl: 'https://models',
      modelId: 'gpt-4o',
      fallbackModelId: 'qwen2.5:3b',
      githubToken: 'token',
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
    });

    expect(result).toBe('fallback');
    expect(emit).toHaveBeenCalledWith({
      type: 'model_fallback',
      model: 'qwen2.5:3b',
      provider: 'ollama',
    });
  });
});
