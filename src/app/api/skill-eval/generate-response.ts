import Anthropic from '@anthropic-ai/sdk';

const GITHUB_BASE_URL = 'https://models.inference.ai.azure.com';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';

export const ALLOWED_PROVIDERS = new Set(['github', 'ollama', 'anthropic', 'gemini', 'openai']);

// OpenAI's reasoning family (o1/o3/gpt-5.x) rejects a custom temperature
// (only the default of 1 is accepted) and requires max_completion_tokens
// instead of max_tokens.
const OPENAI_REASONING_MODEL_PATTERN = /^(o\d|gpt-5)/;

export async function generateResponse(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  provider: string,
  githubToken: string,
  anthropicToken: string,
  googleApiKey: string,
  options: { temperature?: number; maxTokens?: number } = {},
  openaiApiKey: string = '',
): Promise<string> {
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1000;

  if (provider === 'gemini') {
    const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${googleApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } else if (provider === 'anthropic') {
    const anthropicClient = new Anthropic({ apiKey: anthropicToken });
    const response = await anthropicClient.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt || undefined,
      messages: [{ role: 'user', content: userPrompt }],
      temperature,
    });
    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  } else if (provider === 'openai') {
    const isReasoningModel = OPENAI_REASONING_MODEL_PATTERN.test(model);
    const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        ...(isReasoningModel ? { max_completion_tokens: maxTokens } : { temperature, max_tokens: maxTokens }),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } else if (provider === 'ollama') {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        stream: false,
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
    const data = await res.json();
    return data.message?.content ?? '';
  } else {
    const res = await fetch(`${GITHUB_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${githubToken}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub Models error ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
}
