/** @jest-environment node */

import { requireCurrentAdmin, UnauthorizedError } from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { POST as applySkillChatChanges } from '@/app/api/domains/skill-chat/apply/route';

jest.mock('@/app/lib/auth-session', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    UnauthorizedError,
    ForbiddenError,
    authenticationErrorResponse: (error: unknown) => {
      if (error instanceof UnauthorizedError) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      return null;
    },
    requireCurrentAdmin: jest.fn(),
  };
});

jest.mock('@/app/services/skills/skills.service', () => ({
  SkillsService: jest.fn().mockImplementation(() => ({
    getSkillForUser: jest.fn(),
    updateSkill: jest.fn(),
  })),
}));

const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const mockGetSkillForUser = jest.mocked(
  (SkillsService as jest.Mock).mock.results[0].value.getSkillForUser
);
const mockUpdateSkill = jest.mocked(
  (SkillsService as jest.Mock).mock.results[0].value.updateSkill
);

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/domains/skill-chat/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const skillId = '11111111-1111-1111-1111-111111111111';

describe('skill chat apply', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentAdmin.mockResolvedValue(admin as never);
  });

  it('rejects non-admins before loading the skill', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new UnauthorizedError());

    const response = await applySkillChatChanges(request({
      skillId, changes: [{ old: 'a', new: 'b', rationale: 'r' }],
    }));

    expect(response.status).toBe(401);
    expect(mockGetSkillForUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid skillId before loading anything', async () => {
    const response = await applySkillChatChanges(request({
      skillId: 'not-a-uuid', changes: [{ old: 'a', new: 'b', rationale: 'r' }],
    }));

    expect(response.status).toBe(400);
    expect(mockGetSkillForUser).not.toHaveBeenCalled();
  });

  it('404s when the skill cannot be loaded for this user', async () => {
    mockGetSkillForUser.mockResolvedValueOnce(null);

    const response = await applySkillChatChanges(request({
      skillId, changes: [{ old: 'a', new: 'b', rationale: 'r' }],
    }));

    expect(response.status).toBe(404);
    expect(mockUpdateSkill).not.toHaveBeenCalled();
  });

  it('applies approved changes via skillsService.updateSkill, passing the admin bypass flag', async () => {
    // Skill owned by a different user — this route must still be able to apply
    // the change for an admin, unlike /api/skill-eval/apply's stricter check.
    mockGetSkillForUser.mockResolvedValueOnce({
      id: skillId,
      user_id: 'someone-else',
      name: 'chat-skill',
      content: 'Be helpful and concise.',
    });
    mockUpdateSkill.mockResolvedValueOnce({
      id: skillId,
      content: 'Be helpful, warm, and concise.',
    });

    const response = await applySkillChatChanges(request({
      skillId,
      changes: [{ old: 'Be helpful and concise.', new: 'Be helpful, warm, and concise.', rationale: 'friendlier tone' }],
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.updatedContent).toBe('Be helpful, warm, and concise.');
    expect(mockUpdateSkill).toHaveBeenCalledWith(
      skillId,
      admin.id,
      true,
      { content: 'Be helpful, warm, and concise.' },
    );
  });

  it('rejects with 400 when no proposed change matches the current content', async () => {
    mockGetSkillForUser.mockResolvedValueOnce({
      id: skillId,
      user_id: admin.id,
      name: 'chat-skill',
      content: 'Be helpful and concise.',
    });

    const response = await applySkillChatChanges(request({
      skillId,
      changes: [{ old: 'text that is not in the skill', new: 'x', rationale: 'r' }],
    }));

    expect(response.status).toBe(400);
    expect(mockUpdateSkill).not.toHaveBeenCalled();
  });
});
