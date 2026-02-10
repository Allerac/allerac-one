// Web search tool using Tavily API with caching and metrics tracking

import pool from '@/app/clients/db';
import { normalizeQueryForCache, hashString } from '../services/infrastructure/cache.service';
import { MetricsService } from '../services/infrastructure/metrics.service';
import { SearchWebResult } from '../types';

export class SearchWebTool {
  private metricsService: MetricsService;

  constructor(
    private tavilyApiKey: string
  ) {
    this.metricsService = new MetricsService();
  }

  async execute(query: string): Promise<SearchWebResult> {
    if (!this.tavilyApiKey) {
      return {
        error: 'Tavily API key not configured. Please add your Tavily API key in settings.',
        results: [],
        query,
      };
    }

    const startTime = Date.now();

    try {
      // Normalize query semantically for better cache hits
      const normalizedQuery = normalizeQueryForCache(query);
      const queryHash = await hashString(normalizedQuery);

      console.log('🔍 Searching cache for query:', normalizedQuery);
      console.log('🔑 Cache hash:', queryHash);

      // Check cache first
      const cacheRes = await pool.query(
        `SELECT results, created_at, id, hit_count 
         FROM tavily_cache 
         WHERE query_hash = $1 AND expires_at > NOW()
         LIMIT 1`,
        [queryHash]
      );

      const cached = cacheRes.rows[0];

      if (cached) {
        console.log('✅ Cache HIT! Using cached result');

        // Log metrics for cache hit
        const responseTime = Date.now() - startTime;
        await this.metricsService.logApiCall({
          api_name: 'tavily',
          endpoint: '/search',
          method: 'POST',
          response_time_ms: responseTime,
          status_code: 200,
          success: true,
          metadata: {
            from_cache: true,
            cache_hit_count: cached.hit_count,
            query_normalized: normalizedQuery,
          },
        });

        // Update hit count and last accessed
        await pool.query(
          'UPDATE tavily_cache SET hit_count = hit_count + 1, last_accessed_at = NOW() WHERE id = $1',
          [cached.id]
        );

        return {
          ...cached.results,
          from_cache: true,
          cached_at: cached.created_at,
        };
      }

      console.log('❌ Cache MISS. Fetching from Tavily API...');

      // No cache hit, fetch from Tavily API with metrics tracking
      const result = await this.metricsService.trackApiCall(
        'tavily',
        async () => {
          const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              api_key: this.tavilyApiKey,
              query: query,
              search_depth: 'basic',
              include_answer: true,
              max_results: 5,
            }),
          });

          if (!response.ok) {
            throw new Error(`Tavily API error: ${response.statusText}`);
          }

          return await response.json();
        },
        {
          endpoint: '/search',
          method: 'POST',
          metadata: {
            from_cache: false,
            query_normalized: normalizedQuery,
          },
        }
      );

      const searchResult: SearchWebResult = {
        answer: result.answer || '',
        results: result.results?.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score,
        })) || [],
        query: query,
      };

      // Save to cache
      console.log('💾 Saving result to cache...');
      try {
        await pool.query(
          `INSERT INTO tavily_cache (query, query_hash, results, expires_at)
           VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
          [normalizedQuery, queryHash, searchResult]
        );
        console.log('✅ Saved to cache successfully');
      } catch (insertError) {
        console.error('❌ Failed to save to cache:', insertError);
      }

      return searchResult;
    } catch (error: any) {
      // Log error metrics
      const responseTime = Date.now() - startTime;
      await this.metricsService.logApiCall({
        api_name: 'tavily',
        endpoint: '/search',
        method: 'POST',
        response_time_ms: responseTime,
        status_code: 500,
        success: false,
        error_message: error.message,
        error_type: error.name || 'Error',
      });

      return {
        error: error.message,
        results: [],
        query,
      };
    }
  }
}
