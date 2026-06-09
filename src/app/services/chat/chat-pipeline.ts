import type { User } from '@/app/services/auth/auth.service';
import { LLMService } from '@/app/services/llm/llm.service';
import type { Skill } from '@/app/services/skills/skills.service';
import { executeChatTool } from './chat-tool-runner';
import type { ChatProvider } from './chat-request-parser';

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
  githubToken: string;
  googleApiKey: string;
  anthropicApiKey: string;
  tavilyApiKey?: string;
  user: User;
  conversationId: string;
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

export async function runChatPipeline(input: RunChatPipelineInput): Promise<string> {
  const llmService = new LLMService(input.provider, input.modelBaseUrl, {
    githubToken: input.githubToken,
    geminiToken: input.googleApiKey,
    anthropicToken: input.anthropicApiKey,
  });
  const forceTool = input.activeSkill?.force_tool ?? null;
  const initialToolChoice = forceTool
    ? { type: 'function', function: { name: forceTool } }
    : input.provider !== 'gemini' ? 'auto' : undefined;

  const keepaliveInterval = setInterval(input.keepalive, 15_000);
  let data;
  try {
    data = await llmService.chatCompletion({
      messages: input.messages,
      model: input.modelId,
      temperature: 0.7,
      max_tokens: 2000,
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

    data = await llmService.chatCompletion({
      messages: input.messages,
      model: input.modelId,
      temperature: 0.7,
      max_tokens: 2000,
      tools: input.activeTools,
      tool_choice: 'auto',
      userId: input.user.id,
      conversationId: input.conversationId,
    });
    assistantMessage = data.choices[0].message;
  }

  let fullContent = '';
  for await (const token of llmService.streamChatCompletion({
    messages: input.messages,
    model: input.modelId,
    temperature: 0.7,
    max_tokens: 2000,
    userId: input.user.id,
    conversationId: input.conversationId,
  })) {
    fullContent += token;
    input.emit({ type: 'token', content: token });
  }

  return fullContent;
}
