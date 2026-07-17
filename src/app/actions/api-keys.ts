'use server';

import { requireCurrentUser } from '@/app/lib/auth-session';

export type ApiKeyProvider = 'github' | 'anthropic' | 'google' | 'openai' | 'tavily';

export async function validateApiKey(
  provider: ApiKeyProvider,
  key: string
): Promise<{ valid: boolean; error?: string }> {
  await requireCurrentUser();

  const trimmed = key.trim();
  if (!trimmed) return { valid: false, error: 'Key is empty' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    let res: Response;

    if (provider === 'github') {
      res = await fetch('https://models.inference.ai.azure.com/models', {
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: controller.signal,
      });
    } else if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': trimmed,
          'anthropic-version': '2023-06-01',
        },
        signal: controller.signal,
      });
    } else if (provider === 'google') {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`,
        { signal: controller.signal }
      );
    } else if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: controller.signal,
      });
    } else {
      // tavily
      res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${trimmed}`,
        },
        body: JSON.stringify({ query: 'test', max_results: 1 }),
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);

    if (res.ok) return { valid: true };

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: 'Invalid or unauthorized key' };
    }

    return { valid: false, error: `Provider returned ${res.status}` };
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === 'AbortError') {
      return { valid: false, error: 'Request timed out' };
    }
    return { valid: false, error: 'Connection failed' };
  }
}
