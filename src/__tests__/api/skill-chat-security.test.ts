/** @jest-environment node */

import { requireCurrentAdmin, UnauthorizedError } from '@/app/lib/auth-session';
import { SkillsService } from '@/app/services/skills/skills.service';
import { generateResponse } from '@/app/api/skill-eval/generate-response';
import { POST as skillChat } from '@/app/api/domains/skill-chat/route';

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
  })),
}));

jest.mock('@/app/services/user/user-settings.service', () => ({
  UserSettingsService: jest.fn().mockImplementation(() => ({
    loadUserSettings: jest.fn().mockResolvedValue({ github_token: 'gh-token' }),
  })),
}));

jest.mock('@/app/api/skill-eval/generate-response', () => ({
  generateResponse: jest.fn(),
}));

const mockRequireCurrentAdmin = jest.mocked(requireCurrentAdmin);
const mockGetSkillForUser = jest.mocked(
  (SkillsService as jest.Mock).mock.results[0].value.getSkillForUser
);
const mockGenerateResponse = jest.mocked(generateResponse);

const admin = {
  id: 'admin-id',
  email: 'admin@example.com',
  name: 'Admin',
  is_admin: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function request(body: unknown): Request {
  return new Request('http://localhost/api/domains/skill-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  skillId: '11111111-1111-1111-1111-111111111111',
  domainSlug: 'chat',
  model: 'gpt-5.6-luna',
  provider: 'github',
  history: [],
  message: 'make the tone friendlier',
};

describe('skill chat authorization and validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentAdmin.mockResolvedValue(admin as never);
  });

  it('rejects non-admins before touching the skill or the model', async () => {
    mockRequireCurrentAdmin.mockRejectedValueOnce(new UnauthorizedError());

    const response = await skillChat(request(validBody));

    expect(response.status).toBe(401);
    expect(mockGetSkillForUser).not.toHaveBeenCalled();
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('rejects an invalid skillId before loading anything', async () => {
    const response = await skillChat(request({ ...validBody, skillId: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(mockGetSkillForUser).not.toHaveBeenCalled();
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('rejects an invalid domainSlug before loading anything', async () => {
    const response = await skillChat(request({ ...validBody, domainSlug: 'Not Valid!' }));

    expect(response.status).toBe(400);
    expect(mockGetSkillForUser).not.toHaveBeenCalled();
  });

  it('404s when the skill cannot be loaded for this user', async () => {
    mockGetSkillForUser.mockResolvedValueOnce(null);

    const response = await skillChat(request(validBody));

    expect(response.status).toBe(404);
    expect(mockGenerateResponse).not.toHaveBeenCalled();
  });

  it('drops proposed changes whose "old" text no longer matches the current skill content', async () => {
    mockGetSkillForUser.mockResolvedValueOnce({
      id: validBody.skillId,
      name: 'chat-skill',
      display_name: 'Chat Skill',
      content: 'Be helpful and concise.',
    });
    mockGenerateResponse.mockResolvedValueOnce(JSON.stringify({
      reply: 'Sure, here are a couple of tweaks.',
      changes: [
        { old: 'Be helpful and concise.', new: 'Be helpful, warm, and concise.', rationale: 'friendlier tone' },
        { old: 'this text does not exist in the skill', new: 'x', rationale: 'hallucinated' },
      ],
    }));

    const response = await skillChat(request(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].old).toBe('Be helpful and concise.');
    expect(data.skipped).toBe(1);
  });
});
