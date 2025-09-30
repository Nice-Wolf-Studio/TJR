/**
 * @fileoverview Middleware for request ID injection in various contexts
 * Supports Express-like middleware and Discord.js command handlers
 */

import {
  withRequestContext,
  generateRequestId,
} from './request-context.js';

/**
 * Express-like request/response interface for middleware
 */
export interface Request {
  headers?: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

export interface Response {
  setHeader?: (name: string, value: string) => void;
  [key: string]: unknown;
}

export type NextFunction = (error?: Error) => void;

/**
 * Express middleware for request ID propagation
 * Extracts request ID from X-Request-ID header or generates a new one
 * Sets the request ID in the response header for client tracking
 *
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { requestIdMiddleware } from '@tjr/logger';
 *
 * const app = express();
 * app.use(requestIdMiddleware());
 *
 * app.get('/api/data', (req, res) => {
 *   const requestId = getRequestId();
 *   logger.info('Handling request', { request_id: requestId });
 *   res.json({ data: 'example' });
 * });
 * ```
 */
export function requestIdMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extract request ID from header or generate new one
    const existingId = req.headers?.['x-request-id'];
    const requestId =
      typeof existingId === 'string' ? existingId : generateRequestId();

    // Set response header for client tracking
    if (res.setHeader) {
      res.setHeader('X-Request-ID', requestId);
    }

    // Execute the rest of the request within the request context
    withRequestContext(() => next(), requestId).catch((error) => {
      next(error instanceof Error ? error : new Error(String(error)));
    });
  };
}

/**
 * Discord.js interaction handler wrapper with request context
 * Wraps a Discord command handler to automatically inject request context
 *
 * @param handler - Discord interaction handler function
 * @returns Wrapped handler with request context
 *
 * @example
 * ```typescript
 * import { SlashCommandBuilder } from 'discord.js';
 * import { withDiscordRequestContext } from '@tjr/logger';
 *
 * export const data = new SlashCommandBuilder()
 *   .setName('chart')
 *   .setDescription('Generate chart');
 *
 * export const execute = withDiscordRequestContext(async (interaction) => {
 *   const requestId = getRequestId();
 *   logger.info('Processing chart command', { request_id: requestId });
 *   await interaction.reply('Generating chart...');
 * });
 * ```
 */
export function withDiscordRequestContext<TInteraction, TResult>(
  handler: (interaction: TInteraction) => Promise<TResult>
): (interaction: TInteraction) => Promise<TResult> {
  return async (interaction: TInteraction): Promise<TResult> => {
    return withRequestContext(
      () => handler(interaction),
      generateRequestId(),
      {
        context: 'discord',
        interaction_type: getInteractionType(interaction),
      }
    );
  };
}

/**
 * Get interaction type for Discord interactions
 */
function getInteractionType(interaction: unknown): string {
  if (
    interaction &&
    typeof interaction === 'object' &&
    'constructor' in interaction &&
    interaction.constructor &&
    'name' in interaction.constructor
  ) {
    return String(interaction.constructor.name);
  }
  return 'unknown';
}

/**
 * Generic async function wrapper with request context
 * Useful for wrapping any async operation with automatic request ID
 *
 * @param fn - Async function to wrap
 * @param contextFields - Additional context fields
 * @returns Wrapped function with request context
 *
 * @example
 * ```typescript
 * const processData = withRequestContextWrapper(
 *   async (data: string) => {
 *     const requestId = getRequestId();
 *     logger.info('Processing', { request_id: requestId });
 *     return doWork(data);
 *   },
 *   { operation: 'process_data' }
 * );
 *
 * await processData('example');
 * ```
 */
export function withRequestContextWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  contextFields?: Record<string, unknown>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withRequestContext(
      () => fn(...args),
      generateRequestId(),
      contextFields
    );
  };
}

/**
 * Create a request context for CLI operations
 * Useful for CLI commands and scripts that need request tracking
 *
 * @param operation - Operation name (e.g., 'cli:chart', 'script:backfill')
 * @param args - Optional command arguments for context
 * @returns Function to execute code with request context
 *
 * @example
 * ```typescript
 * // In a CLI command
 * await withCLIRequestContext('cli:chart', { symbol: 'SPY' })(async () => {
 *   const requestId = getRequestId();
 *   logger.info('Starting chart generation', { request_id: requestId });
 *   await generateChart('SPY');
 * });
 * ```
 */
export function withCLIRequestContext(
  operation: string,
  args?: Record<string, unknown>
) {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return withRequestContext(() => fn(), generateRequestId(), {
      context: 'cli',
      operation,
      ...args,
    });
  };
}

/**
 * Create request context for background jobs
 * Useful for cron jobs, scheduled tasks, and background workers
 *
 * @param jobName - Job name (e.g., 'daily-backfill', 'cache-cleanup')
 * @param metadata - Optional job metadata
 * @returns Function to execute job with request context
 *
 * @example
 * ```typescript
 * // In a scheduled job
 * cron.schedule('0 0 * * *', () => {
 *   withJobRequestContext('daily-backfill', { schedule: 'daily' })(async () => {
 *     const requestId = getRequestId();
 *     logger.info('Starting daily backfill', { request_id: requestId });
 *     await backfillData();
 *   });
 * });
 * ```
 */
export function withJobRequestContext(
  jobName: string,
  metadata?: Record<string, unknown>
) {
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    return withRequestContext(() => fn(), generateRequestId(), {
      context: 'job',
      job_name: jobName,
      ...metadata,
    });
  };
}