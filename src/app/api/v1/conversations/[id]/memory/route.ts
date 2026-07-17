import { z } from 'zod';
import { ChatService } from '@/app/services/database/chat.service';
import { ConversationMemoryService } from '@/app/services/memory/conversation-memory.service';
import { requireApiUser } from '../../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../../_lib/responses';
import { memoryDto, resolveMemoryLlmConfig } from '../../../_lib/memories';

const chatService = new ChatService();

const createMemoryBodySchema = z.object({
  importanceScore: z.number().int().min(1).max(10).optional(),
  emotion: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable().optional(),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function parseOptionalJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const user = await requireApiUser('memory:write', request);
    const { id } = await context.params;
    let requestBody: unknown;
    try {
      requestBody = await parseOptionalJsonBody(request);
    } catch {
      return apiError('validation_error', 'Invalid JSON body', 400);
    }
    const parsedBody = createMemoryBodySchema.safeParse(requestBody);
    if (!parsedBody.success) {
      return apiError('validation_error', 'Invalid memory creation body', 400, parsedBody.error.flatten());
    }

    const conversation = await chatService.getConversationForUser(id, user.id);
    if (!conversation) {
      return apiError('not_found', 'Conversation not found', 404);
    }

    const llmConfig = await resolveMemoryLlmConfig();
    if (!llmConfig) {
      return apiError('provider_not_configured', 'No memory LLM provider is configured.', 422);
    }

    const memoryService = new ConversationMemoryService(llmConfig, conversation.domain_slug ?? null);
    const memory = await memoryService.generateConversationSummary(id, user.id, parsedBody.data);
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
