import { LLMService } from '../llm/llm.service';

export interface ComplexityResult {
  isComplex: boolean;
  reason: string;
  score: number; // 0-100
}

export interface WorkerSpec {
  id: string;
  name: string;
  task: string;
  suggestedSkill?: string;
  tools: string[];
}

export interface AgentPlan {
  taskBreakdown: string;
  workers: WorkerSpec[];
  aggregationStrategy: string;
}

export interface WorkerResult {
  workerId: string;
  name: string;
  task: string;
  result: string;
  tokensUsed?: number;
}

export class OrchestratorService {
  private githubToken?: string;
  private geminiToken?: string;
  private anthropicToken?: string;

  constructor(config?: { githubToken?: string; geminiToken?: string; anthropicToken?: string }) {
    this.githubToken = config?.githubToken;
    this.geminiToken = config?.geminiToken;
    this.anthropicToken = config?.anthropicToken;
  }

  async evaluateComplexity(
    message: string,
    conversationContext?: string
  ): Promise<ComplexityResult> {
    const llmService = new LLMService('ollama', '/api/ollama');

    const systemPrompt = `You are a task complexity evaluator.
Analyze the user's request and determine if it requires parallel agent execution.

Complex tasks typically:
- Have multiple independent subtasks that could be parallelized
- Require different skills or tools (e.g., research + analysis + writing)
- Involve independent data gathering or processing steps
- Could benefit from parallel execution to save time

Simple tasks typically:
- Can be done in a single LLM pass
- Have sequential dependencies
- Don't benefit from parallelization
- Are straightforward questions or requests

Respond in JSON format:
{
  "isComplex": boolean,
  "reason": "brief explanation",
  "score": number (0-100)
}`;

    const context = conversationContext ? `\n\nConversation context:\n${conversationContext}` : '';

    try {
      const response = await llmService.chatCompletion({
        model: 'qwen2.5:3b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `User request: ${message}${context}` },
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);

      return {
        isComplex: parsed.isComplex,
        reason: parsed.reason,
        score: parsed.score,
      };
    } catch (error) {
      console.error('[OrchestratorService] Complexity evaluation failed:', error);
      return {
        isComplex: false,
        reason: 'Evaluation failed, defaulting to simple flow',
        score: 0,
      };
    }
  }

  async createPlan(
    message: string,
    selectedModel: string,
    modelProvider: 'github' | 'ollama' | 'gemini' | 'anthropic',
    modelBaseUrl: string,
    conversationContext?: string
  ): Promise<AgentPlan> {
    const llmService = new LLMService(modelProvider, modelBaseUrl, {
      githubToken: this.githubToken,
      geminiToken: this.geminiToken,
      anthropicToken: this.anthropicToken,
    });

    const systemPrompt = `You are an expert task planner that breaks down complex requests into parallel subtasks.

Your job is to create a detailed plan for how multiple agents (workers) can tackle a request in parallel.

Each worker should:
- Have a clear, independent task
- Use specific tools if applicable (search_web, execute_shell, etc.)
- Be executable in parallel with other workers

Tools available: search_web, execute_shell

Respond in JSON format:
{
  "taskBreakdown": "brief explanation of how the task will be divided",
  "workers": [
    {
      "id": "worker_1",
      "name": "Research Specialist",
      "task": "detailed task description",
      "suggestedSkill": "optional skill name",
      "tools": ["search_web"]
    }
  ],
  "aggregationStrategy": "how to combine worker results"
}

Max 5 workers. Keep tasks independent and parallelizable.`;

    const context = conversationContext ? `\n\nConversation context:\n${conversationContext}` : '';

    try {
      const response = await llmService.chatCompletion({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Break down this request into parallel subtasks:\n${message}${context}` },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      });

      const content = response.choices[0].message.content;
      const parsed = JSON.parse(content);

      return {
        taskBreakdown: parsed.taskBreakdown,
        workers: parsed.workers.map((w: any) => ({
          id: w.id || `worker_${Math.random().toString(36).substr(2, 9)}`,
          name: w.name,
          task: w.task,
          suggestedSkill: w.suggestedSkill,
          tools: w.tools || [],
        })),
        aggregationStrategy: parsed.aggregationStrategy,
      };
    } catch (error) {
      console.error('[OrchestratorService] Plan creation failed:', error);
      // Fallback: single worker
      return {
        taskBreakdown: 'Unable to create detailed plan, using single agent',
        workers: [
          {
            id: 'worker_1',
            name: 'General Worker',
            task: message,
            tools: ['search_web', 'execute_shell'],
          },
        ],
        aggregationStrategy: 'Return worker result directly',
      };
    }
  }

  async* aggregateResults(
    originalMessage: string,
    plan: AgentPlan,
    workerResults: WorkerResult[],
    selectedModel: string,
    modelProvider: 'github' | 'ollama' | 'gemini' | 'anthropic',
    modelBaseUrl: string
  ): AsyncGenerator<string> {
    const llmService = new LLMService(modelProvider, modelBaseUrl, {
      githubToken: this.githubToken,
      geminiToken: this.geminiToken,
      anthropicToken: this.anthropicToken,
    });

    const systemPrompt = `You are an expert synthesizer that combines results from parallel agents.

Original user request: ${originalMessage}

Agent Plan:
${plan.taskBreakdown}

Aggregation strategy: ${plan.aggregationStrategy}

Your job is to synthesize the agent results into a cohesive, well-organized final response.
Be concise, highlight key findings, and ensure the response directly addresses the original request.`;

    const workerSummary = workerResults
      .map(
        (r) => `
Agent: ${r.name}
Task: ${r.task}
Result:
${r.result}
`
      )
      .join('\n---\n');

    const userPrompt = `Synthesize these parallel agent results into a final response:\n\n${workerSummary}`;

    try {
      const stream = llmService.streamChatCompletion({
        model: selectedModel,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.7,
        max_tokens: 2000,
      });

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      console.error('[OrchestratorService] Aggregation failed:', error);
      yield `\n\nAggregation failed. Raw results:\n${workerSummary}`;
    }
  }
}

export const orchestratorService = new OrchestratorService();
