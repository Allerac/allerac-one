import { z } from 'zod';
import { ChatService } from '@/app/services/database/chat.service';
import { requireApiUser } from '../_lib/auth';
import { conversationDto } from '../_lib/conversations';
import { apiAuthError, apiData, apiError, apiInternalError } from '../_lib/responses';

const chatService = new ChatService();

const listQuerySchema = z.object({
  domainSlug: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  domainSlug: z.string().trim().min(1).optional(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('chat:read', request);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid conversation filters', 400, parsed.error.flatten());
    }

    const conversations = await chatService.loadConversations(user.id, parsed.data.domainSlug);
    const limited = conversations.slice(0, parsed.data.limit ?? 50);
    return apiData({ conversations: limited.map(conversationDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/conversations failed', error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireApiUser('chat:write', request);
    const parsed = createConversationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError('validation_error', 'Invalid conversation payload', 400, parsed.error.flatten());
    }

    const id = await chatService.createConversation(
      user.id,
      parsed.data.title,
      parsed.data.domainSlug ?? 'chat',
    );

    if (!id) {
      return apiError('internal_error', 'Failed to create conversation', 500);
    }

    const conversation = await chatService.getConversationForUser(id, user.id);
    return apiData({
      conversation: conversation ? conversationDto(conversation) : {
        id,
        title: parsed.data.title,
        domainSlug: parsed.data.domainSlug ?? 'chat',
        pinned: false,
        createdAt: null,
        updatedAt: null,
      },
    }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/conversations failed', error);
  }
}
