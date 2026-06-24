/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { GET as listSkills, POST as createSkill } from '@/app/api/v1/skills/route';
import { GET as getSkill, PATCH as updateSkill, DELETE as deleteSkill } from '@/app/api/v1/skills/[id]/route';

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

jest.mock('@/app/services/skills/skills.service', () => ({
  SkillsService: jest.fn(),
}));

const MockSkillsService = SkillsService as jest.MockedClass<typeof SkillsService>;
const mockRequireCurrentUser = jest.mocked(requireCurrentUser);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

const skill = {
  id: 'skill-id',
  user_id: 'user-id',
  name: 'researcher',
  display_name: 'Researcher',
  description: 'Deep research assistant.',
  content: 'You are a research specialist...',
  category: 'workflow',
  learning_enabled: false,
  memory_scope: 'user',
  rag_integration: false,
  auto_switch_rules: null,
  force_tool: null,
  version: '1.0',
  license: 'MIT',
  verified: false,
  shared: false,
  install_count: 0,
  avg_rating: null,
  total_ratings: 0,
  created_at: new Date('2026-06-25T10:00:00.000Z'),
  updated_at: new Date('2026-06-25T10:00:00.000Z'),
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(id = 'skill-id') {
  return { params: Promise.resolve({ id }) };
}

function mockSkillsInstance(overrides: Partial<{
  getAvailableSkills: jest.Mock;
  getSkillForUser: jest.Mock;
  createSkill: jest.Mock;
  updateSkill: jest.Mock;
  deleteSkill: jest.Mock;
}> = {}) {
  const instance = {
    getAvailableSkills: jest.fn(),
    getSkillForUser: jest.fn(),
    createSkill: jest.fn(),
    updateSkill: jest.fn(),
    deleteSkill: jest.fn(),
    ...overrides,
  };
  MockSkillsService.mockImplementation(() => instance as any);
  return instance;
}

describe('Control API v1 skills', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());
    mockSkillsInstance();

    const response = await listSkills(new Request('http://localhost/api/v1/skills'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('lists skills available to the user', async () => {
    const instance = mockSkillsInstance({
      getAvailableSkills: jest.fn().mockResolvedValue([skill]),
    });

    const response = await listSkills(new Request('http://localhost/api/v1/skills'));

    expect(response.status).toBe(200);
    expect(instance.getAvailableSkills).toHaveBeenCalledWith(user.id);
    const body = await response.json();
    expect(body.data.skills[0]).toMatchObject({ id: 'skill-id', name: 'researcher', displayName: 'Researcher' });
    // List DTO should NOT include systemPrompt
    expect(body.data.skills[0]).not.toHaveProperty('systemPrompt');
  });

  it('validates missing required fields on create', async () => {
    mockSkillsInstance();

    const response = await createSkill(jsonRequest('http://localhost/api/v1/skills', 'POST', {
      name: 'incomplete',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });

  it('creates a skill owned by the current user', async () => {
    const instance = mockSkillsInstance({
      createSkill: jest.fn().mockResolvedValue(skill),
    });

    const response = await createSkill(jsonRequest('http://localhost/api/v1/skills', 'POST', {
      name: 'researcher',
      displayName: 'Researcher',
      description: 'Deep research assistant.',
      systemPrompt: 'You are a research specialist...',
      category: 'workflow',
    }));

    expect(response.status).toBe(201);
    expect(instance.createSkill).toHaveBeenCalledWith(expect.objectContaining({
      user_id: user.id,
      name: 'researcher',
      display_name: 'Researcher',
      content: 'You are a research specialist...',
    }));
    const body = await response.json();
    expect(body.data.skill).toMatchObject({ id: 'skill-id', name: 'researcher' });
  });

  it('returns skill detail including systemPrompt', async () => {
    const instance = mockSkillsInstance({
      getSkillForUser: jest.fn().mockResolvedValue(skill),
    });

    const response = await getSkill(
      new Request('http://localhost/api/v1/skills/skill-id'),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(instance.getSkillForUser).toHaveBeenCalledWith('skill-id', user.id);
    const body = await response.json();
    expect(body.data.skill).toMatchObject({ id: 'skill-id', systemPrompt: 'You are a research specialist...' });
  });

  it('returns 404 when skill not found', async () => {
    mockSkillsInstance({
      getSkillForUser: jest.fn().mockResolvedValue(null),
    });

    const response = await getSkill(
      new Request('http://localhost/api/v1/skills/missing'),
      routeParams('missing'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('updates a skill', async () => {
    const updated = { ...skill, shared: true };
    const instance = mockSkillsInstance({
      updateSkill: jest.fn().mockResolvedValue(updated),
    });

    const response = await updateSkill(
      jsonRequest('http://localhost/api/v1/skills/skill-id', 'PATCH', { shared: true }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(instance.updateSkill).toHaveBeenCalledWith('skill-id', user.id, false, expect.objectContaining({ shared: true }));
    const body = await response.json();
    expect(body.data.skill.shared).toBe(true);
  });

  it('returns 404 on delete when skill is not owned by current user', async () => {
    mockSkillsInstance({
      getSkillForUser: jest.fn().mockResolvedValue({ ...skill, user_id: 'other-user-id' }),
    });

    const response = await deleteSkill(
      new Request('http://localhost/api/v1/skills/skill-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('deletes a skill owned by the current user', async () => {
    const instance = mockSkillsInstance({
      getSkillForUser: jest.fn().mockResolvedValue(skill),
      deleteSkill: jest.fn().mockResolvedValue(undefined),
    });

    const response = await deleteSkill(
      new Request('http://localhost/api/v1/skills/skill-id', { method: 'DELETE' }),
      routeParams(),
    );

    expect(response.status).toBe(200);
    expect(instance.deleteSkill).toHaveBeenCalledWith('skill-id', user.id);
    expect(await response.json()).toEqual({ data: { deleted: true } });
  });
});
