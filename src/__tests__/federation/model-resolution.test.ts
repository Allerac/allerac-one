import { resolveFederationModel, type ResolvedProvider } from '@/federation/model-resolution';

const deps = (o: {
  domain?: { modelId: string; provider: string } | null;
  selected?: string | null;
  providers?: ResolvedProvider[];
}) => ({
  domainDefault: jest.fn(async () => o.domain ?? null),
  userSelectedModel: jest.fn(async () => o.selected ?? null),
  configuredProviders: jest.fn(async () => new Set(o.providers ?? [])),
});

describe('resolveFederationModel', () => {
  it('prefers the domain model setting', async () => {
    const d = deps({ domain: { modelId: 'claude-opus-4-7', provider: 'anthropic' }, providers: ['gemini'] });
    await expect(resolveFederationModel(d, 'u', 'chat'))
      .resolves.toEqual({ modelId: 'claude-opus-4-7', provider: 'anthropic', source: 'domain' });
    expect(d.domainDefault).toHaveBeenCalledWith('u', 'chat');
  });

  it('falls back to the user saved model when its provider is configured', async () => {
    await expect(resolveFederationModel(deps({ selected: 'claude-haiku-4-5-20251001', providers: ['anthropic'] }), 'u', 'chat'))
      .resolves.toEqual({ modelId: 'claude-haiku-4-5-20251001', provider: 'anthropic', source: 'user' });
  });

  it('ignores a saved model whose provider is not configured or unknown', async () => {
    await expect(resolveFederationModel(deps({ selected: 'gpt-5.6-luna', providers: ['anthropic'] }), 'u', 'chat'))
      .resolves.toMatchObject({ provider: 'anthropic', source: 'unit' });
    await expect(resolveFederationModel(deps({ selected: 'no-such-model', providers: ['gemini'] }), 'u', 'chat'))
      .resolves.toMatchObject({ provider: 'gemini', source: 'unit' });
  });

  it('uses a Claude unit default when only an Anthropic key is present', async () => {
    await expect(resolveFederationModel(deps({ providers: ['anthropic'] }), 'u', 'chat'))
      .resolves.toEqual({ modelId: 'claude-sonnet-4-6', provider: 'anthropic', source: 'unit' });
  });

  it('returns null when no provider is available', async () => {
    await expect(resolveFederationModel(deps({}), 'u', 'chat')).resolves.toBeNull();
  });
});
