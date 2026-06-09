/** @jest-environment node */

import {
  assertDomainAccess,
  requireCurrentUser,
} from '@/app/lib/auth-session';
import {
  deleteDocument,
  getAllDocuments,
} from '@/app/actions/documents';
import { DocumentService } from '@/app/services/rag/document.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';

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

describe('document action authorization', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockRequireCurrentUser.mockResolvedValue(sessionUser);
    mockAssertDomainAccess.mockResolvedValue();
    jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({
      github_token: 'session-token',
    } as never);
    jest.spyOn(SystemSettingsService.prototype, 'loadAll').mockResolvedValue({} as never);
  });

  it('lists documents for the session user and verifies restricted domain access', async () => {
    const listSpy = jest.spyOn(DocumentService.prototype, 'getAllDocuments')
      .mockResolvedValue([] as never);

    await getAllDocuments('notes');

    expect(mockAssertDomainAccess).toHaveBeenCalledWith(sessionUser, 'notes');
    expect(listSpy).toHaveBeenCalledWith('user-a', 'notes');
  });

  it('scopes deletion to the session user instead of the supplied userId', async () => {
    const deleteSpy = jest.spyOn(DocumentService.prototype, 'deleteDocument')
      .mockResolvedValue(undefined as never);

    await deleteDocument('doc-b');

    expect(deleteSpy).toHaveBeenCalledWith('doc-b', 'user-a');
  });

  it('does not query documents when restricted domain access is denied', async () => {
    mockAssertDomainAccess.mockRejectedValueOnce(new Error('Domain access denied'));
    const listSpy = jest.spyOn(DocumentService.prototype, 'getAllDocuments');

    await expect(
      getAllDocuments('admin'),
    ).rejects.toThrow('Domain access denied');

    expect(listSpy).not.toHaveBeenCalled();
  });
});
