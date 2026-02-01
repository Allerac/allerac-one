// Metrics service for tracking API calls, tokens usage, and performance

import pool from '@/app/clients/db';

export interface ApiLogEntry {
  api_name: string;
  endpoint?: string;
  method?: string;
  user_id?: string;
  session_id?: string;
  response_time_ms?: number;
  status_code?: number;
  success: boolean;
  error_message?: string;
  error_type?: string;
  metadata?: Record<string, any>;
}

export interface TokenUsageEntry {
  model: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd?: number;
  user_id?: string;
  session_id?: string;
  conversation_id?: string;
  metadata?: Record<string, any>;
}

export class MetricsService {
  /**
   * Log an API call with timing and status information
   */
  async logApiCall(entry: ApiLogEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO api_logs (
          api_name, endpoint, method, user_id, session_id,
          response_time_ms, status_code, success, error_message, error_type, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.api_name,
          entry.endpoint,
          entry.method || 'POST',
          entry.user_id,
          entry.session_id,
          entry.response_time_ms,
          entry.status_code,
          entry.success,
          entry.error_message,
          entry.error_type,
          entry.metadata || {}
        ]
      );
    } catch (err) {
      // Don't throw - metrics logging should not break the app
      console.error('Exception while logging API call:', err);
    }
  }

  /**
   * Log token usage for LLM calls
   */
  async logTokenUsage(entry: TokenUsageEntry): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO tokens_usage (
          model, provider, prompt_tokens, completion_tokens, total_tokens,
          estimated_cost_usd, user_id, session_id, conversation_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          entry.model,
          entry.provider,
          entry.prompt_tokens,
          entry.completion_tokens,
          entry.total_tokens,
          entry.estimated_cost_usd,
          entry.user_id,
          entry.session_id,
          entry.conversation_id,
          entry.metadata || {}
        ]
      );
    } catch (err) {
      console.error('Exception while logging token usage:', err);
    }
  }

  /**
   * Wrapper for API calls with automatic metrics tracking
   */
  async trackApiCall<T>(
    apiName: string,
    operation: () => Promise<T>,
    options?: {
      endpoint?: string;
      method?: string;
      userId?: string;
      sessionId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    const startTime = Date.now();
    let success = true;
    let statusCode: number | undefined;
    let errorMessage: string | undefined;
    let errorType: string | undefined;

    try {
      const result = await operation();
      statusCode = 200; // Assume success
      return result;
    } catch (error: any) {
      success = false;
      statusCode = error.status || error.statusCode || 500;
      errorMessage = error.message || String(error);
      errorType = error.name || error.constructor?.name || 'Error';
      throw error; // Re-throw the error
    } finally {
      const responseTime = Date.now() - startTime;

      // Log asynchronously without awaiting
      this.logApiCall({
        api_name: apiName,
        endpoint: options?.endpoint,
        method: options?.method,
        user_id: options?.userId,
        session_id: options?.sessionId,
        response_time_ms: responseTime,
        status_code: statusCode,
        success,
        error_message: errorMessage,
        error_type: errorType,
        metadata: options?.metadata,
      }).catch(err => console.error('Failed to log metrics:', err));
    }
  }

  /**
   * Get Tavily API call statistics for a time range
   */
  async getTavilyStats(hours: number = 24, useCurrentMonth: boolean = false): Promise<{
    total_calls: number;
    successful_calls: number;
    failed_calls: number;
    avg_response_time_ms: number;
    cache_hit_rate?: number;
  }> {
    try {
      // For simplicity, just querying the view or raw table aggregation
      // We will execute raw aggregation here for flexibility

      let timeFilter = `timestamp >= NOW() - INTERVAL '${hours} hours'`;
      if (useCurrentMonth) {
        timeFilter = "timestamp >= date_trunc('month', NOW())";
      }

      const res = await pool.query(
        `SELECT
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE success = true) as successful_calls,
          COUNT(*) FILTER (WHERE success = false) as failed_calls,
          COALESCE(AVG(response_time_ms), 0) as avg_response_time_ms
         FROM api_logs
         WHERE api_name = 'tavily' AND ${timeFilter}`
      );

      const row = res.rows[0];
      return {
        total_calls: parseInt(row.total_calls),
        successful_calls: parseInt(row.successful_calls),
        failed_calls: parseInt(row.failed_calls),
        avg_response_time_ms: parseFloat(row.avg_response_time_ms)
      };
    } catch (err) {
      console.error('Exception while getting Tavily stats:', err);
      return {
        total_calls: 0,
        successful_calls: 0,
        failed_calls: 0,
        avg_response_time_ms: 0,
      };
    }
  }

  /**
   * Get token usage statistics for a time range
   */
  async getTokenStats(hours: number = 24, useCurrentMonth: boolean = false): Promise<{
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_requests: number;
    estimated_cost_usd: number;
  }> {
    try {
      let timeFilter = `timestamp >= NOW() - INTERVAL '${hours} hours'`;
      if (useCurrentMonth) {
        timeFilter = "timestamp >= date_trunc('month', NOW())";
      }

      const res = await pool.query(
        `SELECT
           COALESCE(SUM(total_tokens), 0) as total_tokens,
           COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
           COALESCE(SUM(completion_tokens), 0) as completion_tokens,
           COUNT(*) as total_requests,
           COALESCE(SUM(estimated_cost_usd), 0) as estimated_cost_usd
         FROM tokens_usage
         WHERE ${timeFilter}`
      );

      const row = res.rows[0];

      return {
        total_tokens: parseInt(row.total_tokens),
        prompt_tokens: parseInt(row.prompt_tokens),
        completion_tokens: parseInt(row.completion_tokens),
        total_requests: parseInt(row.total_requests),
        estimated_cost_usd: parseFloat(row.estimated_cost_usd),
      };
    } catch (err) {
      console.error('Exception while getting token stats:', err);
      return {
        total_tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_requests: 0,
        estimated_cost_usd: 0,
      };
    }
  }
}
