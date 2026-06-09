export const CHAT_PROVIDERS = ['github', 'ollama', 'gemini', 'anthropic'] as const;

export type ChatProvider = typeof CHAT_PROVIDERS[number];

export interface ChatImageAttachment {
  url: string;
}

export interface ChatRequestInput {
  message: string;
  conversationId: string | null;
  model: string;
  provider: ChatProvider;
  imageAttachments?: ChatImageAttachment[];
  preSelectedSkillId?: string;
  defaultSkillName?: string;
  domain: string;
  postContext?: string;
}

const ALLOWED_PROVIDERS = new Set<string>(CHAT_PROVIDERS);
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 100_000;
const MAX_POST_CONTEXT_LENGTH = 20_000;
const MAX_IMAGE_ATTACHMENTS = 5;
const MAX_IMAGE_URL_LENGTH = 8 * 1024 * 1024;

export class InvalidChatRequestError extends Error {
  constructor(message = 'Invalid chat request') {
    super(message);
    this.name = 'InvalidChatRequestError';
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseChatRequestBody(body: unknown): ChatRequestInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidChatRequestError();
  }

  const input = body as Record<string, unknown>;
  const message = input.message;
  const model = input.model;
  const provider = input.provider;
  const conversationId = input.conversationId;
  const imageAttachments = input.imageAttachments;
  const preSelectedSkillId = optionalString(input.preSelectedSkillId);
  const defaultSkillName = optionalString(input.defaultSkillName);
  const domain = optionalString(input.domain) ?? 'chat';
  const postContext = optionalString(input.postContext);

  const imagesValid = imageAttachments == null || (
    Array.isArray(imageAttachments)
    && imageAttachments.length <= MAX_IMAGE_ATTACHMENTS
    && imageAttachments.every((image) => {
      if (!image || typeof image !== 'object') return false;
      const url = (image as Record<string, unknown>).url;
      return typeof url === 'string'
        && url.length <= MAX_IMAGE_URL_LENGTH
        && (url.startsWith('data:image/') || url.startsWith('https://'));
    })
  );

  if (
    typeof message !== 'string'
    || message.length > MAX_MESSAGE_LENGTH
    || typeof model !== 'string'
    || !MODEL_ID_PATTERN.test(model)
    || typeof provider !== 'string'
    || !ALLOWED_PROVIDERS.has(provider)
    || !DOMAIN_PATTERN.test(domain)
    || (conversationId != null && (typeof conversationId !== 'string' || !UUID_PATTERN.test(conversationId)))
    || (preSelectedSkillId != null && !UUID_PATTERN.test(preSelectedSkillId))
    || (defaultSkillName != null && !DOMAIN_PATTERN.test(defaultSkillName))
    || (postContext != null && postContext.length > MAX_POST_CONTEXT_LENGTH)
    || !imagesValid
    || (!message.trim() && (!Array.isArray(imageAttachments) || imageAttachments.length === 0))
  ) {
    throw new InvalidChatRequestError();
  }

  return {
    message,
    conversationId: conversationId == null ? null : conversationId as string,
    model,
    provider: provider as ChatProvider,
    imageAttachments: imageAttachments as ChatImageAttachment[] | undefined,
    preSelectedSkillId,
    defaultSkillName,
    domain,
    postContext,
  };
}
