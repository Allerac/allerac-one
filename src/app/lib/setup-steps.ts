/**
 * First-run setup wizard: step order and the LLM choices it offers.
 * Shared by the wizard (client) and the setup-config server actions.
 */
import { MODELS } from '@/app/services/llm/models';

/** Steps that run after the admin account exists, in wizard order. */
export const SETUP_STEPS = ['language', 'llm', 'google', 'email', 'search', 'telegram'] as const;
export type SetupStepId = typeof SETUP_STEPS[number];

/** Steps the admin may skip. The LLM step is required. */
export const OPTIONAL_SETUP_STEPS: readonly SetupStepId[] = ['language', 'google', 'email', 'search', 'telegram'];

export function isSetupStepId(value: unknown): value is SetupStepId {
  return typeof value === 'string' && (SETUP_STEPS as readonly string[]).includes(value);
}

/** Parses the setup_steps cookie value into known step ids. */
export function parseDoneSteps(raw: string | undefined | null): SetupStepId[] {
  if (!raw) return [];
  const seen = new Set<SetupStepId>();
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (isSetupStepId(id)) seen.add(id);
  }
  return SETUP_STEPS.filter(id => seen.has(id));
}

/** First step that still needs attention, or null when everything is done. */
export function firstIncompleteStep(done: readonly SetupStepId[]): SetupStepId | null {
  return SETUP_STEPS.find(id => !done.includes(id)) ?? null;
}

export const SETUP_LLM_PROVIDERS = ['openai', 'anthropic', 'ollama'] as const;
export type SetupLlmProvider = typeof SETUP_LLM_PROVIDERS[number];

export function isSetupLlmProvider(value: unknown): value is SetupLlmProvider {
  return typeof value === 'string' && (SETUP_LLM_PROVIDERS as readonly string[]).includes(value);
}

export interface SetupModelOption {
  id: string;
  name: string;
  description: string;
}

/** Chat models offered per provider: the app's known models for that provider. */
export function setupModelOptions(provider: SetupLlmProvider): SetupModelOption[] {
  return MODELS
    .filter(model => model.provider === provider)
    .map(model => ({ id: model.id, name: model.name, description: model.description ?? '' }));
}

const PREFERRED_DEFAULT: Record<SetupLlmProvider, string> = {
  openai: 'gpt-5.6-luna',
  anthropic: 'claude-sonnet-4-6',
  ollama: 'qwen2.5:3b',
};

/** Suggested default chat model for a provider (falls back to its first model). */
export function defaultSetupModel(provider: SetupLlmProvider): string | null {
  const options = setupModelOptions(provider);
  return options.find(o => o.id === PREFERRED_DEFAULT[provider])?.id ?? options[0]?.id ?? null;
}

/** Provider of a known model id, if it is one the setup wizard offers. */
export function setupProviderForModel(modelId: string | null | undefined): SetupLlmProvider | null {
  if (!modelId) return null;
  const provider = MODELS.find(model => model.id === modelId)?.provider;
  return isSetupLlmProvider(provider) ? provider : null;
}

/** Ollama reports "name:tag"; the app lists some models without ":latest". */
export function ollamaModelInstalled(modelId: string, installed: readonly string[]): boolean {
  return installed.some(name => name === modelId || name === `${modelId}:latest`);
}
