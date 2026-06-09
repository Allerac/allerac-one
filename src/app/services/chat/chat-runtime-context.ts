import pool from '@/app/clients/db';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import type { ChatProvider } from './chat-request-parser';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

export class ChatProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderConfigurationError';
  }
}

export async function loadChatRuntimeContext(
  userId: string,
  domain: string,
  provider: ChatProvider,
) {
  const [settings, systemSettings] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll(),
  ]);
  const githubToken = settings?.github_token
    || systemSettings.github_token
    || process.env.GITHUB_TOKEN
    || '';
  const tavilyApiKey = settings?.tavily_api_key
    || systemSettings.tavily_api_key
    || process.env.TAVILY_API_KEY
    || undefined;
  const googleApiKey = settings?.google_api_key || systemSettings.google_api_key || '';
  const anthropicApiKey = settings?.anthropic_api_key || systemSettings.anthropic_api_key || '';

  if (provider === 'anthropic' && !anthropicApiKey) {
    throw new ChatProviderConfigurationError(
      '❌ **Anthropic API key not configured**\n\nPlease add your Anthropic API key in Settings → Developer API Keys.',
    );
  }
  if (provider === 'gemini' && !googleApiKey) {
    throw new ChatProviderConfigurationError(
      'Google API key is not configured. Please add it in Configuration → API Keys.',
    );
  }

  let userInstructions = '';
  try {
    const result = await pool.query(
      'SELECT content FROM user_domain_instructions WHERE user_id = $1 AND domain_slug = $2',
      [userId, domain],
    );
    userInstructions = result.rows[0]?.content?.trim() || '';
  } catch {
    // The global user instruction remains a valid fallback.
  }
  if (!userInstructions) {
    const fallback = settings?.system_message;
    if (fallback && fallback !== 'You are a helpful AI assistant.') {
      userInstructions = fallback;
    }
  }

  const modelBaseUrl = provider === 'ollama' ? OLLAMA_BASE_URL
    : provider === 'gemini' ? GEMINI_BASE_URL
      : provider === 'anthropic' ? ANTHROPIC_BASE_URL
        : GITHUB_BASE_URL;

  return {
    githubToken,
    tavilyApiKey,
    googleApiKey,
    anthropicApiKey,
    userLocation: settings?.location || null,
    userInstructions,
    modelBaseUrl,
  };
}
