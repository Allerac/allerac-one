import { LLMService } from '../llm/llm.service';
import { SearchWebTool } from '../../tools/search-web.tool';
import { ShellTool } from '../../tools/shell.tool';
import { TOOLS } from '../../tools/tools';
import { WorkerSpec } from './orchestrator.service';
import { ALLERAC_SOUL } from '@/app/config/allerac-soul';

export interface WorkerExecutionConfig {
  userId: string;
  githubToken: string;
  geminiToken?: string;
  anthropicToken?: string;
  tavilyApiKey?: string;
  selectedModel: string;
  modelProvider: 'github' | 'ollama' | 'gemini' | 'anthropic';
  modelBaseUrl: string;
  systemMessage: string;
}

export interface WorkerResult {
  workerId: string;
  name: string;
  task: string;
  result: string;
  tokensUsed?: number;
  success: boolean;
  error?: string;
}

export class WorkerService {
  async executeWorker(
    spec: WorkerSpec,
    config: WorkerExecutionConfig,
    onToken?: (token: string) => void,
    onToolCall?: (tool: string, args: any) => void
  ): Promise<WorkerResult> {
    const { userId, githubToken, geminiToken, anthropicToken, tavilyApiKey, selectedModel, modelProvider, modelBaseUrl, systemMessage } =
      config;

    try {
      const llmService = new LLMService(modelProvider, modelBaseUrl, { githubToken, geminiToken, anthropicToken });

      // Build worker-specific system message
      let enrichedSystemMessage = ALLERAC_SOUL;
      if (systemMessage && systemMessage !== 'You are a helpful AI assistant.') {
        enrichedSystemMessage += `\n\n## About the user\n${systemMessage}`;
      }

      enrichedSystemMessage += `\n\n## Your Task\n${spec.task}`;

      // Inject user-scoped workspace path
      const workspacePath = `/workspace/projects/${userId}`;
      enrichedSystemMessage = enrichedSystemMessage.replace(/\/workspace\/projects\//g, `${workspacePath}/`);
      enrichedSystemMessage = enrichedSystemMessage.replace(/\/workspace\/projects(?=\s|$|["'])/g, workspacePath);

      // Filter tools based on worker spec
      const availableTools = spec.tools.length > 0 ? TOOLS.filter((t) => spec.tools.includes(t.function.name)) : TOOLS;

      // Initial message: just the worker task
      const messages: Array<{ role: string; content: string | any[]; tool_call_id?: string; tool_calls?: any }> = [
        { role: 'system', content: enrichedSystemMessage },
        { role: 'user', content: spec.task },
      ];

      let fullResponse = '';
      let totalTokens = 0;

      // Tool call loop
      let response = await llmService.chatCompletion({
        model: selectedModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        tools: availableTools,
        tool_choice: 'auto',
      });

      let assistantMessage = response.choices[0].message;
      totalTokens += response.usage?.total_tokens || 0;

      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolCallId = toolCall.id || `call_${toolName}_${Date.now()}`;
          const rawArgs = toolCall.function.arguments;
          const toolArgs =
            rawArgs == null
              ? {}
              : typeof rawArgs === 'object'
                ? rawArgs
                : (() => {
                    try {
                      return JSON.parse(rawArgs);
                    } catch {
                      return {};
                    }
                  })();

          onToolCall?.(toolName, toolArgs);

          try {
            let toolResult: any;
            if (toolName === 'search_web' && tavilyApiKey) {
              const searchTool = new SearchWebTool(tavilyApiKey);
              toolResult = await searchTool.execute(toolArgs.query);
            } else if (toolName === 'execute_shell') {
              const shellTool = new ShellTool();
              const scopedCommand = (toolArgs.command as string || '').replace(/\/workspace\/projects\//g, `/workspace/projects/${userId}/`);
              const scopedCwd = toolArgs.cwd ? (toolArgs.cwd as string).replace(/\/workspace\/projects\//g, `/workspace/projects/${userId}/`) : toolArgs.cwd;
              toolResult = await shellTool.execute(scopedCommand, scopedCwd, toolArgs.timeout);
            } else {
              toolResult = { error: `Tool ${toolName} not available in worker context` };
            }

            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify(toolResult),
            });
          } catch (error: any) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }

        response = await llmService.chatCompletion({
          model: selectedModel,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
          tools: availableTools,
          tool_choice: 'auto',
        });

        assistantMessage = response.choices[0].message;
        totalTokens += response.usage?.total_tokens || 0;
      }

      fullResponse = assistantMessage.content || '';

      // Stream the final response token by token (simulate streaming)
      for (const word of fullResponse.split(' ')) {
        onToken?.(`${word} `);
      }

      return {
        workerId: spec.id,
        name: spec.name,
        task: spec.task,
        result: fullResponse,
        tokensUsed: totalTokens,
        success: true,
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown worker error';
      return {
        workerId: spec.id,
        name: spec.name,
        task: spec.task,
        result: '',
        success: false,
        error: errorMessage,
      };
    }
  }
}

export const workerService = new WorkerService();
