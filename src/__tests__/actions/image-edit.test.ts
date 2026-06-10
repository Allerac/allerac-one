/** @jest-environment node */

import {
  assertDomainAccess,
  requireCurrentUser,
} from '@/app/lib/auth-session';
import { editProductImage } from '@/app/actions/image-edit';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import {
  CreditService,
  InsufficientCreditsError,
} from '@/app/services/credits/credit.service';

jest.mock('@/app/lib/auth-session', () => ({
  assertDomainAccess: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

jest.mock('@/app/services/credits/credit.service', () => {
  class MockInsufficientCreditsError extends Error {
    constructor(
      readonly requiredMicrousd: number,
      readonly availableMicrousd: number,
    ) {
      super('Insufficient credits');
    }
  }
  class MockCreditAccountBlockedError extends Error {}
  return {
    CreditService: jest.fn().mockImplementation(() => ({
      getBalance: jest.fn(),
      getOperationPricing: jest.fn(),
      reserve: jest.fn(),
      settle: jest.fn(),
      release: jest.fn(),
    })),
    InsufficientCreditsError: MockInsufficientCreditsError,
    CreditAccountBlockedError: MockCreditAccountBlockedError,
  };
});

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockAssertDomainAccess = jest.mocked(assertDomainAccess);
const originalFetch = global.fetch;
const creditService = jest.mocked(CreditService).mock.results[0].value;

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
    creditService.getBalance.mockResolvedValue({
      balanceMicrousd: 500_000,
      reservedMicrousd: 0,
      availableMicrousd: 500_000,
      balanceCredits: 50,
      availableCredits: 50,
      unlimited: false,
      blocked: false,
    });
    creditService.getOperationPricing.mockResolvedValue({
      pricingId: 'pricing-1',
      operationType: 'image_edit',
      displayName: 'AI image editing',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      unit: 'image_1k',
      credits: 10,
      providerCost: 0.07,
      providerCostCurrency: 'EUR',
      active: true,
    });
    creditService.reserve.mockResolvedValue({
      id: 'reservation-1',
      reservedMicrousd: 100_000,
      reservedCredits: 10,
      providerCostMicrousd: 67_000,
      unlimited: false,
    });
    creditService.settle.mockResolvedValue({
      balanceMicrousd: 400_000,
      reservedMicrousd: 0,
      availableMicrousd: 400_000,
      balanceCredits: 40,
      availableCredits: 40,
      unlimited: false,
      blocked: false,
    });
    creditService.release.mockResolvedValue(undefined);
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
    expect(result.credentialSource).toBe('user');
    expect(creditService.reserve).not.toHaveBeenCalled();
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
    expect(result).toEqual(expect.objectContaining({
      credentialSource: 'system',
      creditsCharged: 10,
      creditsRemaining: 40,
    }));
    expect(creditService.reserve).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'image-user',
      operationType: 'image_edit',
      provider: 'gemini',
      model: 'gemini-3.1-flash-image',
      unit: 'image_1k',
    }));
    expect(creditService.settle).toHaveBeenCalledWith('reservation-1', 67_000);
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('system-google-key');
  });

  it('uses the system key when the user explicitly selects Allerac billing', async () => {
    jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({
      google_api_key: 'user-google-key',
      google_key_preference: 'allerac',
    } as never);
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }],
        },
      }],
    }), { status: 200 }));
    global.fetch = fetchMock;

    const result = await editProductImage(PNG_BASE64, { type: 'enhance' });

    if (!result.success) throw new Error(result.error);
    expect(result.credentialSource).toBe('system');
    expect(creditService.reserve).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('system-google-key');
  });

  it('blocks system-key image editing when the user has insufficient credits', async () => {
    jest.spyOn(UserSettingsService.prototype, 'loadUserSettings').mockResolvedValue({} as never);
    creditService.reserve.mockRejectedValueOnce(new InsufficientCreditsError(100_000, 60_000));
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const result = await editProductImage(PNG_BASE64, { type: 'enhance' });

    expect(result).toEqual({
      success: false,
      error: 'Insufficient credits',
      code: 'INSUFFICIENT_CREDITS',
      requiredCredits: 10,
      availableCredits: 6,
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
      error: 'A sua Google API key não tem quota disponível para o modelo gemini-3.1-flash-image. '
        + 'Ative o billing no projeto dessa chave no Google AI Studio ou configure outra chave com acesso ao modelo.',
      code: 'GEMINI_QUOTA_EXCEEDED',
      keySource: 'user',
    });
  });

  it('uses the active model configured for image editing', async () => {
    creditService.getOperationPricing.mockResolvedValueOnce({
      pricingId: 'pricing-2',
      operationType: 'image_edit',
      displayName: 'AI image editing',
      provider: 'gemini',
      model: 'gemini-cheaper-image-model',
      unit: 'image_1k',
      credits: 7,
      providerCost: 0.04,
      providerCostCurrency: 'EUR',
      active: true,
    });
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }],
        },
      }],
    }), { status: 200 }));
    global.fetch = fetchMock;

    const result = await editProductImage(PNG_BASE64, { type: 'enhance' });

    expect(result.success).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-cheaper-image-model:generateContent',
    );
  });
});
