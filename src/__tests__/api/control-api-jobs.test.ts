/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';
import { GET as listJobs, POST as createJob } from '@/app/api/v1/jobs/route';
import { PATCH as updateJob, DELETE as deleteJob } from '@/app/api/v1/jobs/[id]/route';
import { POST as toggleJob } from '@/app/api/v1/jobs/[id]/toggle/route';
import { GET as listJobExecutions } from '@/app/api/v1/jobs/[id]/executions/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/services/scheduled-jobs/scheduled-jobs.service', () => ({
  scheduledJobsService: {
    getScheduledJobs: jest.fn(),
    createScheduledJob: jest.fn(),
    updateScheduledJob: jest.fn(),
    deleteScheduledJob: jest.fn(),
    toggleJobEnabled: jest.fn(),
    getJobExecutions: jest.fn(),
  },
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockJobsService = jest.mocked(scheduledJobsService);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const job = {
  id: 'job-id',
  userId: 'user-id',
  name: 'Morning digest',
  cronExpr: '0 8 * * *',
  prompt: 'Summarize open tickets.',
  channels: ['telegram'],
  domainSlug: null,
  enabled: true,
  lastRunAt: null,
  createdAt: '2026-06-25T10:00:00.000Z',
  updatedAt: '2026-06-25T10:00:00.000Z',
};

const execution = {
  id: 'exec-id',
  jobId: 'job-id',
  status: 'completed' as const,
  result: 'All good.',
  startedAt: '2026-06-25T08:00:00.000Z',
  completedAt: '2026-06-25T08:00:04.000Z',
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'job-id') {
  return { params: Promise.resolve({ id }) };
}

describe('Control API v1 scheduled jobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await listJobs(new Request('http://localhost/api/v1/jobs'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('lists jobs for the current user', async () => {
    mockJobsService.getScheduledJobs.mockResolvedValueOnce([job as any]);

    const response = await listJobs(new Request('http://localhost/api/v1/jobs'));

    expect(response.status).toBe(200);
    expect(mockJobsService.getScheduledJobs).toHaveBeenCalledWith(user.id);
    const body = await response.json();
    expect(body.data.jobs[0]).toMatchObject({ id: 'job-id', name: 'Morning digest', cronExpr: '0 8 * * *' });
  });

  it('validates invalid cron expression', async () => {
    const response = await createJob(jsonRequest('http://localhost/api/v1/jobs', 'POST', {
      name: 'Bad job',
      cronExpr: 'not-a-cron',
      prompt: 'Do something.',
      channels: ['telegram'],
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(mockJobsService.createScheduledJob).not.toHaveBeenCalled();
  });

  it('validates missing channels', async () => {
    const response = await createJob(jsonRequest('http://localhost/api/v1/jobs', 'POST', {
      name: 'No channels',
      cronExpr: '0 8 * * *',
      prompt: 'Do something.',
      channels: [],
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('creates a job with enabled defaulting to true', async () => {
    mockJobsService.createScheduledJob.mockResolvedValueOnce(job as any);

    const response = await createJob(jsonRequest('http://localhost/api/v1/jobs', 'POST', {
      name: 'Morning digest',
      cronExpr: '0 8 * * *',
      prompt: 'Summarize open tickets.',
      channels: ['telegram'],
    }));

    expect(response.status).toBe(201);
    expect(mockJobsService.createScheduledJob).toHaveBeenCalledWith(user.id, expect.objectContaining({
      name: 'Morning digest',
      cronExpr: '0 8 * * *',
      enabled: true,
    }));
    const body = await response.json();
    expect(body.data.job).toMatchObject({ id: 'job-id', enabled: true });
  });

  it('toggles job enabled state', async () => {
    mockJobsService.toggleJobEnabled.mockResolvedValueOnce({ ...job, enabled: false } as any);

    const response = await toggleJob(
      new Request('http://localhost/api/v1/jobs/job-id/toggle', { method: 'POST' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockJobsService.toggleJobEnabled).toHaveBeenCalledWith('job-id', user.id);
    const body = await response.json();
    expect(body.data.job.enabled).toBe(false);
  });

  it('returns 404 when toggling a missing job', async () => {
    mockJobsService.toggleJobEnabled.mockResolvedValueOnce(null as any);

    const response = await toggleJob(
      new Request('http://localhost/api/v1/jobs/missing/toggle', { method: 'POST' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('updates job cron expression', async () => {
    const updated = { ...job, cronExpr: '0 9 * * 1-5' };
    mockJobsService.updateScheduledJob.mockResolvedValueOnce(updated as any);

    const response = await updateJob(
      jsonRequest('http://localhost/api/v1/jobs/job-id', 'PATCH', { cronExpr: '0 9 * * 1-5' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockJobsService.updateScheduledJob).toHaveBeenCalledWith('job-id', user.id, { cronExpr: '0 9 * * 1-5' });
    const body = await response.json();
    expect(body.data.job.cronExpr).toBe('0 9 * * 1-5');
  });

  it('returns 404 when job not found on update', async () => {
    mockJobsService.updateScheduledJob.mockResolvedValueOnce(null as any);

    const response = await updateJob(
      jsonRequest('http://localhost/api/v1/jobs/missing', 'PATCH', { name: 'Renamed' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('deletes a job', async () => {
    mockJobsService.deleteScheduledJob.mockResolvedValueOnce(true);

    const response = await deleteJob(
      new Request('http://localhost/api/v1/jobs/job-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockJobsService.deleteScheduledJob).toHaveBeenCalledWith('job-id', user.id);
    expect(await response.json()).toEqual({ data: { deleted: true } });
  });

  it('returns 404 when job not found on delete', async () => {
    mockJobsService.deleteScheduledJob.mockResolvedValueOnce(false);

    const response = await deleteJob(
      new Request('http://localhost/api/v1/jobs/missing', { method: 'DELETE' }),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('lists job executions', async () => {
    mockJobsService.getJobExecutions.mockResolvedValueOnce([execution]);

    const response = await listJobExecutions(
      new Request('http://localhost/api/v1/jobs/job-id/executions'),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(mockJobsService.getJobExecutions).toHaveBeenCalledWith('job-id', user.id);
    const body = await response.json();
    expect(body.data.executions[0]).toMatchObject({ id: 'exec-id', status: 'completed' });
  });
});
