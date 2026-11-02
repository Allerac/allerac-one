import {
  InvalidChatRequestError,
  parseChatRequestBody,
} from '@/app/services/chat/chat-request-parser';

describe('parseChatRequestBody', () => {
  test('normalizes a valid request', () => {
    expect(parseChatRequestBody({
      message: 'hello',
      model: 'qwen2.5:7b',
      provider: 'ollama',
    })).toEqual(expect.objectContaining({
      message: 'hello',
      conversationId: null,
      domain: 'chat',
    }));
  });

  test('allows an image-only request', () => {
    expect(parseChatRequestBody({
      message: ' ',
      model: 'gpt-4o',
      provider: 'github',
      imageAttachments: [{ url: 'https://example.com/image.png' }],
    }).imageAttachments).toHaveLength(1);
  });

  test.each([
    null,
    {},
    { message: '', model: 'x', provider: 'ollama' },
    { message: 'x', model: '../bad', provider: 'ollama' },
    { message: 'x', model: 'valid', provider: 'unknown' },
    { message: 'x', model: 'valid', provider: 'ollama', domain: '../admin' },
    { message: 'x', model: 'valid', provider: 'ollama', imageAttachments: [{ url: 'http://private/image' }] },
  ])('rejects invalid input %#', (input) => {
    expect(() => parseChatRequestBody(input)).toThrow(InvalidChatRequestError);
  });
});

describe('parseChatRequestBody surface (phase 4b)', () => {
  const base = { message: 'hi', model: 'gpt-4o', provider: 'github' };
  it('keeps surface=agent and drops anything else', () => {
    expect(parseChatRequestBody({ ...base, surface: 'agent' }).surface).toBe('agent');
    expect(parseChatRequestBody({ ...base, surface: 'other' })).not.toHaveProperty('surface');
    expect(parseChatRequestBody(base)).not.toHaveProperty('surface');
  });
});
