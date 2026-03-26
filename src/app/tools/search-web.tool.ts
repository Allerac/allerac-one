// Web search tool using Tavily API with two-level caching and metrics tracking
//
// Cache strategy:
//   Level 1 — DB hash (exact/near-exact text match, persistent across restarts)
//   Level 2 — SemanticQueryCache (in-memory, cross-language via embedding similarity)
//
// Example: "current edinburgh weather" and "qual a temperatura em Edimburgo"
// produce different text hashes but embedding similarity ~0.96 → semantic cache HIT.

import pool from '@/app/clients/db';
import { normalizeQueryForCache, hashString, semanticSearchCache } from '../services/infrastructure/cache.service';
import { MetricsService } from '../services/infrastructure/metrics.service';
import { EmbeddingService } from '../services/rag/embedding.service';
import { SearchWebResult } from '../types';

export class SearchWebTool {
  private metricsService: MetricsService;
  private embeddingService: EmbeddingService | null;

  constructor(
    private tavilyApiKey: string,
    githubToken?: string,
  ) {
    this.metricsService = new MetricsService();
    this.embeddingService = githubToken ? new EmbeddingService(githubToken) : null;
  }

  async execute(query: string): Promise<SearchWebResult> {
    if (!this.tavilyApiKey) {
      return { error: 'Tavily API key not configured. Please add your Tavily API key in settings.', results: [], query };
    }

    const startTime = Date.now();

    try {
      // ── Level 1: DB hash cache (exact/near-exact, language-specific) ──────
      const normalizedQuery = normalizeQueryForCache(query);
      const queryHash = await hashString(normalizedQuery);

      console.log(`[Search] Cache L1 check: "${normalizedQuery.slice(0, 60)}"`);

      const cacheRes = await pool.query(
        `SELECT results, created_at, id, hit_count
         FROM tavily_cache
         WHERE query_hash = $1 AND expires_at > NOW()
         LIMIT 1`,
        [queryHash],
      );

      if (cacheRes.rows[0]) {
        const cached = cacheRes.rows[0];
        console.log('[Search] Cache L1 HIT (exact match)');
        await pool.query(
          'UPDATE tavily_cache SET hit_count = hit_count + 1, last_accessed_at = NOW() WHERE id = $1',
          [cached.id],
        );
        await this.metricsService.logApiCall({
          api_name: 'tavily', endpoint: '/search', method: 'POST',
          response_time_ms: Date.now() - startTime, status_code: 200, success: true,
          metadata: { from_cache: true, cache_level: 1, query_normalized: normalizedQuery },
        });
        // Populate semantic cache so future cross-language queries hit L2
        if (this.embeddingService) {
          this.embeddingService.generateEmbedding(query)
            .then(({ embedding }) => semanticSearchCache.set(embedding, cached.results, query))
            .catch(() => {});
        }
        return { ...cached.results, from_cache: true, cached_at: cached.created_at };
      }

      // ── Level 2: Semantic cache (cross-language via embeddings) ──────────
      if (this.embeddingService) {
        try {
          const { embedding } = await this.embeddingService.generateEmbedding(query);
          const semanticHit = semanticSearchCache.get(embedding);
          if (semanticHit) {
            console.log(`[Search] Cache L2 HIT (semantic, similarity ${semanticHit.similarity.toFixed(3)}, original: "${semanticHit.cachedQuery.slice(0, 50)}")`);
            await this.metricsService.logApiCall({
              api_name: 'tavily', endpoint: '/search', method: 'POST',
              response_time_ms: Date.now() - startTime, status_code: 200, success: true,
              metadata: { from_cache: true, cache_level: 2, similarity: semanticHit.similarity, original_query: semanticHit.cachedQuery },
            });
            return { ...semanticHit.result, from_cache: true };
          }

          // Full miss — call Tavily, then populate both caches
          console.log('[Search] Cache miss (L1+L2) — calling Tavily API');
          const result = await this.fetchFromTavily(query, normalizedQuery);
          semanticSearchCache.set(embedding, result, query);
          await this.saveToDb(normalizedQuery, queryHash, result);
          await this.metricsService.logApiCall({
            api_name: 'tavily', endpoint: '/search', method: 'POST',
            response_time_ms: Date.now() - startTime, status_code: 200, success: true,
            metadata: { from_cache: false, semantic_cache_size: semanticSearchCache.size },
          });
          return result;
        } catch (embeddingError) {
          console.warn('[Search] Embedding failed, skipping L2 cache:', (embeddingError as Error).message);
          // Fall through to Tavily without semantic cache
        }
      }

      // Fallback: no embedding service — L1 miss only
      console.log('[Search] Cache L1 miss — calling Tavily API (no semantic cache)');
      const result = await this.fetchFromTavily(query, normalizedQuery);
      await this.saveToDb(normalizedQuery, queryHash, result);
      return result;

    } catch (error: any) {
      await this.metricsService.logApiCall({
        api_name: 'tavily', endpoint: '/search', method: 'POST',
        response_time_ms: Date.now() - startTime, status_code: 500, success: false,
        error_message: error.message, error_type: error.name || 'Error',
      });
      return { error: error.message, results: [], query };
    }
  }

  private async fetchFromTavily(query: string, normalizedQuery: string): Promise<SearchWebResult> {
    const raw = await this.metricsService.trackApiCall(
      'tavily',
      async () => {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.tavilyApiKey,
            query,
            search_depth: 'basic',
            include_answer: true,
            max_results: 5,
          }),
        });
        if (!response.ok) throw new Error(`Tavily API error: ${response.statusText}`);
        return response.json();
      },
      { endpoint: '/search', method: 'POST', metadata: { from_cache: false, query_normalized: normalizedQuery } },
    );

    return {
      answer: raw.answer || '',
      results: raw.results?.map((r: any) => ({
        title: r.title, url: r.url, content: r.content, score: r.score,
      })) || [],
      query,
    };
  }

  private async saveToDb(normalizedQuery: string, queryHash: string, result: SearchWebResult): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO tavily_cache (query, query_hash, results, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
        [normalizedQuery, queryHash, result],
      );
      console.log('[Search] Saved to L1 cache (DB)');
    } catch (err) {
      console.warn('[Search] Failed to save to L1 cache:', (err as Error).message);
    }
  }
}
