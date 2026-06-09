/** @jest-environment node */

import pool from '@/app/clients/db';
import { requireCurrentAdmin } from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { POST as applySkillChanges } from '@/app/api/skill-eval/apply/route';

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

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
    getSkillByName: jest.fn(),
  })),
}));

const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const mockQuery = jest.mocked(pool.query);
const mockGetSkillByName = jest.mocked(
  (SkillsService as jest.Mock).mock.results[0].value.getSkillByName
);

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/skill-eval/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('skill evaluation mutation authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentAdmin.mockResolvedValue(admin);
  });

  it('rejects path-like skill names before loading a skill', async () => {
    const response = await applySkillChanges(request({
      skillName: '../../system',
      changes: [{ old: 'before', new: 'after', rationale: 'test' }],
    }));

    expect(response.status).toBe(400);
    expect(mockGetSkillByName).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('does not allow an admin to mutate another user shared skill', async () => {
    mockGetSkillByName.mockResolvedValueOnce({
      id: 'shared-skill-id',
      user_id: 'other-user',
      name: 'shared-skill',
      content: 'before',
      is_system: false,
    });

    const response = await applySkillChanges(request({
      skillName: 'shared-skill',
      changes: [{ old: 'before', new: 'after', rationale: 'test' }],
    }));

    expect(response.status).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates an owned skill by immutable ID', async () => {
    mockGetSkillByName.mockResolvedValueOnce({
      id: 'owned-skill-id',
      user_id: admin.id,
      name: 'owned-skill',
      content: 'before',
      is_system: false,
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] } as never);

    const response = await applySkillChanges(request({
      skillName: 'owned-skill',
      changes: [{ old: 'before', new: 'after', rationale: 'test' }],
    }));

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $2'),
      ['after', 'owned-skill-id', admin.id]
    );
  });
});
