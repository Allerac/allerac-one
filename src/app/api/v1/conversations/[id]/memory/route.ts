import { ChatService } from '@/app/services/database/chat.service';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { memoryDto, resolveMemoryLlmConfig } from '../../../_lib/memories';

const chatService = new ChatService();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('memory:write', request);
    const { id } = await context.params;

    const conversation = await chatService.getConversationForUser(id, user.id);
    if (!conversation) {
      return apiError('not_found', 'Conversation not found', 404);
    }

    const llmConfig = await resolveMemoryLlmConfig();
    if (!llmConfig) {
      return apiError('provider_not_configured', 'No memory LLM provider is configured.', 422);
    }

    const memoryService = new ConversationMemoryService(llmConfig, conversation.domain_slug ?? null);
    const memory = await memoryService.generateConversationSummary(id, user.id);
    if (!memory) {
      return apiError('not_enough_content', 'Conversation does not have enough messages to create memory.', 422);
    }

    return apiData({ memory: memoryDto(memory) }, { status: 201 });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('POST /api/v1/conversations/:id/memory failed', error);
  }
}
