/** @jest-environment node */

import fs from 'fs/promises';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { deleteBackup } from '@/app/actions/backup';
import { applyUpdate } from '@/app/actions/updates';

jest.mock('@/app/lib/auth-session', () => ({
  requireCurrentAdmin: jest.fn(),
}));

const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);

describe('critical admin actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authorizes before deleting a backup', async () => {
    const unlinkSpy = jest.spyOn(fs, 'unlink');
    mockRequireCurrentAdmin.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(deleteBackup('allerac-backup-test.sql')).rejects.toThrow('Unauthorized');

    expect(unlinkSpy).not.toHaveBeenCalled();
    unlinkSpy.mockRestore();
  });

  it('authorizes before requesting a system update', async () => {
    const writeFileSpy = jest.spyOn(fs, 'writeFile');
    mockRequireCurrentAdmin.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(applyUpdate()).rejects.toThrow('Unauthorized');

    expect(writeFileSpy).not.toHaveBeenCalled();
    writeFileSpy.mockRestore();
  });
});
