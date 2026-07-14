import '../../../__tests__/__mocks__/db';
import pool from '@/app/clients/db';
import { WorkerRunRepository } from '@/app/services/agents/worker-run.repository';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';

const mockQuery = pool.query as jest.Mock;

describe('WorkerRunRepository', () => {
  let repo: WorkerRunRepository;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockQuery.mockReset();
    repo = new WorkerRunRepository();
  });

  describe('claimPendingRun()', () => {
    it('should return a pending run', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'run_1',
          status: 'pending',
          prompt: 'test prompt',
          user_id: 'user_1',
          conversation_id: 'conv_1',
        }],
      });

      const result = await repo.claimPendingRun();

      expect(result).not.toBeNull();
      expect(result!.id).toBe('run_1');
    });

    it('should return null when no pending runs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.claimPendingRun();

      expect(result).toBeNull();
    });
  });

  describe('claimStaleRuns()', () => {
    it('should return stale runs older than threshold', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'run_stale', status: 'running' }],
      });

      const result = await repo.claimStaleRuns(5);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('run_stale');
    });

    it('should return empty array when no stale runs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.claimStaleRuns(5);

      expect(result).toEqual([]);
    });
  });

  describe('updateRunStatus()', () => {
    it('should update status and heartbeat', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.updateRunStatus('run_1', 'planning');

      expect(mockQuery).toHaveBeenCalled();
      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('UPDATE agent_runs');
      expect(call[0]).toContain('last_heartbeat');
      expect(call[1]).toContain('run_1');
      expect(call[1]).toContain('planning');
    });

    it('should include optional fields when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.updateRunStatus('run_1', 'failed', {
        error_message: 'something broke',
      });

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('error_message');
    });
  });

  describe('updateRunHeartbeat()', () => {
    it('should update heartbeat timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.updateRunHeartbeat('run_1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('last_heartbeat'),
        ['run_1']
      );
    });
  });

  describe('getRun()', () => {
    it('should return run by id', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'run_1', status: 'running', prompt: 'hello' }],
      });

      const result = await repo.getRun('run_1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('run_1');
    });

    it('should return null for non-existent run', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.getRun('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('user-owned run access', () => {
    it('scopes a run lookup to its owner', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.getRunForUser('run_1', 'user_2');

      expect(result).toBeNull();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        ['run_1', 'user_2']
      );
    });

    it('scopes worker lookup through the owning run', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.getRunWorkersForUser('run_1', 'user_2');

      expect(result).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE aw.run_id = $1 AND ar.user_id = $2'),
        ['run_1', 'user_2']
      );
    });

    it('cancels a run only when it belongs to the user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await repo.cancelRunForUser('run_1', 'user_2');

      expect(result).toBe(false);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND user_id = $2'),
        ['run_1', 'user_2']
      );
    });
  });

  describe('createWorkers()', () => {
    it('should insert worker records', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.createWorkers('run_1', [
        { id: 'w1', name: 'Researcher', task: 'research' },
        { id: 'w2', name: 'Analyst', task: 'analyze' },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(2);
      const firstCall = mockQuery.mock.calls[0];
      expect(firstCall[0]).toContain('INSERT INTO agent_workers');
      expect(firstCall[1]).toContain('w1');
    });
  });

  describe('updateWorkerStatus()', () => {
    it('should update worker status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.updateWorkerStatus('w1', 'running');

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('UPDATE agent_workers');
      expect(call[1]).toContain('w1');
      expect(call[1]).toContain('running');
    });

    it('should include optional fields when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await repo.updateWorkerStatus('w1', 'completed', {
        result: 'result text',
        tokens_used: 1500,
      });

      const call = mockQuery.mock.calls[0];
      expect(call[0]).toContain('result');
      expect(call[0]).toContain('tokens_used');
    });
  });

  describe('getRunWorkers()', () => {
    it('should return all workers for a run', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'w1', run_id: 'run_1', name: 'Researcher' },
          { id: 'w2', run_id: 'run_1', name: 'Analyst' },
        ],
      });

      const result = await repo.getRunWorkers('run_1');

      expect(result).toHaveLength(2);
    });
  });

  describe('getUserSettings()', () => {
    it('should return user settings', async () => {
      jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({
        github_token: 'gh_123',
        tavily_api_key: 'tv_456',
        telegram_bot_token: null,
        system_message: null,
        google_api_key: null,
        google_key_preference: 'allerac',
        anthropic_api_key: 'sk-ant-user',
        location: null,
        timezone: null,
        onboarding_completed: true,
        selected_model: null,
        language: 'en',
      });
      jest.spyOn(SystemSettingsService.prototype, 'loadAll').mockResolvedValue({
        github_token: null,
        github_repo_token: 'gh_repo',
        tavily_api_key: null,
        anthropic_api_key: null,
        google_api_key: null,
        resend_api_key: null,
        resend_from_email: null,
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ is_admin: true }] });

      const result = await repo.getUserSettings('user_1');

      expect(result).not.toBeNull();
      expect(result!.github_token).toBe('gh_123');
      expect(result!.github_repo_token).toBe('gh_repo');
      expect(result!.anthropic_api_key).toBe('sk-ant-user');
      expect(result!.is_admin).toBe(true);
      expect(UserSettingsService.prototype.loadUserSettings).toHaveBeenCalledWith('user_1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_admin'),
        ['user_1'],
      );
    });

    it('should return null for user without settings', async () => {
      jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue(null);
      jest.spyOn(SystemSettingsService.prototype, 'loadAll').mockResolvedValue({
        github_token: null,
        github_repo_token: null,
        tavily_api_key: null,
        anthropic_api_key: null,
        google_api_key: null,
        resend_api_key: null,
        resend_from_email: null,
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await repo.getUserSettings('nonexistent');

      expect(result).toBeNull();
    });
  });
});
