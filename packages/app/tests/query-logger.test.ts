/**
 * Query Logger Service Tests
 * Tests the QueryLoggerService integration with Supabase
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryLoggerService } from '../src/services/query-logger.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '@tjr/logger';

describe('QueryLoggerService', () => {
  let mockSupabase: SupabaseClient;
  let logger: ReturnType<typeof createLogger>;
  let queryLogger: QueryLoggerService;

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    } as unknown as SupabaseClient;

    // Create logger
    logger = createLogger({ level: 'error', json: false });

    // Create query logger service
    queryLogger = new QueryLoggerService(mockSupabase, logger);
  });

  describe('logQuery', () => {
    it('should log a successful query with all metadata', async () => {
      const entry = {
        user_id: 'user123',
        channel_id: 'channel456',
        conversation_id: 'conv789',
        prompt: 'What is the current price of ES?',
        response: 'The current price of ES is 5850.50',
        success: true,
        latency_ms: 1250,
        iteration_count: 2,
        tools_used: ['mcp__databento__get_futures_quote'],
      };

      await queryLogger.logQuery(entry);

      expect(mockSupabase.from).toHaveBeenCalledWith('query_logs');
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: 'user123',
          channel_id: 'channel456',
          conversation_id: 'conv789',
          prompt: 'What is the current price of ES?',
          response: 'The current price of ES is 5850.50',
          success: true,
          latency_ms: 1250,
          iteration_count: 2,
          tools_used: ['mcp__databento__get_futures_quote'],
        }),
      ]);
    });

    it('should log a failed query with error message', async () => {
      const entry = {
        user_id: 'user123',
        channel_id: 'channel456',
        conversation_id: 'conv789',
        prompt: 'Invalid query',
        success: false,
        error: 'API error: Rate limit exceeded',
        latency_ms: 500,
      };

      await queryLogger.logQuery(entry);

      expect(mockSupabase.from).toHaveBeenCalledWith('query_logs');
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: 'user123',
          channel_id: 'channel456',
          conversation_id: 'conv789',
          prompt: 'Invalid query',
          success: false,
          error: 'API error: Rate limit exceeded',
          latency_ms: 500,
        }),
      ]);
    });

    it('should handle missing optional fields', async () => {
      const entry = {
        conversation_id: 'conv789',
        prompt: 'Simple query',
        success: true,
        latency_ms: 300,
      };

      await queryLogger.logQuery(entry);

      expect(mockSupabase.from).toHaveBeenCalledWith('query_logs');
      expect(mockSupabase.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          conversation_id: 'conv789',
          prompt: 'Simple query',
          success: true,
          latency_ms: 300,
        }),
      ]);
    });

    it('should not throw error if Supabase insert fails', async () => {
      // Mock Supabase error
      mockSupabase.insert = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const entry = {
        conversation_id: 'conv789',
        prompt: 'Test query',
        success: true,
        latency_ms: 100,
      };

      // Should not throw
      await expect(queryLogger.logQuery(entry)).resolves.toBeUndefined();
    });
  });

  describe('getRecentQueries', () => {
    it('should fetch recent queries for a user', async () => {
      const mockQueries = [
        {
          user_id: 'user123',
          conversation_id: 'conv1',
          prompt: 'Query 1',
          success: true,
          latency_ms: 500,
        },
        {
          user_id: 'user123',
          conversation_id: 'conv2',
          prompt: 'Query 2',
          success: true,
          latency_ms: 600,
        },
      ];

      mockSupabase.limit = vi
        .fn()
        .mockResolvedValue({ data: mockQueries, error: null });

      const queries = await queryLogger.getRecentQueries('user123', 10);

      expect(queries).toEqual(mockQueries);
      expect(mockSupabase.from).toHaveBeenCalledWith('query_logs');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user123');
      expect(mockSupabase.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('getQueryStats', () => {
    it('should calculate query statistics for a user', async () => {
      const mockQueries = [
        { success: true, latency_ms: 500, tools_used: ['tool1'] },
        { success: true, latency_ms: 600, tools_used: ['tool1', 'tool2'] },
        { success: false, latency_ms: 300, tools_used: [] },
      ];

      // Mock the chained Supabase calls
      const mockEq = vi.fn().mockResolvedValue({ data: mockQueries, error: null });
      mockSupabase.select = vi.fn().mockReturnValue({ eq: mockEq });

      const stats = await queryLogger.getQueryStats('user123');

      expect(stats).toEqual({
        totalQueries: 3,
        successfulQueries: 2,
        failedQueries: 1,
        averageLatencyMs: (500 + 600 + 300) / 3,
        totalToolsUsed: 3,
      });
    });
  });
});
