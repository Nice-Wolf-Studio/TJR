/**
 * @fileoverview Request context management using AsyncLocalStorage
 * Provides request ID generation and propagation through async operations
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Request context structure
 */
export interface RequestContext {
  /** Unique request identifier (UUID v4) */
  request_id: string;

  /** Optional additional context fields */
  [key: string]: unknown;
}

/**
 * AsyncLocalStorage instance for maintaining request context
 * across async operations without explicit parameter passing
 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Generate a new unique request ID (UUID v4 format)
 *
 * @returns A new UUID v4 string
 *
 * @example
 * ```typescript
 * const id = generateRequestId();
 * // Returns: "550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Get the current request context from AsyncLocalStorage
 *
 * @returns The current request context, or undefined if not in a request context
 *
 * @example
 * ```typescript
 * const context = getRequestContext();
 * if (context) {
 *   console.log('Current request:', context.request_id);
 * }
 * ```
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current request ID from the active context
 *
 * @returns The current request ID, or undefined if not in a request context
 *
 * @example
 * ```typescript
 * const requestId = getRequestId();
 * logger.info('Processing', { request_id: requestId });
 * ```
 */
export function getRequestId(): string | undefined {
  const context = requestContextStorage.getStore();
  return context?.request_id;
}

/**
 * Execute a function within a new request context
 * The request ID will be automatically propagated through all async operations
 *
 * @param fn - Function to execute within the request context
 * @param requestId - Optional request ID to use (generates new one if not provided)
 * @param additionalContext - Optional additional context fields
 * @returns Promise resolving to the function's return value
 *
 * @example
 * ```typescript
 * // With auto-generated request ID
 * await withRequestContext(async () => {
 *   const id = getRequestId();
 *   logger.info('Processing', { request_id: id });
 * });
 *
 * // With custom request ID
 * await withRequestContext(
 *   async () => {
 *     // Process request
 *   },
 *   'custom-request-id-123'
 * );
 *
 * // With additional context
 * await withRequestContext(
 *   async () => {
 *     // Process request
 *   },
 *   undefined,
 *   { userId: '123', operation: 'fetch' }
 * );
 * ```
 */
export async function withRequestContext<T>(
  fn: () => Promise<T> | T,
  requestId?: string,
  additionalContext?: Record<string, unknown>
): Promise<T> {
  const context: RequestContext = {
    request_id: requestId || generateRequestId(),
    ...additionalContext,
  };

  return requestContextStorage.run(context, fn);
}

/**
 * Execute a synchronous function within a new request context
 * Similar to withRequestContext but for synchronous operations
 *
 * @param fn - Synchronous function to execute
 * @param requestId - Optional request ID to use (generates new one if not provided)
 * @param additionalContext - Optional additional context fields
 * @returns The function's return value
 *
 * @example
 * ```typescript
 * const result = withRequestContextSync(() => {
 *   const id = getRequestId();
 *   return processData(id);
 * });
 * ```
 */
export function withRequestContextSync<T>(
  fn: () => T,
  requestId?: string,
  additionalContext?: Record<string, unknown>
): T {
  const context: RequestContext = {
    request_id: requestId || generateRequestId(),
    ...additionalContext,
  };

  return requestContextStorage.run(context, fn);
}

/**
 * Set additional context fields in the current request context
 * Useful for adding metadata during request processing
 *
 * @param fields - Additional fields to merge into the context
 * @returns true if context was updated, false if not in a request context
 *
 * @example
 * ```typescript
 * await withRequestContext(async () => {
 *   setRequestContext({ userId: '123', symbol: 'SPY' });
 *   // Context now includes these fields
 * });
 * ```
 */
export function setRequestContext(fields: Record<string, unknown>): boolean {
  const context = requestContextStorage.getStore();
  if (!context) {
    return false;
  }

  Object.assign(context, fields);
  return true;
}