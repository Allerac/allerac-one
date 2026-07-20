import { MODELS } from '@/app/services/llm/models';

export type JobModelProvider = 'github' | 'ollama' | 'gemini' | 'anthropic';

export interface JobModelCredentials {
  githubToken: string;
  googleApiKey: string;
  anthropicApiKey: string;
}

export interface ResolvedJobModel {
  selectedModel: string;
  modelProvider: JobModelProvider;
  modelBaseUrl: string;
}

export function validateJobModelSelection(model: string | null | undefined, provider: string | null | undefined): string | null {
  if (!model && !provider) return null;
  if (!model || !provider) return 'Model and provider must be selected together';

  const configured = MODELS.find((candidate) => candidate.id === model);
  if (!configured || configured.provider !== provider) return 'Invalid model selection';
  if (!['github', 'ollama', 'gemini', 'anthropic'].includes(provider)) return 'Unsupported model provider';
  return null;
}

export function resolveJobModel(
  requestedModel: string | null | undefined,
  requestedProvider: string | null | undefined,
  credentials: JobModelCredentials,
): ResolvedJobModel {
  const validationError = validateJobModelSelection(requestedModel, requestedProvider);
  if (validationError) throw new Error(validationError);

  if (requestedModel && requestedProvider) {
    if (requestedProvider === 'github' && !credentials.githubToken) throw new Error('The selected GitHub model requires a configured GitHub token');
    if (requestedProvider === 'gemini' && !credentials.googleApiKey) throw new Error('The selected Gemini model requires a configured Google API key');
    if (requestedProvider === 'anthropic' && !credentials.anthropicApiKey) throw new Error('The selected Anthropic model requires a configured Anthropic API key');

    const configured = MODELS.find((candidate) => candidate.id === requestedModel)!;
    return {
      selectedModel: requestedModel,
      modelProvider: requestedProvider as JobModelProvider,
      modelBaseUrl: requestedProvider === 'ollama'
        ? process.env.OLLAMA_BASE_URL || 'http://ollama:11434'
        : configured.baseUrl || (requestedProvider === 'anthropic' ? 'https://api.anthropic.com' : ''),
    };
  }

  if (credentials.googleApiKey) {
    return { selectedModel: 'gemini-2.5-flash', modelProvider: 'gemini', modelBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' };
  }
  if (credentials.githubToken) {
    return { selectedModel: 'gpt-4o-mini', modelProvider: 'github', modelBaseUrl: 'https://models.inference.ai.azure.com' };
  }
  if (credentials.anthropicApiKey) {
    return { selectedModel: 'claude-haiku-4-5-20251001', modelProvider: 'anthropic', modelBaseUrl: 'https://api.anthropic.com' };
  }
  return { selectedModel: 'qwen2.5:3b', modelProvider: 'ollama', modelBaseUrl: process.env.OLLAMA_BASE_URL || 'http://ollama:11434' };
}
