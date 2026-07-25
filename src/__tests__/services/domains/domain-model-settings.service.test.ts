/** @jest-environment node */

import pool from '@/app/clients/db';
import { DomainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

const mockPool = pool as jest.Mocked<typeof pool>;

describe('DomainModelSettingsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('inherits the model supplied by global user settings', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as never);
    const service = new DomainModelSettingsService();

    const resolved = await service.resolve({
      userId: 'user-1',
      domainSlug: 'health',
      globalModelId: 'gpt-4o',
      globalProvider: 'github',
    });

    expect(resolved).toMatchObject({
      modelId: 'gpt-4o',
      provider: 'github',
      source: 'global',
      temperature: 0.7,
      maxTokens: 2000,
    });
  });

  it('overrides model and generation settings for a domain', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        model_id: 'qwen2.5:3b',
        fallback_model_id: 'deepseek-r1:7b',
        temperature: '0.20',
        max_tokens: 4096,
        local_only: true,
      }],
    } as never);
    const service = new DomainModelSettingsService();

    const resolved = await service.resolve({
      userId: 'user-1',
      domainSlug: 'health',
      globalModelId: 'gpt-4o',
      globalProvider: 'github',
    });

    expect(resolved).toEqual({
      modelId: 'qwen2.5:3b',
      provider: 'ollama',
      source: 'domain',
      temperature: 0.2,
      maxTokens: 4096,
      fallbackModelId: 'deepseek-r1:7b',
      localOnly: true,
    });
  });

  it('removes the override when inheritance is enabled', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as never);
    const service = new DomainModelSettingsService();

    await service.set('user-1', {
      domainSlug: 'health',
      inheritGlobal: true,
      modelId: null,
      fallbackModelId: null,
      temperature: null,
      maxTokens: null,
      localOnly: false,
    });

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_domain_model_settings'),
      ['user-1', 'health'],
    );
  });

  it('rejects a remote model for a local-only domain', async () => {
    const service = new DomainModelSettingsService();
    await expect(service.set('user-1', {
      domainSlug: 'health',
      inheritGlobal: false,
      modelId: 'gpt-4o',
      fallbackModelId: null,
      temperature: 0.7,
      maxTokens: 2000,
      localOnly: true,
    })).rejects.toThrow('Local-only');
  });
});
