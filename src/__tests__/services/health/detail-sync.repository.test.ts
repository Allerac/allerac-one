import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { DetailSyncRepository } from '@/app/services/health/detail-sync.repository';

const mockQuery = pool.query as jest.Mock;
const mockConnect = pool.connect as jest.Mock;

function fakeClient(rows: unknown[]) {
  const client = {
    query: jest.fn().mockResolvedValue({ rows }),
    release: jest.fn(),
  };
  return client;
}

describe('DetailSyncRepository', () => {
  let repo: DetailSyncRepository;

  beforeEach(() => {
    jest.restoreAllMocks();
    mockQuery.mockReset();
    mockConnect.mockReset();
    repo = new DetailSyncRepository();
  });

  describe('claimPendingJob()', () => {
    it('claims a pending job inside a transaction and returns it as claimed', async () => {
      const client = fakeClient([{ id: 'job-1', user_id: 'user-1', activity_id: '123', status: 'pending', attempts: 0 }]);
      // BEGIN -> SELECT ... FOR UPDATE SKIP LOCKED -> UPDATE -> COMMIT
      client.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', user_id: 'user-1', activity_id: '123', status: 'pending', attempts: 0 }] }) // SELECT
        .mockResolvedValueOnce(undefined) // UPDATE
        .mockResolvedValueOnce(undefined); // COMMIT
      mockConnect.mockResolvedValueOnce(client);

      const result = await repo.claimPendingJob();

      expect(result).toMatchObject({ id: 'job-1', status: 'claimed', attempts: 1 });
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      expect(client.release).toHaveBeenCalled();
    });

    it('returns null and commits when no pending job exists', async () => {
      const client = fakeClient([]);
      client.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT
        .mockResolvedValueOnce(undefined); // COMMIT
      mockConnect.mockResolvedValueOnce(client);

      const result = await repo.claimPendingJob();

      expect(result).toBeNull();
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back and releases the client on error', async () => {
      const client = fakeClient([]);
      client.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('db exploded')); // SELECT fails
      mockConnect.mockResolvedValueOnce(client);

      await expect(repo.claimPendingJob()).rejects.toThrow('db exploded');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });

  describe('recoverStaleJobs()', () => {
    it('resets stuck claimed/running jobs back to pending', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 2 });

      const recovered = await repo.recoverStaleJobs(10);

      expect(recovered).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('claimed', 'running')"),
        [10],
      );
    });
  });

  describe('markCompleted() / markFailed()', () => {
    it('marks a job completed and clears last_error', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await repo.markCompleted('job-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        ['job-1'],
      );
    });

    it('marks a job failed with a truncated error message', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await repo.markFailed('job-1', 'x'.repeat(3000));

      const [, params] = mockQuery.mock.calls[0];
      expect((params[1] as string).length).toBe(2000);
    });
  });
});
