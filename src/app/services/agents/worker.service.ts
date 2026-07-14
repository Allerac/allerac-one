import { LLMService } from '../llm/llm.service';
import { SearchWebTool } from '../../tools/search-web.tool';
import { ShellTool } from '../../tools/shell.tool';
import { buildGithubTools } from '../../tools/github.tool';
import { GITHUB_TOOL_NAMES } from '../../tools/github.tool.definitions';
import { buildLogsTool } from '../../tools/logs.tool';
import { LOGS_TOOL_NAMES } from '../../tools/logs.tool.definitions';
import { TOOLS } from '../../tools/tools';
import { WorkerSpec } from './orchestrator.service';
import { ALLERAC_SOUL } from '@/app/config/allerac-soul';
import { getUserWorkspaceRoot, normalizeWorkspaceReferences, resolveShellCwd } from '@/app/lib/workspace-paths';

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
  isAdmin: boolean;
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
    onToolCall?: (tool: string, args: any) => void,
    onToolResult?: (tool: string, success: boolean, detail: string) => void
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
      const workspacePath = getUserWorkspaceRoot(userId);
      enrichedSystemMessage = enrichedSystemMessage.replace(/\/workspace\/projects\//g, `${workspacePath}/`);
      enrichedSystemMessage = enrichedSystemMessage.replace(/\/workspace\/projects(?=\s|$|["'])/g, workspacePath);

      // Filter tools based on worker spec; logs tools are admin-only (the buffer
      // aggregates every user's activity in this process)
      let availableTools = spec.tools.length > 0 ? TOOLS.filter((t) => spec.tools.includes(t.function.name)) : TOOLS;
      if (!config.isAdmin) {
        availableTools = availableTools.filter((t) => !LOGS_TOOL_NAMES.includes(t.function.name));
      }

      // Initial message: just the worker task
      const messages: Array<{ role: string; content: string | any[]; tool_call_id?: string; tool_calls?: any }> = [
        { role: 'system', content: enrichedSystemMessage },
        { role: 'user', content: spec.task },
      ];

      let fullResponse = '';
      let totalTokens = 0;
      const MAX_TOOL_CALL_ITERATIONS = 30;
      const toolCallHistory: string[] = [];
      const toolResults: string[] = [];

      let response = await llmService.chatCompletion({
        model: selectedModel,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        tools: availableTools,
        tool_choice: 'auto',
      });

      let assistantMessage = response.choices[0].message;
      totalTokens += response.usage?.total_tokens || 0;
      let iterations = 0;

      while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        if (iterations >= MAX_TOOL_CALL_ITERATIONS) {
          fullResponse = toolResults.length > 0
            ? toolResults.join('\n\n')
            : 'Worker stopped: maximum tool call iterations reached.';
          break;
        }
        iterations++;

        messages.push(assistantMessage);

        let allCallsWereDuplicates = true;

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

          const toolCallSignature = `${toolName}:${JSON.stringify(toolArgs)}`;
          if (toolCallHistory.includes(toolCallSignature)) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify({ error: `Tool call "${toolName}" with same arguments already executed. Stop repeating actions and provide your final answer.` }),
            });
            continue;
          }
          allCallsWereDuplicates = false;
          toolCallHistory.push(toolCallSignature);

          onToolCall?.(toolName, toolArgs);

          try {
            let toolResult: any;
            if (toolName === 'search_web' && tavilyApiKey) {
              const searchTool = new SearchWebTool(tavilyApiKey);
              toolResult = await searchTool.execute(toolArgs.query);
            } else if (toolName === 'execute_shell') {
              const shellTool = new ShellTool();
              const safeCwd = resolveShellCwd(userId, toolArgs.cwd);
              if (!safeCwd) {
                toolResult = { error: 'Invalid cwd. Shell commands must run inside your workspace.' };
              } else {
                const scopedCommand = normalizeWorkspaceReferences(userId, String(toolArgs.command || ''));
                toolResult = await shellTool.execute(scopedCommand, safeCwd, toolArgs.timeout);
              }
            } else if (GITHUB_TOOL_NAMES.includes(toolName)) {
              if (!githubToken) {
                toolResult = { error: 'GitHub token not configured.' };
              } else {
                const githubHandlers = buildGithubTools(githubToken);
                const handler = githubHandlers[toolName as keyof typeof githubHandlers] as (args: any) => Promise<any>;
                toolResult = await handler(toolArgs);
              }
            } else if (LOGS_TOOL_NAMES.includes(toolName)) {
              const logsHandlers = buildLogsTool(config.isAdmin);
              const handler = logsHandlers[toolName as keyof typeof logsHandlers] as (args: any) => Promise<any>;
              toolResult = await handler(toolArgs);
            } else {
              toolResult = { error: `Tool ${toolName} not available in worker context` };
            }

            const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
            toolResults.push(`## ${toolName} result:\n${resultText}`);
            const shortResult = resultText.slice(0, 400).replace(/\n/g, ' ');
            onToolResult?.(toolName, true, shortResult);

            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify(toolResult),
            });
          } catch (error: any) {
            console.error(`[Worker] Tool ${toolName} failed:`, error.message);
            onToolResult?.(toolName, false, error.message);
            messages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }

        if (allCallsWereDuplicates && toolResults.length > 0) {
          fullResponse = toolResults.join('\n\n');
          break;
        }

        response = await llmService.chatCompletion({
          model: selectedModel,
          messages,
          temperature: 0.7,
          max_tokens: 4000,
          tools: availableTools,
          tool_choice: 'auto',
        });

        assistantMessage = response.choices[0].message;
        totalTokens += response.usage?.total_tokens || 0;
      }

      const finalContent = assistantMessage.content || '';
      if (finalContent) {
        fullResponse = fullResponse ? `${fullResponse}\n\n${finalContent}` : finalContent;
      } else if (!fullResponse && toolResults.length > 0) {
        fullResponse = toolResults.join('\n\n');
      }

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
