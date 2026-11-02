jest.mock('@/app/services/llm/llm.service', () => ({
  LLMService: jest.fn(),
}));
jest.mock('@/app/services/chat/chat-tool-runner', () => ({
  executeChatTool: jest.fn(),
}));

import { LLMService } from '@/app/services/llm/llm.service';
import {
  EMPTY_REPLY_MESSAGE,
  MAX_TOOL_ROUNDS,
  messageText,
  runChatPipeline,
  type RunChatPipelineInput,
} from '@/app/services/chat/chat-pipeline';
import { executeChatTool } from '@/app/services/chat/chat-tool-runner';

const user = { id: 'user-1', email: 'user@example.com', name: 'Ada', is_admin: false, created_at: new Date() };
const tools = [{ type: 'function', function: { name: 'get_daily_snapshot' } }];

function asyncTokens(tokens: string[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const token of tokens) yield token;
    },
  };
}

const toolCall = (id = 'call-1') => ({
  choices: [{
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{ id, function: { name: 'get_daily_snapshot', arguments: '{"date":"2026-11-02"}' } }],
    },
  }],
});
const text = (content: unknown) => ({ choices: [{ message: { role: 'assistant', content } }] });

describe('runChatPipeline empty replies', () => {
  const chatCompletion = jest.fn();
  const streamChatCompletion = jest.fn();
  let log: jest.SpyInstance;

  function input(overrides: Partial<RunChatPipelineInput> = {}): RunChatPipelineInput {
    return {
      provider: 'openai',
      modelBaseUrl: 'https://api.openai.com/v1',
      modelId: 'model',
      githubToken: '',
      googleApiKey: '',
      anthropicApiKey: '',
      openaiApiKey: 'key',
      user,
      conversationId: 'conv-1',
      domain: 'chat',
      message: 'how did I sleep?',
      locale: 'en',
      activeSkill: null,
      activeTools: tools,
      messages: [{ role: 'user', content: 'how did I sleep?' }],
      emit: jest.fn(),
      keepalive: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    (LLMService as jest.Mock).mockImplementation(() => ({ chatCompletion, streamChatCompletion }));
    (executeChatTool as jest.Mock).mockResolvedValue({ date: '2026-11-02', sleep_duration_minutes: 420 });
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  const logged = () => log.mock.calls.map(call => String(call[0]));

  test('uses the text of the last tool-loop message instead of a second call', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(text('You slept 7 hours.'));
    const emit = jest.fn();

    await expect(runChatPipeline(input({ emit }))).resolves.toBe('You slept 7 hours.');
    expect(streamChatCompletion).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({ type: 'token', content: 'You slept 7 hours.' });
  });

  test('extracts text from content parts', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce(text([{ type: 'text', text: 'Seven' }, { type: 'text', text: ' hours.' }]));
    await expect(runChatPipeline(input())).resolves.toBe('Seven hours.');
    expect(messageText(null)).toBe('');
  });

  test('final call after tools keeps the tools and asks for text only', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(text(''));
    streamChatCompletion.mockReturnValue(asyncTokens(['ok']));

    await expect(runChatPipeline(input())).resolves.toBe('ok');
    expect(streamChatCompletion.mock.calls[0][0]).toMatchObject({ tools, tool_choice: 'none' });
  });

  test('omits tool_choice on the final call for gemini', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(text(''));
    streamChatCompletion.mockReturnValue(asyncTokens(['ok']));

    await runChatPipeline(input({ provider: 'gemini' }));
    expect(streamChatCompletion.mock.calls[0][0].tools).toEqual(tools);
    expect(streamChatCompletion.mock.calls[0][0]).not.toHaveProperty('tool_choice');
  });

  test('does not send tools on a direct (no tool) answer', async () => {
    chatCompletion.mockResolvedValueOnce(text(''));
    streamChatCompletion.mockReturnValue(asyncTokens(['hi']));

    await runChatPipeline(input());
    expect(streamChatCompletion.mock.calls[0][0]).not.toHaveProperty('tools');
  });

  test('falls back to a non-stream completion when the stream is empty', async () => {
    chatCompletion
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce(text(''))
      .mockResolvedValueOnce(text('Recovered answer.'));
    streamChatCompletion.mockReturnValue(asyncTokens([]));

    await expect(runChatPipeline(input())).resolves.toBe('Recovered answer.');
    expect(logged().some(line => line.includes('"event":"empty_content"') && line.includes('"stage":"stream"'))).toBe(true);
  });

  test('returns a clear message and emits empty_reply when nothing comes back', async () => {
    chatCompletion
      .mockResolvedValueOnce(toolCall())
      .mockResolvedValueOnce(text(''))
      .mockResolvedValueOnce(text('   '));
    streamChatCompletion.mockReturnValue(asyncTokens([]));
    const emit = jest.fn();

    await expect(runChatPipeline(input({ emit }))).resolves.toBe(EMPTY_REPLY_MESSAGE);
    expect(emit).toHaveBeenCalledWith({ type: 'empty_reply' });
    expect(logged().some(line => line.includes('"stage":"final"'))).toBe(true);
  });

  test('caps tool rounds and then forces a final answer', async () => {
    chatCompletion.mockImplementation(async () => toolCall());
    streamChatCompletion.mockReturnValue(asyncTokens(['final']));

    await expect(runChatPipeline(input())).resolves.toBe('final');
    expect(executeChatTool).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(streamChatCompletion.mock.calls[0][0]).toMatchObject({ tool_choice: 'none' });
    expect(logged().some(line => line.includes('"event":"tool_round_cap"'))).toBe(true);
  });

  test('logs tool calls with name, outcome and duration but no arguments', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(text('done'));
    await runChatPipeline(input());

    const line = logged().find(entry => entry.includes('"event":"tool_call"'));
    expect(line).toBeDefined();
    const payload = JSON.parse(line!.replace('[ChatPipeline] ', ''));
    expect(payload).toMatchObject({ tool: 'get_daily_snapshot', ok: true });
    expect(typeof payload.ms).toBe('number');
    expect(line).not.toContain('2026-11-02');
  });

  test('passes the timezone to tools', async () => {
    chatCompletion.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(text('done'));
    await runChatPipeline(input({ timeZone: 'Asia/Tokyo' }));
    expect(executeChatTool).toHaveBeenCalledWith('get_daily_snapshot', expect.anything(), expect.objectContaining({ timeZone: 'Asia/Tokyo' }));
  });
});
