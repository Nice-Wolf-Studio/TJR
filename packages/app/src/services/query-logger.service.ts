/**
 * Query Logger Service with Supabase Integration
 * Logs all user queries with metadata for analytics and debugging
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from '@tjr/logger';

/**
 * Query log entry matching Supabase schema
 */
export interface QueryLogEntry {
  user_id?: string;
  channel_id?: string;
  conversation_id: string;
  prompt: string;
  intent?: string;
  response?: string;
  success: boolean;
  error?: string;
  latency_ms: number;
  iteration_count?: number;
  tools_used?: string[];
}

/**
 * Service for logging query metadata to Supabase
 */
export class QueryLoggerService {
  constructor(
    private supabase: SupabaseClient,
    private logger: Logger
  ) {}

  /**
   * Log a query entry to Supabase
   */
  async logQuery(entry: QueryLogEntry): Promise<void> {
    try {
      this.logger.debug('Logging query to Supabase', {
        conversationId: entry.conversation_id,
        success: entry.success,
        latencyMs: entry.latency_ms,
        iterationCount: entry.iteration_count,
        toolsUsed: entry.tools_used,
      });

      const { error } = await this.supabase
        .from('query_logs')
        .insert([
          {
            user_id: entry.user_id,
            channel_id: entry.channel_id,
            conversation_id: entry.conversation_id,
            prompt: entry.prompt,
            intent: entry.intent,
            response: entry.response,
            success: entry.success,
            error: entry.error,
            latency_ms: entry.latency_ms,
            iteration_count: entry.iteration_count,
            tools_used: entry.tools_used,
            created_at: new Date().toISOString(),
          },
        ]);

      if (error) {
        this.logger.error('Failed to log query to Supabase', {
          error,
          conversationId: entry.conversation_id,
        });
        throw error;
      }

      this.logger.info('Query logged successfully', {
        conversationId: entry.conversation_id,
        success: entry.success,
        latencyMs: entry.latency_ms,
      });
    } catch (error) {
      // Log error but don't throw - query logging should not break the main flow
      this.logger.error('Error logging query', {
        error,
        conversationId: entry.conversation_id,
      });
    }
  }

  /**
   * Get recent queries for a user
   * @param userId User ID to filter by
   * @param limit Maximum number of queries to return (default: 10)
   */
  async getRecentQueries(userId: string, limit: number = 10): Promise<QueryLogEntry[]> {
    try {
      const { data, error } = await this.supabase
        .from('query_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.logger.error('Failed to fetch recent queries', { error, userId });
        throw error;
      }

      return data || [];
    } catch (error) {
      this.logger.error('Error fetching recent queries', { error, userId });
      return [];
    }
  }

  /**
   * Get query statistics for a user
   * @param userId User ID to get statistics for
   */
  async getQueryStats(userId: string): Promise<{
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageLatencyMs: number;
    totalToolsUsed: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('query_logs')
        .select('success, latency_ms, tools_used')
        .eq('user_id', userId);

      if (error) {
        this.logger.error('Failed to fetch query statistics', { error, userId });
        throw error;
      }

      const queries = data || [];
      const totalQueries = queries.length;
      const successfulQueries = queries.filter((q) => q.success).length;
      const failedQueries = totalQueries - successfulQueries;
      const averageLatencyMs =
        totalQueries > 0
          ? queries.reduce((sum, q) => sum + (q.latency_ms || 0), 0) / totalQueries
          : 0;
      const totalToolsUsed = queries.reduce(
        (sum, q) => sum + (q.tools_used?.length || 0),
        0
      );

      return {
        totalQueries,
        successfulQueries,
        failedQueries,
        averageLatencyMs,
        totalToolsUsed,
      };
    } catch (error) {
      this.logger.error('Error fetching query statistics', { error, userId });
      return {
        totalQueries: 0,
        successfulQueries: 0,
        failedQueries: 0,
        averageLatencyMs: 0,
        totalToolsUsed: 0,
      };
    }
  }
}
