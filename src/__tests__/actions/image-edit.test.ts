/** @jest-environment node */

import {
  assertDomainAccess,
  requireCurrentUser,
} from '@/app/lib/auth-session';
import { editProductImage } from '@/app/actions/image-edit';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';

jest.mock('@/app/lib/auth-session', () => ({
  assertDomainAccess: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockAssertDomainAccess = jest.mocked(assertDomainAccess);
const originalFetch = global.fetch;

const sessionUser = {
  id: 'image-user',
  email: 'image@example.com',
  name: 'Image User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

// Valid 1x1 transparent PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVR4nGP4z8DAAAAEAQEARwbK3gAAAABJRU5ErkJggg==';

describe('image editing action', () => {
  beforeEach(() => {
    mockRequireCurrentUser.mockResolvedValue(sessionUser);
    mockAssertDomainAccess.mockResolvedValue();
    jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({
      google_api_key: 'user-google-key',
    } as never);
    jest.spyOn(SystemSettingsService.prototype, 'loadAll').mockResolvedValue({
      google_api_key: 'system-google-key',
    } as never);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses Gemini Image with the session user Google key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              mimeType: 'image/png',
              data: PNG_BASE64,
            },
          }],
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    global.fetch = fetchMock;

    const result = await editProductImage(PNG_BASE64, {
      type: 'lifestyle-scene',
      prompt: 'on a marble table at golden hour',
    });

    if (!result.success) throw new Error(result.error);
    expect(result.success).toBe(true);
    expect(mockAssertDomainAccess).toHaveBeenCalledWith(sessionUser, 'social');
    expect(UserSettingsService.prototype.loadUserSettings).toHaveBeenCalledWith('image-user');

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent'
    );
    expect(request.headers['x-goog-api-key']).toBe('user-google-key');

    const body = JSON.parse(request.body);
    expect(body.generationConfig).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain('on a marble table at golden hour');
    expect(body.contents[0].parts[1].inline_data).toEqual({
      mime_type: 'image/png',
      data: PNG_BASE64,
    });
  });

  it('falls back to the system Google key', async () => {
    jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({} as never);
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }],
        },
      }],
    }), { status: 200 }));
    global.fetch = fetchMock;

    const result = await editProductImage(PNG_BASE64, { type: 'remove-background' });

    if (!result.success) throw new Error(result.error);
    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('system-google-key');
  });

  it('rejects unsupported operations before calling Gemini', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await editProductImage(
      PNG_BASE64,
      { type: 'unknown-operation' } as never,
    );

    expect(result).toEqual({ success: false, error: 'Entrada de imagem inválida' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports responses without an image', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'Unable to edit' }] } }],
    }), { status: 200 }));

    const result = await editProductImage(PNG_BASE64, { type: 'enhance' });

    expect(result).toEqual({
      success: false,
      error: 'Gemini não retornou uma imagem (SAFETY)',
    });
  });

  it('explains when the user Google key has no image-model quota', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        status: 'RESOURCE_EXHAUSTED',
        message: 'Quota exceeded for model gemini-3.1-flash-image',
      },
    }), { status: 429 }));

    const result = await editProductImage(PNG_BASE64, { type: 'enhance' });

    expect(result).toEqual({
      success: false,
      error: 'A sua Google API key não tem quota disponível para o Gemini 3.1 Flash Image. '
        + 'Ative o billing no projeto dessa chave no Google AI Studio ou configure outra chave com acesso ao modelo.',
      code: 'GEMINI_QUOTA_EXCEEDED',
      keySource: 'user',
    });
  });
});
