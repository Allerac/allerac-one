import '../../__mocks__/db';
import pool from '@/app/clients/db';
import { ScheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';

const mockQuery = jest.mocked(pool.query);

describe('ScheduledJobsService ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('scopes execution history through the owning scheduled job', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const service = new ScheduledJobsService();
    const executions = await service.getJobExecutions('job-a', 'user-a', 10);

    expect(executions).toEqual([]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE je.job_id = $1 AND sj.user_id = $2'),
      ['job-a', 'user-a', 10]
    );
  });

  it('scopes job updates to the owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

    const service = new ScheduledJobsService();
    const job = await service.updateScheduledJob('job-a', 'user-b', {
      name: 'Changed',
    });

    expect(job).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      'job-a',
      'user-b',
      'Changed',
      null,
      null,
      null,
      null,
      false,
      null,
      null,
    ]);
  });
});
