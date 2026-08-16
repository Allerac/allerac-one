import type { User } from '@/app/services/auth/auth.service';
import { LLMService } from '@/app/services/llm/llm.service';
import type { Skill } from '@/app/services/skills/skills.service';
import { executeChatTool } from './chat-tool-runner';
import type { ChatProvider } from './chat-request-parser';
import { MODELS } from '@/app/services/llm/models';

export interface ChatPipelineMessage {
  role: string;
  content: string | any[];
  tool_call_id?: string;
  tool_calls?: any;
}

export interface RunChatPipelineInput {
  provider: ChatProvider;
  modelBaseUrl: string;
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  fallbackModelId?: string | null;
  githubToken: string;
  googleApiKey: string;
  anthropicApiKey: string;
  tavilyApiKey?: string;
  user: User;
  conversationId: string;
  domain?: string;
  message: string;
  locale: string;
  activeSkill: Skill | null;
  activeTools: any[];
  messages: ChatPipelineMessage[];
  emit: (event: object) => void;
  keepalive: () => void;
}

function parseToolArguments(rawArguments: unknown): Record<string, any> {
  if (rawArguments == null) return {};
  if (typeof rawArguments === 'object') return rawArguments as Record<string, any>;
  try {
    return JSON.parse(String(rawArguments));
  } catch {
    return {};
  }
}

function explicitlyRequestedPersistenceTool(message: string): string | null {
  const normalized = message.toLocaleLowerCase();
  const temporalReference = /(?:^|\s)(?:amanh[aã]|hoje|depois|mais tarde|pr[oó]xim[oa]|segunda|terça|quarta|quinta|sexta|sábado|domingo|\d{1,2}(?::\d{2})?\s*(?:h|horas?)?|tomorrow|today|tonight|next|at\s+\d|mañana|hoy)(?=\s|[,.!?]|$)/iu;
  const reminderRequest = /\b(?:me\s+lembre|lembre-me|me\s+avise|avise-me|n[aã]o\s+esqueça|remind\s+me|don'?t\s+forget|recu[eé]rdame|no\s+olvides)\b/i;
  const noteRequest = /\b(?:anote|anota|tome\s+nota|crie\s+uma\s+nota|salve\s+(?:isso\s+)?(?:nas?|como)\s+notas?|write\s+(?:this\s+)?down|take\s+(?:a\s+)?note|create\s+(?:a\s+)?note)\b/i;
  const standingInstruction = /\b(?:daqui\s+(?:em\s+diante|pra\s+frente|para\s+frente)|a\s+partir\s+de\s+agora|de\s+agora\s+em\s+diante|from\s+now\s+on|going\s+forward|a\s+partir\s+de\s+ahora)\b/i;
  const writeVerb = '(?:guard(?:e|a|ar|asse)|salv(?:e|a|ar)|lembr(?:e|a|ar)|memoriz(?:e|a|ar)|remember|save|memorize|recuerd(?:a|e)|guardar)';
  const memoryNoun = '(?:mem[oó]ria|memory|memoria)';

  if (reminderRequest.test(normalized) && temporalReference.test(normalized)) return 'schedule_task';
  if (noteRequest.test(normalized)) return 'save_note';
  if (standingInstruction.test(normalized)) return 'learn_instruction';

  const memoryRequest = new RegExp(`${writeVerb}.{0,100}${memoryNoun}|${memoryNoun}.{0,100}${writeVerb}`, 'i').test(normalized)
    || /\b(?:lembre|remember|recuerda)(?:-se)?\s+(?:de\s+)?(?:que|that)\b/i.test(normalized)
    || /\b(?:guarde|guarda|memorize|memoriza)\b.{0,50}\b(?:isso|isto|que|o seguinte|essa|esta|esse|este)\b/i.test(normalized)
    || /\b(?:n[aã]o\s+esqueça|don'?t\s+forget|do\s+not\s+forget|no\s+olvides)\b/i.test(normalized)
    || /\bkeep\s+(?:this|that|it)\s+in\s+mind\b/i.test(normalized);
  return memoryRequest ? 'create_memory' : null;
}

export async function runChatPipeline(input: RunChatPipelineInput): Promise<string> {
  let activeModelId = input.modelId;
  let llmService = new LLMService(input.provider, input.modelBaseUrl, {
    githubToken: input.githubToken,
    geminiToken: input.googleApiKey,
    anthropicToken: input.anthropicApiKey,
  });
  let fallbackActivated = false;
  const activateFallback = () => {
    const fallback = input.fallbackModelId
      ? MODELS.find(model => model.id === input.fallbackModelId)
      : null;
    if (!fallback || fallbackActivated) return false;
    fallbackActivated = true;
    activeModelId = fallback.id;
    llmService = new LLMService(
      fallback.provider as ChatProvider,
      fallback.baseUrl ?? '',
      {
        githubToken: input.githubToken,
        geminiToken: input.googleApiKey,
        anthropicToken: input.anthropicApiKey,
      },
    );
    input.emit({ type: 'model_fallback', model: fallback.id, provider: fallback.provider });
    return true;
  };
  const complete = async (request: Parameters<LLMService['chatCompletion']>[0]) => {
    try {
      return await llmService.chatCompletion({ ...request, model: activeModelId });
    } catch (error) {
      if (!activateFallback()) throw error;
      return llmService.chatCompletion({ ...request, model: activeModelId });
    }
  };
  const forceTool = input.activeSkill?.force_tool ?? null;
  const requestedPersistenceTool = explicitlyRequestedPersistenceTool(input.message);
  const availableRequestedTool = requestedPersistenceTool
    && input.activeTools.some(tool => tool.function?.name === requestedPersistenceTool)
    ? requestedPersistenceTool
    : null;
  const initialToolChoice = availableRequestedTool
    ? { type: 'function', function: { name: availableRequestedTool } }
    : forceTool
    ? { type: 'function', function: { name: forceTool } }
    : input.provider !== 'gemini' ? 'auto' : undefined;

  const keepaliveInterval = setInterval(input.keepalive, 15_000);
  let data;
  try {
    data = await complete({
      messages: input.messages,
      model: activeModelId,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
      tools: input.activeTools,
      ...(initialToolChoice !== undefined && { tool_choice: initialToolChoice }),
      userId: input.user.id,
      conversationId: input.conversationId,
    });
  } finally {
    clearInterval(keepaliveInterval);
  }

  let assistantMessage = data.choices[0].message;
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    input.messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolCallId = toolCall.id || `call_${toolName}_${Date.now()}`;
      const toolArgs = parseToolArguments(toolCall.function.arguments);
      input.emit({ type: 'tool_call', name: toolName, args: toolArgs });

      try {
        const toolResult = await executeChatTool(toolName, toolArgs, {
          user: input.user,
          githubToken: input.githubToken,
          tavilyApiKey: input.tavilyApiKey,
          message: input.message,
          locale: input.locale,
          conversationId: input.conversationId,
          domain: input.domain || 'chat',
          emit: input.emit,
        });
        const resultEvent: Record<string, any> = {
          type: 'tool_result',
          name: toolName,
          success: true,
        };
        if (toolName === 'search_web') resultEvent.data = toolResult;
        input.emit(resultEvent);
        input.messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult),
        });
      } catch (error: any) {
        input.emit({ type: 'tool_result', name: toolName, success: false });
        input.messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }

    data = await complete({
      messages: input.messages,
      model: activeModelId,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
      tools: input.activeTools,
      tool_choice: 'auto',
      userId: input.user.id,
      conversationId: input.conversationId,
    });
    assistantMessage = data.choices[0].message;
  }

  let fullContent = '';
  while (true) {
    try {
      for await (const token of llmService.streamChatCompletion({
        messages: input.messages,
        model: activeModelId,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 2000,
        userId: input.user.id,
        conversationId: input.conversationId,
      })) {
        fullContent += token;
        input.emit({ type: 'token', content: token });
      }
      break;
    } catch (error) {
      if (fullContent || !activateFallback()) throw error;
    }
  }

  return fullContent;
}
