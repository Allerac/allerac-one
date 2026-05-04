import { WorkerRunnerService } from '@/app/services/agents/worker-runner.service';
import { WorkerRunRepository, AgentRunRecord } from '@/app/services/agents/worker-run.repository';
import { OrchestratorService } from '@/app/services/agents/orchestrator.service';
import { WorkerService } from '@/app/services/agents/worker.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'w1'),
}));

function createMockRepository(): jest.Mocked<WorkerRunRepository> {
  return {
    claimPendingRun: jest.fn(),
    claimStaleRuns: jest.fn().mockResolvedValue([]),
    updateRunStatus: jest.fn(),
    updateRunHeartbeat: jest.fn(),
    getRun: jest.fn(),
    createWorkers: jest.fn(),
    updateWorkerStatus: jest.fn(),
    appendWorkerProgress: jest.fn(),
    getRunWorkers: jest.fn(),
    getUserSettings: jest.fn(),
  } as any;
}

function createMockOrchestrator(): jest.Mocked<OrchestratorService> {
  return {
    evaluateComplexity: jest.fn(),
    createPlan: jest.fn(),
    aggregateResults: jest.fn(),
  } as any;
}

function createMockWorker(): jest.Mocked<WorkerService> {
  return {
    executeWorker: jest.fn(),
  } as any;
}

function makePendingRun(overrides?: Partial<AgentRunRecord>): AgentRunRecord {
  return {
    id: 'run_1',
    conversation_id: 'conv_1',
    user_id: 'user_1',
    status: 'pending',
    prompt: 'test prompt',
    plan: null,
    result: null,
    error_message: null,
    started_at: new Date(),
    completed_at: null,
    last_heartbeat: new Date(),
    llm_model: null,
    llm_provider: null,
    ...overrides,
  };
}

const defaultSettings = {
  github_token: 'gh_token',
  tavily_api_key: 'tv_key',
  google_api_key: 'g_key',
  anthropic_api_key: 'anth_key',
  system_message: 'You are helpful',
  model_provider: 'ollama',
  model_name: 'qwen2.5:3b',
};

describe('WorkerRunnerService', () => {
  let repo: jest.Mocked<WorkerRunRepository>;
  let orchestrator: jest.Mocked<OrchestratorService>;
  let worker: jest.Mocked<WorkerService>;
  let service: WorkerRunnerService;

  beforeEach(() => {
    repo = createMockRepository();
    orchestrator = createMockOrchestrator();
    worker = createMockWorker();

    service = new WorkerRunnerService({
      repository: repo,
      orchestrator,
      worker,
      pollIntervalMs: 100,
      maxConcurrentRuns: 5,
      staleRunMaxAgeMinutes: 5,
    });

    repo.getUserSettings.mockResolvedValue(defaultSettings);
    orchestrator.createPlan.mockResolvedValue({
      taskBreakdown: 'do stuff',
      workers: [{
        id: 'w1',
        name: 'Researcher',
        task: 'research task',
        tools: ['search_web'],
      }],
      aggregationStrategy: 'combine',
    });
    worker.executeWorker.mockResolvedValue({
      workerId: 'w1',
      name: 'Researcher',
      task: 'research task',
      result: 'research result',
      success: true,
      tokensUsed: 500,
    });
    orchestrator.aggregateResults.mockImplementation(async function* () {
      yield 'final ';
      yield 'result';
    });
  });

  afterEach(() => {
    service.stop();
  });

  describe('start/stop', () => {
    it('should start the worker loop', async () => {
      await service.start();
      expect(service.isRunning()).toBe(true);
    });

    it('should stop the worker loop', async () => {
      await service.start();
      service.stop();
      expect(service.isRunning()).toBe(false);
    });

    it('should not start twice', async () => {
      await service.start();
      await service.start();
      expect(service.isRunning()).toBe(true);
    });
  });

  describe('getActiveRunCount()', () => {
    it('should return 0 when no runs active', () => {
      expect(service.getActiveRunCount()).toBe(0);
    });
  });

  describe('executeRun lifecycle', () => {
    it('should transition through planning, running, aggregating, completed', async () => {
      // Directly trigger processing by claiming a run
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      // Wait for the run to be fully processed
      await new Promise(r => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith('run_1', 'planning');
      expect(repo.updateRunStatus).toHaveBeenCalledWith('run_1', 'running');
      expect(repo.updateRunStatus).toHaveBeenCalledWith('run_1', 'aggregating');
      expect(repo.updateRunStatus).toHaveBeenCalledWith(
        'run_1',
        'completed',
        expect.objectContaining({ result: 'final result' })
      );
    });

    it('should create worker records during planning', async () => {
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.createWorkers).toHaveBeenCalledWith(
        'run_1',
        expect.arrayContaining([expect.objectContaining({ id: 'w1' })])
      );
    });

    it('should execute workers and update their status', async () => {
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(worker.executeWorker).toHaveBeenCalled();
      expect(repo.updateWorkerStatus).toHaveBeenCalledWith(
        'w1',
        'running'
      );
      expect(repo.updateWorkerStatus).toHaveBeenCalledWith(
        'w1',
        'completed',
        expect.any(Object)
      );
    });

    it('should mark run as failed when orchestrator throws', async () => {
      orchestrator.createPlan.mockRejectedValue(new Error('Plan failed'));
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith(
        'run_1',
        'failed',
        expect.objectContaining({ error_message: 'Plan failed' })
      );
    });

    it('should mark run as failed when user settings missing', async () => {
      repo.getUserSettings.mockResolvedValue(null);
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith(
        'run_1',
        'failed',
        expect.objectContaining({ error_message: 'User settings not found' })
      );
    });

    it('should continue run when a worker fails', async () => {
      worker.executeWorker.mockResolvedValue({
        workerId: 'w1',
        name: 'Researcher',
        task: 'research task',
        result: 'error',
        success: false,
        error: 'Worker failed',
      });
      repo.claimPendingRun
        .mockResolvedValueOnce(makePendingRun())
        .mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.updateWorkerStatus).toHaveBeenCalledWith(
        'w1',
        'failed',
        expect.any(Object)
      );
      // Run should still complete (aggregation happens with failed workers)
      expect(repo.updateRunStatus).toHaveBeenCalledWith(
        'run_1',
        'completed',
        expect.any(Object)
      );
    });
  });

  describe('retryStaleRuns()', () => {
    it('should retry stale runs', async () => {
      const staleRun = makePendingRun({ id: 'stale_1', status: 'running' });
      repo.claimStaleRuns.mockResolvedValueOnce([staleRun]);
      repo.claimPendingRun.mockResolvedValue(null);

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.updateRunStatus).toHaveBeenCalledWith('stale_1', 'pending');
    });

    it('should not retry runs already active', async () => {
      const staleRun = makePendingRun({ id: 'stale_1', status: 'running' });
      repo.claimStaleRuns.mockResolvedValueOnce([staleRun]);
      repo.claimPendingRun.mockResolvedValue(null);

      // Manually mark as active
      (service as any).activeRuns.add('stale_1');

      await service.start();
      await new Promise(r => setTimeout(r, 50));

      const statusCalls = (repo.updateRunStatus as jest.Mock).mock.calls;
      const staleCalls = statusCalls.filter((c: any[]) => c[0] === 'stale_1');
      expect(staleCalls).toHaveLength(0);
    });
  });

  describe('max concurrent runs', () => {
    it('should not claim new runs when at capacity', async () => {
      const limitedService = new WorkerRunnerService({
        repository: repo,
        orchestrator,
        worker,
        pollIntervalMs: 100,
        maxConcurrentRuns: 0,
      });

      await limitedService.start();
      await new Promise(r => setTimeout(r, 50));

      expect(repo.claimPendingRun).not.toHaveBeenCalled();

      limitedService.stop();
    });
  });
});
