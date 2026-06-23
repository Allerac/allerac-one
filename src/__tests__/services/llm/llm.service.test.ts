const mockCreate = jest.fn();
const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
      stream: mockStream,
    },
  })),
}));

jest.mock('@/app/services/infrastructure/metrics.service', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    logApiCall: jest.fn().mockResolvedValue(undefined),
    logTokenUsage: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { LLMService } from '@/app/services/llm/llm.service';

describe('LLMService Anthropic content conversion', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockStream.mockReset();
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'caption' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 2 },
    });
  });

  it('converts OpenAI image_url URL blocks to Anthropic image URL blocks', async () => {
    const service = new LLMService('anthropic', 'https://api.anthropic.com', {
      anthropicToken: 'sk-ant-test',
    });

    await service.chatCompletion({
      model: 'claude-haiku-4-5-20251001',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Generate a caption.' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
        ],
      }],
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Generate a caption.' },
          { type: 'image', source: { type: 'url', url: 'https://example.com/image.jpg' } },
        ],
      }],
    }));
  });

  it('converts OpenAI image_url data URI blocks to Anthropic base64 image blocks', async () => {
    const service = new LLMService('anthropic', 'https://api.anthropic.com', {
      anthropicToken: 'sk-ant-test',
    });

    await service.chatCompletion({
      model: 'claude-haiku-4-5-20251001',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc123' } },
        ],
      }],
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc123' } },
        ],
      }],
    }));
  });

  it('corrects mismatched data URI media type from base64 image signature', async () => {
    const service = new LLMService('anthropic', 'https://api.anthropic.com', {
      anthropicToken: 'sk-ant-test',
    });

    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    await service.chatCompletion({
      model: 'claude-haiku-4-5-20251001',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${pngBase64}` } },
        ],
      }],
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
        ],
      }],
    }));
  });
});
