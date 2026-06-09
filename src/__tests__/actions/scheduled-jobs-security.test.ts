/** @jest-environment node */

import {
  assertDomainAccess,
  requireCurrentUser,
} from '@/app/lib/auth-session';
import {
  createScheduledJob,
  deleteScheduledJob,
  getScheduledJobs,
  updateScheduledJob,
} from '@/app/actions/scheduled-jobs';
import { scheduledJobsService } from '@/app/services/scheduled-jobs/scheduled-jobs.service';

jest.mock('@/app/lib/auth-session', () => ({
  assertDomainAccess: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockAssertDomainAccess = jest.mocked(assertDomainAccess);

const sessionUser = {
  id: 'user-a',
  email: 'a@example.com',
  name: 'User A',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('scheduled job action authorization', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockRequireCurrentUser.mockResolvedValue(sessionUser);
    mockAssertDomainAccess.mockResolvedValue();
  });

  it('lists only jobs owned by the session user', async () => {
    const listSpy = jest.spyOn(scheduledJobsService, 'getScheduledJobs')
      .mockResolvedValue([]);

    await getScheduledJobs();

    expect(listSpy).toHaveBeenCalledWith('user-a');
  });

  it('cannot update another user job through a supplied userId', async () => {
    const updateSpy = jest.spyOn(scheduledJobsService, 'updateScheduledJob')
      .mockResolvedValue(null);

    const result = await updateScheduledJob('job-b', { name: 'Changed' });

    expect(updateSpy).toHaveBeenCalledWith('job-b', 'user-a', { name: 'Changed' });
    expect(result).toEqual({ success: false, error: 'Job not found' });
  });

  it('cannot delete another user job through a supplied userId', async () => {
    const deleteSpy = jest.spyOn(scheduledJobsService, 'deleteScheduledJob')
      .mockResolvedValue(false);

    const result = await deleteScheduledJob('job-b');

    expect(deleteSpy).toHaveBeenCalledWith('job-b', 'user-a');
    expect(result).toEqual({ success: false, error: 'Job not found' });
  });

  it('verifies domain access before creating a restricted-domain job', async () => {
    mockAssertDomainAccess.mockRejectedValueOnce(new Error('Domain access denied'));
    const createSpy = jest.spyOn(scheduledJobsService, 'createScheduledJob');

    const result = await createScheduledJob({
      name: 'Restricted job',
      cronExpr: '0 8 * * *',
      prompt: 'Run',
      channels: ['app'],
      enabled: true,
      domainSlug: 'admin',
    });

    expect(mockAssertDomainAccess).toHaveBeenCalledWith(sessionUser, 'admin');
    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, error: 'Failed to create scheduled job' });
  });
});
