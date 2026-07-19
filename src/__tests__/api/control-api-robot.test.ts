/** @jest-environment node */

import { assertDomainAccess, requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import { ApiKeyMissingScopeError, apiKeyService } from '@/app/services/api-keys/api-key.service';
import { SpeechConfigurationError, synthesizeSpeech } from '@/app/services/speech/speech.service';
import { POST as synthesize } from '@/app/api/v1/speech/route';
import { GET as getSettings, PUT as updateSettings } from '@/app/api/v1/robot/settings/route';

var mockLoadAll = jest.fn();
var mockSaveAll = jest.fn();
var mockGetDefaultDomainSkill = jest.fn();
var mockGetSkillTools = jest.fn();

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

jest.mock('@/app/services/api-keys/api-key.service', () => ({
  ApiKeyMissingScopeError: class MockApiKeyMissingScopeError extends Error {
    constructor(public readonly requiredScope: string) {
      super(`API key is missing required scope: ${requiredScope}`);
      this.name = 'ApiKeyMissingScopeError';
    }
  },
  apiKeyService: {
    validateBearerToken: jest.fn(),
  },
}));

jest.mock('@/app/services/speech/speech.service', () => ({
  SpeechConfigurationError: class MockSpeechConfigurationError extends Error {
    constructor() {
      super('OpenAI API key is not configured.');
      this.name = 'SpeechConfigurationError';
    }
  },
  synthesizeSpeech: jest.fn(),
}));

jest.mock('@/app/services/system/system-settings.service', () => ({
  SystemSettingsService: jest.fn().mockImplementation(() => ({
    loadAll: (...args: unknown[]) => mockLoadAll(...args),
    saveAll: (...args: unknown[]) => mockSaveAll(...args),
  })),
}));

jest.mock('@/app/services/skills/skills.service', () => ({
  skillsService: {
    getDefaultDomainSkill: (...args: unknown[]) => mockGetDefaultDomainSkill(...args),
    getSkillTools: (...args: unknown[]) => mockGetSkillTools(...args),
  },
}));

jest.mock('@/app/tools/tools', () => ({
  TOOLS: [{ function: { name: 'web_search' } }],
  TOOL_REGISTRY: [{
    name: 'web_search',
    label: 'Web Search',
    description: 'Search the web',
    group: 'Search',
  }],
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockAssertDomainAccess = jest.mocked(assertDomainAccess);
const mockApiKeyService = jest.mocked(apiKeyService);
const mockSynthesizeSpeech = jest.mocked(synthesizeSpeech);

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function jsonRequest(url: string, method: 'POST' | 'PUT', body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Control API v1 robot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    mockAssertDomainAccess.mockResolvedValue(undefined);
    mockLoadAll.mockResolvedValue({
      robot_speech_voice: 'onyx',
      robot_speech_speed: '1.15',
      robot_speech_style: 'Speak warmly.',
    });
    mockSaveAll.mockResolvedValue(undefined);
    mockGetDefaultDomainSkill.mockResolvedValue({
      id: 'skill-id',
      name: 'robot-assistant',
      display_name: 'Robot Assistant',
    });
    mockGetSkillTools.mockResolvedValue(['web_search', 'configured_only']);
    mockSynthesizeSpeech.mockResolvedValue(
      new TextEncoder().encode('audio').buffer,
    );
  });

  describe('POST /api/v1/speech', () => {
    it('returns synthesized MPEG audio', async () => {
      const response = await synthesize(jsonRequest(
        'http://localhost/api/v1/speech',
        'POST',
        { text: 'Hello', voice: 'onyx', speed: 1.15 },
      ));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('audio/mpeg');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
        text: 'Hello',
        voice: 'onyx',
        speed: 1.15,
      });
      expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('audio');
    });

    it('requires chat:write for API keys', async () => {
      mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
        new ApiKeyMissingScopeError('chat:write'),
      );

      const response = await synthesize(new Request('http://localhost/api/v1/speech', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer alr_live_limited',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello' }),
      }));

      expect(response.status).toBe(403);
      expect(mockApiKeyService.validateBearerToken).toHaveBeenCalledWith(
        'alr_live_limited',
        'chat:write',
      );
      expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
    });

    it('validates the speech payload', async () => {
      const response = await synthesize(jsonRequest(
        'http://localhost/api/v1/speech',
        'POST',
        { text: '', speed: 5 },
      ));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
      expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
    });

    it('returns 422 when speech is not configured', async () => {
      mockSynthesizeSpeech.mockRejectedValueOnce(new SpeechConfigurationError());

      const response = await synthesize(jsonRequest(
        'http://localhost/api/v1/speech',
        'POST',
        { text: 'Hello' },
      ));

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: {
          code: 'speech_not_configured',
          message: 'OpenAI API key is not configured.',
        },
      });
    });
  });

  describe('GET /api/v1/robot/settings', () => {
    it('returns settings, skill, and runtime tool availability', async () => {
      const response = await getSettings(
        new Request('http://localhost/api/v1/robot/settings'),
      );

      expect(response.status).toBe(200);
      expect(mockAssertDomainAccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-id' }),
        'robot-assistant',
      );
      expect(await response.json()).toMatchObject({
        data: {
          voice: 'onyx',
          speed: 1.15,
          style: 'Speak warmly.',
          defaultSkill: {
            id: 'skill-id',
            name: 'robot-assistant',
            displayName: 'Robot Assistant',
          },
          tools: [
            { name: 'web_search', runtimeAvailable: true },
            { name: 'configured_only', runtimeAvailable: false },
          ],
        },
      });
    });

    it('requires chat:read for API keys', async () => {
      mockApiKeyService.validateBearerToken.mockResolvedValueOnce(user);

      const response = await getSettings(new Request(
        'http://localhost/api/v1/robot/settings',
        { headers: { Authorization: 'Bearer alr_live_robot' } },
      ));

      expect(response.status).toBe(200);
      expect(mockApiKeyService.validateBearerToken).toHaveBeenCalledWith(
        'alr_live_robot',
        'chat:read',
      );
      expect(mockAssertDomainAccess).toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated', async () => {
      mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

      const response = await getSettings(
        new Request('http://localhost/api/v1/robot/settings'),
      );

      expect(response.status).toBe(401);
      expect(mockLoadAll).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/v1/robot/settings', () => {
    it('updates validated speech settings', async () => {
      const response = await updateSettings(jsonRequest(
        'http://localhost/api/v1/robot/settings',
        'PUT',
        { voice: 'nova', speed: 1.25, style: 'Speak clearly.' },
      ));

      expect(response.status).toBe(200);
      expect(mockAssertDomainAccess).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-id' }),
        'robot-assistant',
      );
      expect(mockSaveAll).toHaveBeenCalledWith({
        robot_speech_voice: 'nova',
        robot_speech_speed: '1.25',
        robot_speech_style: 'Speak clearly.',
      }, 'user-id');
      expect(await response.json()).toEqual({
        data: { voice: 'nova', speed: 1.25, style: 'Speak clearly.' },
      });
    });

    it('rejects unsupported voices', async () => {
      const response = await updateSettings(jsonRequest(
        'http://localhost/api/v1/robot/settings',
        'PUT',
        { voice: 'unknown', speed: 1, style: 'Speak clearly.' },
      ));

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
      expect(mockSaveAll).not.toHaveBeenCalled();
    });

    it('requires chat:write for API keys', async () => {
      mockApiKeyService.validateBearerToken.mockRejectedValueOnce(
        new ApiKeyMissingScopeError('chat:write'),
      );

      const response = await updateSettings(new Request(
        'http://localhost/api/v1/robot/settings',
        {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer alr_live_limited',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ voice: 'nova', speed: 1, style: 'Speak clearly.' }),
        },
      ));

      expect(response.status).toBe(403);
      expect(mockApiKeyService.validateBearerToken).toHaveBeenCalledWith(
        'alr_live_limited',
        'chat:write',
      );
      expect(mockAssertDomainAccess).not.toHaveBeenCalled();
      expect(mockSaveAll).not.toHaveBeenCalled();
    });
  });
});
