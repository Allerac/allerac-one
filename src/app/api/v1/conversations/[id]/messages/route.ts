import { ChatService } from '@/app/services/database/chat.service';
import { requireApiUser } from '../../../_lib/auth';
import { messageDto } from '../../../_lib/conversations';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';

const chatService = new ChatService();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('chat:read', request);
    const { id } = await context.params;

    const conversation = await chatService.getConversationForUser(id, user.id);
    if (!conversation) {
      return apiError('not_found', 'Conversation not found', 404);
    }

    const messages = await chatService.loadMessages(id, user.id);
    return apiData({ messages: messages.map(messageDto) });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/conversations/:id/messages failed', error);
  }
}
