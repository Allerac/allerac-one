import { WorkerRunRepository, UserSettings, AgentRunRecord } from './worker-run.repository';
import { OrchestratorService, WorkerSpec } from './orchestrator.service';
import { WorkerService, WorkerExecutionConfig } from './worker.service';
import { v4 as uuid } from 'uuid';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

const STALE_RUN_MAX_AGE_MINUTES = 5;
const POLL_INTERVAL_MS = parseInt(process.env.AGENT_WORKER_POLL_MS || '3000', 10);
const MAX_CONCURRENT_RUNS = parseInt(process.env.AGENT_WORKER_MAX_CONCURRENT || '5', 10);
const WORKER_TIMEOUT_MS = parseInt(process.env.AGENT_WORKER_TIMEOUT_MS || '600000', 10); // 10 min

interface WorkerRunnerConfig {
  repository?: WorkerRunRepository;
  orchestrator?: OrchestratorService;
  worker?: WorkerService;
  pollIntervalMs?: number;
  maxConcurrentRuns?: number;
  staleRunMaxAgeMinutes?: number;
}

function runTag(runId: string): string {
  return `[${runId.substring(0, 8)}]`;
}

export class WorkerRunnerService {
  private repository: WorkerRunRepository;
  private orchestrator: OrchestratorService;
  private worker: WorkerService;
  private pollIntervalMs: number;
  private maxConcurrentRuns: number;
  private staleRunMaxAgeMinutes: number;
  private running: boolean;
  private activeRuns: Set<string>;
  private timer: NodeJS.Timeout | null;

  constructor(config?: WorkerRunnerConfig) {
    this.repository = config?.repository || new WorkerRunRepository();
    this.orchestrator = config?.orchestrator || new OrchestratorService();
    this.worker = config?.worker || new WorkerService();
    this.pollIntervalMs = config?.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.maxConcurrentRuns = config?.maxConcurrentRuns ?? MAX_CONCURRENT_RUNS;
    this.staleRunMaxAgeMinutes = config?.staleRunMaxAgeMinutes ?? STALE_RUN_MAX_AGE_MINUTES;
    this.running = false;
    this.activeRuns = new Set();
    this.timer = null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[WorkerRunner] Starting agent worker runner');
    this.pollLoop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[WorkerRunner] Stopped agent worker runner');
  }

  isRunning(): boolean {
    return this.running;
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  private pollLoop(): void {
    if (!this.running) return;

    this.processNext().finally(() => {
      this.timer = setTimeout(() => this.pollLoop(), this.pollIntervalMs);
    });
  }

  private async processNext(): Promise<void> {
    if (!this.running) return;

    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      return;
    }

    await this.retryStaleRuns();

    const run = await this.repository.claimPendingRun();
    if (!run) return;

    this.activeRuns.add(run.id);
    this.executeRun(run).finally(() => {
      this.activeRuns.delete(run.id);
    });
  }

  private async retryStaleRuns(): Promise<void> {
    const staleRuns = await this.repository.claimStaleRuns(this.staleRunMaxAgeMinutes);
    for (const run of staleRuns) {
      if (this.activeRuns.has(run.id)) continue;
      console.log(`[WorkerRunner] ${runTag(run.id)} Retrying stale run (was ${run.status})`);
      this.activeRuns.add(run.id);
      await this.repository.updateRunStatus(run.id, 'pending');
      this.executeRun(run).finally(() => {
        this.activeRuns.delete(run.id);
      });
    }
  }

  private startHeartbeat(runId: string): () => void {
    const interval = setInterval(async () => {
      await this.repository.updateRunHeartbeat(runId);
    }, 30000);

    return () => clearInterval(interval);
  }

  private async checkCancelled(runId: string): Promise<boolean> {
    const cancelled = await this.repository.isRunCancelled(runId);
    if (cancelled) {
      console.log(`[WorkerRunner] ${runTag(runId)} Run was cancelled, aborting`);
    }
    return cancelled;
  }

  private async executeRun(run: AgentRunRecord): Promise<void> {
    const stopHeartbeat = this.startHeartbeat(run.id);
    const tag = runTag(run.id);

    try {
      const settings = await this.repository.getUserSettings(run.user_id);
      if (!settings) {
        await this.failRun(run.id, 'User settings not found');
        return;
      }

      const modelProvider = (run.llm_provider as any) || 'ollama';
      const modelName = run.llm_model || 'qwen2.5:3b';

      const modelBaseUrl =
        modelProvider === 'ollama'
          ? OLLAMA_BASE_URL
          : modelProvider === 'gemini'
            ? GEMINI_BASE_URL
            : modelProvider === 'anthropic'
              ? ANTHROPIC_BASE_URL
              : GITHUB_BASE_URL;

      // Phase 1: Planning
      console.log(`[WorkerRunner] ${tag} Planning run`);
      await this.repository.updateRunStatus(run.id, 'planning');

      if (await this.checkCancelled(run.id)) return;

      const plan = await this.orchestrator.createPlan(run.prompt, modelName, modelProvider, modelBaseUrl);
      await this.repository.updateRunStatus(run.id, 'planning', { plan });

      if (await this.checkCancelled(run.id)) return;

      // Phase 2: Create worker records
      const workerIdMap = new Map<string, string>();
      const workersWithIds = plan.workers.map(w => {
        const realId = uuid();
        workerIdMap.set(w.id, realId);
        return { id: realId, name: w.name, task: w.task };
      });

      await this.repository.createWorkers(run.id, workersWithIds);

      const workersForExecution: WorkerSpec[] = plan.workers.map(w => ({
        ...w,
        id: workerIdMap.get(w.id) || w.id,
      }));

      // Phase 3: Execute workers
      console.log(`[WorkerRunner] ${tag} Executing ${workersWithIds.length} workers`);
      await this.repository.updateRunStatus(run.id, 'running');

      const workerResults = await this.executeWorkers(
        workersForExecution,
        run.id,
        run.user_id,
        settings,
        modelName,
        modelProvider,
        modelBaseUrl,
        settings.system_message || 'You are a helpful AI assistant.',
        tag,
        () => this.checkCancelled(run.id)
      );

      if (await this.checkCancelled(run.id)) return;

      // Phase 4: Aggregation
      console.log(`[WorkerRunner] ${tag} Aggregating results`);
      await this.repository.updateRunStatus(run.id, 'aggregating');

      let finalResult = '';
      const aggregateStream = this.orchestrator.aggregateResults(
        run.prompt,
        plan,
        workerResults.map(w => ({ workerId: w.workerId, name: w.name, task: w.task, result: w.result })),
        modelName,
        modelProvider,
        modelBaseUrl
      );

      for await (const token of aggregateStream) {
        if (await this.checkCancelled(run.id)) return;
        finalResult += token;
      }

      // Phase 5: Complete
      await this.repository.updateRunStatus(run.id, 'completed', { result: finalResult });
      console.log(`[WorkerRunner] ${tag} Run completed`);
    } catch (error: any) {
      console.error(`[WorkerRunner] ${tag} Run failed:`, error.message);
      await this.failRun(run.id, error.message || 'Unknown error');
    } finally {
      stopHeartbeat();
    }
  }

  private async executeWorkers(
    workerSpecs: WorkerSpec[],
    runId: string,
    userId: string,
    settings: UserSettings,
    modelName: string,
    modelProvider: string,
    modelBaseUrl: string,
    systemMessage: string,
    tag: string,
    isCancelled: () => Promise<boolean>
  ): Promise<Array<{ workerId: string; name: string; task: string; result: string; success: boolean }>> {
    const promises = workerSpecs.map(async (spec) => {
      await this.repository.updateWorkerStatus(spec.id, 'running', { progress_log: 'Starting...' });

      const workerHeartbeat = setInterval(() => {
        this.repository.appendWorkerProgress(spec.id, 'heartbeat').catch(() => {});
      }, 15000);

      try {
        const config: WorkerExecutionConfig = {
          userId,
          githubToken: settings.github_token || '',
          geminiToken: settings.google_api_key || undefined,
          anthropicToken: settings.anthropic_api_key || '',
          tavilyApiKey: settings.tavily_api_key || undefined,
          selectedModel: modelName,
          modelProvider: modelProvider as any,
          modelBaseUrl,
          systemMessage,
        };

        const result = await this.withTimeout(
          this.worker.executeWorker(
            spec,
            config,
            (token) => {
              this.repository.appendWorkerProgress(spec.id, `output:${token}`).catch(() => {});
            },
            (tool, args) => {
              const query = args.query ? `: "${args.query}"` : '';
              const command = args.command ? `: "${args.command.substring(0, 80)}"` : '';
              const detail = query || command || '';
              console.log(`[WorkerRunner] ${tag} Worker ${spec.name} tool call: ${tool}${detail}`);
              this.repository.appendWorkerProgress(spec.id, `tool:${tool}${detail}`).catch(() => {});
            }
          ),
          WORKER_TIMEOUT_MS,
          `Worker '${spec.name}' timed out after ${WORKER_TIMEOUT_MS / 1000}s`
        );

        clearInterval(workerHeartbeat);

        if (await isCancelled()) {
          return { workerId: spec.id, name: spec.name, task: spec.task, result: '', success: false };
        }

        if (result.success) {
          await this.repository.updateWorkerStatus(spec.id, 'completed', {
            result: result.result,
            tokens_used: result.tokensUsed || 0,
          });
        } else {
          await this.repository.updateWorkerStatus(spec.id, 'failed', {
            result: result.error || 'Unknown error',
          });
        }

        return {
          workerId: spec.id,
          name: spec.name,
          task: spec.task,
          result: result.result,
          success: result.success,
        };
      } catch (error: any) {
        clearInterval(workerHeartbeat);
        await this.repository.updateWorkerStatus(spec.id, 'failed', {
          result: error.message || 'Unknown error',
        });
        return {
          workerId: spec.id,
          name: spec.name,
          task: spec.task,
          result: '',
          success: false,
        };
      }
    });

    return Promise.all(promises);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private async failRun(runId: string, errorMessage: string): Promise<void> {
    await this.repository.updateRunStatus(runId, 'failed', { error_message: errorMessage });
    console.log(`[WorkerRunner] ${runTag(runId)} Run failed: ${errorMessage}`);
  }
}

// Singleton instance
let instance: WorkerRunnerService | null = null;

export function getWorkerRunner(): WorkerRunnerService {
  if (!instance) {
    instance = new WorkerRunnerService();
  }
  return instance;
}

export function resetWorkerRunner(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
