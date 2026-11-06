/**
 * Model resolution for federated agent asks.
 *
 * Normal chat receives model/provider from the browser on every request (the
 * chat selector lives in localStorage), so a federated ask has no request-level
 * model. We resolve server-side in this order:
 *   1. the acting user's per-domain model (Settings > Domains),
 *   2. the acting user's saved global model (user_settings.selected_model),
 *   3. a unit default derived from the configured provider keys.
 * Returns null only when no provider is usable at all.
 */
import { MODELS } from '@/app/services/llm/models';

export type ResolvedProvider = 'github' | 'ollama' | 'gemini' | 'anthropic' | 'openai';

export interface ResolvedFederationModel {
  modelId: string;
  provider: ResolvedProvider;
  source: 'domain' | 'user' | 'unit';
}

export interface ModelResolutionDeps {
  domainDefault(userId: string, slug: string): Promise<{ modelId: string; provider: string } | null>;
  userSelectedModel(userId: string): Promise<string | null>;
  configuredProviders(userId: string): Promise<Set<ResolvedProvider>>;
}

/** Preferred unit-level defaults, in priority order, per provider. */
export const UNIT_DEFAULT_MODELS: Array<{ provider: ResolvedProvider; modelId: string }> = [
  { provider: 'anthropic', modelId: 'claude-sonnet-4-6' },
  { provider: 'openai', modelId: 'gpt-5.6-luna' },
  { provider: 'gemini', modelId: 'gemini-2.5-flash' },
  { provider: 'github', modelId: 'gpt-4o' },
  { provider: 'ollama', modelId: 'qwen2.5:3b' },
];

const known = (modelId: string | null | undefined) =>
  modelId ? MODELS.find(model => model.id === modelId) : undefined;

export async function resolveFederationModel(
  deps: ModelResolutionDeps,
  userId: string,
  slug: string,
): Promise<ResolvedFederationModel | null> {
  const domain = await deps.domainDefault(userId, slug);
  if (domain) return { modelId: domain.modelId, provider: domain.provider as ResolvedProvider, source: 'domain' };

  const providers = await deps.configuredProviders(userId);
  const selected = known(await deps.userSelectedModel(userId));
  if (selected && providers.has(selected.provider as ResolvedProvider)) {
    return { modelId: selected.id, provider: selected.provider as ResolvedProvider, source: 'user' };
  }

  for (const candidate of UNIT_DEFAULT_MODELS) {
    if (!providers.has(candidate.provider)) continue;
    const model = known(candidate.modelId)
      ?? MODELS.find(m => m.provider === candidate.provider);
    if (model) return { modelId: model.id, provider: candidate.provider, source: 'unit' };
  }
  return null;
}
