// Shared embedding configuration for the maintenance scripts. It mirrors
// src/app/services/rag/embedding.service.ts so the scripts and the app agree
// on the embedding space (provider, model, dimensions, version).

import crypto from 'node:crypto';

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function embeddingConfig(env = process.env) {
  const provider = (env.EMBEDDING_PROVIDER || 'ollama').trim().toLowerCase() === 'openai'
    ? 'openai'
    : 'ollama';
  const dimensions = positiveInteger(env.EMBEDDING_DIMENSIONS, 768);
  const timeoutMs = positiveInteger(env.EMBEDDING_TIMEOUT_MS, 30_000);

  if (provider === 'openai') {
    const model = env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    return {
      provider,
      model,
      dimensions,
      timeoutMs,
      version: env.OPENAI_EMBEDDING_VERSION || `openai:${model}:${dimensions}:v1`,
      baseUrl: (env.OPENAI_EMBEDDING_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    };
  }

  const model = env.EMBEDDING_MODEL || 'embeddinggemma';
  return {
    provider,
    model,
    dimensions,
    timeoutMs,
    version: env.EMBEDDING_VERSION || `ollama:${model}:v1`,
    baseUrl: (env.EMBEDDING_BASE_URL || env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    keepAlive: env.EMBEDDING_KEEP_ALIVE || '10m',
  };
}

function encryptionKey(env) {
  const key = env.ENCRYPTION_KEY;
  if (!key) return null;
  if (key.length === 64) return Buffer.from(key, 'hex');
  if (key.length === 44) return Buffer.from(key, 'base64');
  return crypto.createHash('sha256').update(key).digest();
}

function decrypt(ciphertext, key) {
  const [iv, tag, data] = String(ciphertext).split(':');
  if (!iv || !tag || data === undefined) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return decipher.update(data, 'hex', 'utf8') + decipher.final('utf8');
}

/** OpenAI key from system settings (needs ENCRYPTION_KEY), then OPENAI_API_KEY. */
export async function resolveOpenAIKey(pool, env = process.env) {
  const key = encryptionKey(env);
  if (key) {
    const result = await pool.query(
      "SELECT value_encrypted FROM system_settings WHERE key = 'openai_api_key'",
    ).catch(() => ({ rows: [] }));
    const stored = result.rows[0]?.value_encrypted;
    if (stored) {
      try {
        const value = decrypt(stored, key)?.trim();
        if (value) return value;
      } catch {
        // Fall through to the environment.
      }
    }
  }
  return env.OPENAI_API_KEY?.trim() || null;
}

export function createEmbedder(config, apiKey) {
  return async function embed(texts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      let vectors;
      if (config.provider === 'openai') {
        if (!apiKey) throw new Error('OpenAI embeddings need an OpenAI API key');
        const response = await fetch(`${config.baseUrl}/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: config.model,
            input: texts,
            dimensions: config.dimensions,
            encoding_format: 'float',
          }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
        }
        const body = await response.json();
        vectors = Array.isArray(body.data)
          ? [...body.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding)
          : null;
      } else {
        const response = await fetch(`${config.baseUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.model, input: texts, keep_alive: config.keepAlive }),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
        }
        vectors = (await response.json()).embeddings;
      }
      if (!Array.isArray(vectors) || vectors.length !== texts.length) {
        throw new Error(`${config.provider} returned an unexpected embedding count`);
      }
      for (const vector of vectors) {
        if (!Array.isArray(vector) || vector.length !== config.dimensions) {
          throw new Error(`Expected ${config.dimensions} dimensions, received ${vector?.length ?? 0}`);
        }
      }
      return vectors;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function sameSpace(state, config) {
  return Boolean(state)
    && state.provider === config.provider
    && state.model === config.model
    && Number(state.dimensions) === config.dimensions
    && state.version === config.version;
}

export function spaceOf(config) {
  return {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    version: config.version,
  };
}
