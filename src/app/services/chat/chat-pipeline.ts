import { dataPageLinkForTool } from '@/lib/legacy-domains';
import type { User } from '@/app/services/auth/auth.service';
import { LLMService } from '@/app/services/llm/llm.service';
import type { Skill } from '@/app/services/skills/skills.service';
import { executeChatTool } from './chat-tool-runner';
import type { ChatToolPolicy } from './chat-tool-registry';
import type { ChatProvider } from './chat-request-parser';
import { MODELS } from '@/app/services/llm/models';
import { EMPTY_REPLY_MESSAGE } from './empty-reply';

/** Tool-call rounds per turn before the model is made to answer with what it has. */
export const MAX_TOOL_ROUNDS = 8;

/** Shown (and saved) when the model produced no text even after retrying. */
export { EMPTY_REPLY_MESSAGE };

/**
 * Structured, single-line log for chat pipeline events. Never includes tool
 * arguments, results or message text.
 */
function logChatEvent(event: string, fields: Record<string, unknown>): void {
  console.log(`[ChatPipeline] ${JSON.stringify({ event, ...fields })}`);
}

/** Text of an assistant message whose content may be a string or content parts. */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  return '';
}

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
  openaiApiKey: string;
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
  toolPolicy?: ChatToolPolicy;
  keepalive: () => void;
  /** IANA timezone forwarded to tools (e.g. get_today_info). */
  timeZone?: string;
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
  const allowedToolNames = new Set(
    input.activeTools.map(tool => tool.function?.name).filter(Boolean),
  );
  let activeModelId = input.modelId;
  let llmService = new LLMService(input.provider, input.modelBaseUrl, {
    githubToken: input.githubToken,
    geminiToken: input.googleApiKey,
    anthropicToken: input.anthropicApiKey,
    openaiToken: input.openaiApiKey,
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
        openaiToken: input.openaiApiKey,
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
  // Only force a tool the model was actually offered (e.g. execute_shell is
  // removed for users without shell access even if the skill forces it).
  const skillForceTool = input.activeSkill?.force_tool ?? null;
  const forceTool = skillForceTool
    && input.activeTools.some(tool => tool?.function?.name === skillForceTool)
    ? skillForceTool
    : null;
  const requestedPersistenceTool = explicitlyRequestedPersistenceTool(input.message);
  const availableRequestedTool = requestedPersistenceTool
    && input.activeTools.some(tool => tool.function?.name === requestedPersistenceTool)
    ? requestedPersistenceTool
    : null;
  // tool_choice is only meaningful (and, for OpenAI, only accepted at all) when there's
  // at least one tool to choose from — domains with zero tools (e.g. NO_TOOL_DOMAINS)
  // must never send it, or the OpenAI provider rejects the whole request outright.
  const initialToolChoice = input.activeTools.length === 0 ? undefined
    : availableRequestedTool
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
      // Some providers reject an explicit empty tools array outright (only
      // omitting the field or a non-empty array is valid) — a domain with zero
      // tools (NO_TOOL_DOMAINS in chat-tool-registry.ts) would otherwise 500
      // on every message.
      ...(input.activeTools.length > 0 && { tools: input.activeTools }),
      ...(initialToolChoice !== undefined && { tool_choice: initialToolChoice }),
      userId: input.user.id,
      conversationId: input.conversationId,
    });
  } finally {
    clearInterval(keepaliveInterval);
  }

  let assistantMessage = data.choices[0].message;
  let toolRounds = 0;
  while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    if (toolRounds >= MAX_TOOL_ROUNDS) {
      // Loop guard: stop calling tools and let the final step answer with what we have.
      logChatEvent('tool_round_cap', { conversationId: input.conversationId, domain: input.domain, rounds: toolRounds });
      break;
    }
    toolRounds += 1;
    input.messages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolCallId = toolCall.id || `call_${toolName}_${Date.now()}`;
      const toolArgs = parseToolArguments(toolCall.function.arguments);
      input.emit({ type: 'tool_call', name: toolName, args: toolArgs });

      // Treat the active tool list as an authorization boundary, not merely a
      // hint sent to the model. Providers can return malformed or unexpected
      // tool calls and those must never reach the runner.
      if (!allowedToolNames.has(toolName)) {
        logChatEvent('tool_call', { conversationId: input.conversationId, domain: input.domain, tool: toolName, ok: false, error: 'not_allowed', ms: 0 });
        input.emit({ type: 'tool_result', name: toolName, success: false });
        input.messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: `Tool ${toolName} is not allowed` }),
        });
        continue;
      }

      const toolStarted = Date.now();
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
          toolPolicy: input.toolPolicy,
          timeZone: input.timeZone,
        });
        const reportedError = toolResult && typeof toolResult === 'object' && 'error' in toolResult && toolResult.error;
        logChatEvent('tool_call', {
          conversationId: input.conversationId, domain: input.domain, tool: toolName,
          ok: !reportedError, ...(reportedError ? { error: 'tool_reported_error' } : {}), ms: Date.now() - toolStarted,
        });
        const resultEvent: Record<string, any> = {
          type: 'tool_result',
          name: toolName,
          success: true,
        };
        if (toolName === 'search_web') resultEvent.data = toolResult;
        // Deep link to the module's data page (relative URL), rendered under the reply.
        const pageLink = reportedError ? null : dataPageLinkForTool(toolName);
        if (pageLink) resultEvent.link = pageLink;
        input.emit(resultEvent);
        input.messages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult),
        });
      } catch (error: any) {
        logChatEvent('tool_call', {
          conversationId: input.conversationId, domain: input.domain, tool: toolName,
          ok: false, error: 'exception', ms: Date.now() - toolStarted,
        });
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
      ...(input.activeTools.length > 0 && { tools: input.activeTools }),
      ...(input.activeTools.length > 0 && input.provider !== 'gemini' && { tool_choice: 'auto' }),
      userId: input.user.id,
      conversationId: input.conversationId,
    });
    assistantMessage = data.choices[0].message;
  }

  // After tools ran, the model's last message usually already holds the answer:
  // use it rather than asking again (a second call could come back empty).
  const toolLoopText = toolRounds > 0 && !((assistantMessage.tool_calls?.length ?? 0) > 0)
    ? messageText(assistantMessage.content)
    : '';
  if (toolLoopText.trim()) {
    input.emit({ type: 'token', content: toolLoopText });
    return toolLoopText;
  }

  // Final answer. Once tools ran, keep the same tool list (some providers reject
  // a tool-call history without tool definitions) but ask for text only.
  const finalToolOptions = toolRounds > 0 && input.activeTools.length > 0
    ? {
      tools: input.activeTools,
      ...(input.provider !== 'gemini' && { tool_choice: 'none' }),
    }
    : {};
  let fullContent = '';
  while (true) {
    try {
      for await (const token of llmService.streamChatCompletion({
        messages: input.messages,
        model: activeModelId,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 2000,
        ...finalToolOptions,
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

  if (fullContent.trim()) return fullContent;

  logChatEvent('empty_content', { conversationId: input.conversationId, domain: input.domain, stage: 'stream', toolRounds });
  try {
    const retry = await complete({
      messages: input.messages,
      model: activeModelId,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2000,
      ...finalToolOptions,
      userId: input.user.id,
      conversationId: input.conversationId,
    });
    const retryText = messageText(retry?.choices?.[0]?.message?.content);
    if (retryText.trim()) {
      input.emit({ type: 'token', content: retryText });
      return retryText;
    }
  } catch (error) {
    logChatEvent('empty_content', {
      conversationId: input.conversationId, domain: input.domain, stage: 'retry_error',
      error: error instanceof Error ? error.name : 'error',
    });
  }

  logChatEvent('empty_content', { conversationId: input.conversationId, domain: input.domain, stage: 'final', toolRounds });
  input.emit({ type: 'empty_reply' });
  input.emit({ type: 'token', content: EMPTY_REPLY_MESSAGE });
  return EMPTY_REPLY_MESSAGE;
}
