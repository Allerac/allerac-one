jest.mock('@/app/services/scheduled-jobs/scheduled-jobs.service', () => ({
  scheduledJobsService: {
    createScheduledJob: jest.fn(),
  },
}));

import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { buildJobsTools } from '@/app/tools/jobs.tool';

const createScheduledJob = jest.mocked(scheduledJobsService.createScheduledJob);

describe('schedule_task', () => {
  beforeEach(() => createScheduledJob.mockReset());

  test('injects the caller domain instead of accepting one from tool arguments', async () => {
    createScheduledJob.mockResolvedValueOnce({
      id: 'job-1',
      userId: 'user-1',
      name: 'Send a weekly summary',
      prompt: 'Send a weekly summary',
      cronExpr: '0 9 * * 1',
      channels: ['telegram'],
      webhookUrl: null,
      domainSlug: 'finance',
      llmModel: null,
      llmProvider: null,
      enabled: true,
      lastRunAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await buildJobsTools('user-1', 'finance').schedule_task({
      cron: '0 9 * * 1',
      prompt: 'Send a weekly summary',
    });

    expect(createScheduledJob).toHaveBeenCalledWith('user-1', expect.objectContaining({
      cronExpr: '0 9 * * 1',
      prompt: 'Send a weekly summary',
      domainSlug: 'finance',
    }));
    expect(result).toMatchObject({ success: true, job_id: 'job-1', domain_slug: 'finance' });
  });

  test('rejects invalid cron expressions before writing', async () => {
    const result = await buildJobsTools('user-1', 'write').schedule_task({
      cron: 'tomorrow',
      prompt: 'Publish a digest',
    });

    expect(result).toEqual({ success: false, error: 'Invalid cron expression' });
    expect(createScheduledJob).not.toHaveBeenCalled();
  });
});
