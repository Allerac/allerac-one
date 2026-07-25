import pool from '@/app/clients/db';
import { MODELS } from '@/app/services/llm/models';

type Provider = 'github' | 'ollama' | 'gemini' | 'anthropic';

export interface DomainModelSettings {
  domainSlug: string;
  inheritGlobal: boolean;
  modelId: string | null;
  fallbackModelId: string | null;
  temperature: number | null;
  maxTokens: number | null;
  localOnly: boolean;
}

export interface ResolvedDomainModel {
  modelId: string;
  provider: Provider;
  temperature: number;
  maxTokens: number;
  source: 'domain' | 'global';
  fallbackModelId: string | null;
  localOnly: boolean;
}

const knownModel = (modelId: string) => MODELS.find(model => model.id === modelId);

export class DomainModelSettingsService {
  async get(userId: string, domainSlug: string): Promise<DomainModelSettings> {
    const result = await pool.query(
      `SELECT model_id, fallback_model_id, temperature, max_tokens, local_only
       FROM user_domain_model_settings
       WHERE user_id = $1 AND domain_slug = $2`,
      [userId, domainSlug],
    );
    const row = result.rows[0];
    return {
      domainSlug,
      inheritGlobal: !row,
      modelId: row?.model_id ?? null,
      fallbackModelId: row?.fallback_model_id ?? null,
      temperature: row?.temperature == null ? null : Number(row.temperature),
      maxTokens: row?.max_tokens == null ? null : Number(row.max_tokens),
      localOnly: row?.local_only ?? false,
    };
  }

  async set(userId: string, settings: DomainModelSettings): Promise<void> {
    if (settings.inheritGlobal) {
      await pool.query(
        'DELETE FROM user_domain_model_settings WHERE user_id = $1 AND domain_slug = $2',
        [userId, settings.domainSlug],
      );
      return;
    }
    if (!settings.modelId || !knownModel(settings.modelId)) throw new Error('Unknown domain model');
    if (settings.fallbackModelId && !knownModel(settings.fallbackModelId)) {
      throw new Error('Unknown fallback model');
    }
    if (settings.localOnly && knownModel(settings.modelId)?.provider !== 'ollama') {
      throw new Error('Local-only domains must use a local model');
    }
    await pool.query(
      `INSERT INTO user_domain_model_settings
         (user_id, domain_slug, model_id, fallback_model_id, temperature, max_tokens, local_only)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, domain_slug) DO UPDATE SET
         model_id = EXCLUDED.model_id,
         fallback_model_id = EXCLUDED.fallback_model_id,
         temperature = EXCLUDED.temperature,
         max_tokens = EXCLUDED.max_tokens,
         local_only = EXCLUDED.local_only,
         updated_at = NOW()`,
      [userId, settings.domainSlug, settings.modelId, settings.fallbackModelId,
        settings.temperature, settings.maxTokens, settings.localOnly],
    );
  }

  async resolve(input: {
    userId: string;
    domainSlug: string;
    globalModelId: string;
    globalProvider: Provider;
  }): Promise<ResolvedDomainModel> {
    const settings = await this.get(input.userId, input.domainSlug);
    const configured = settings.modelId ? knownModel(settings.modelId) : null;
    return {
      modelId: configured?.id ?? input.globalModelId,
      provider: (configured?.provider ?? input.globalProvider) as Provider,
      temperature: settings.temperature ?? 0.7,
      maxTokens: settings.maxTokens ?? 2000,
      source: configured ? 'domain' : 'global',
      fallbackModelId: settings.fallbackModelId,
      localOnly: settings.localOnly,
    };
  }
}

export const domainModelSettingsService = new DomainModelSettingsService();
