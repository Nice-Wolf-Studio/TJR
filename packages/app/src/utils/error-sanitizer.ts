/**
 * Error sanitization utilities for safe logging
 */

/**
 * Sanitizes error objects before logging to prevent sensitive information exposure
 * In production, only includes message, name, and optional stack trace
 * In development, includes full error details
 */
export function sanitizeError(error: unknown, includeStack = false): Record<string, any> {
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  if (error instanceof Error) {
    const sanitized: Record<string, any> = {
      message: error.message,
      name: error.name,
    };

    // Only include stack traces in development or when explicitly requested
    if ((isDevelopment || includeStack) && 'stack' in error) {
      sanitized['stack'] = error['stack'];
    }

    return sanitized;
  }

  // For non-Error objects, convert to string safely
  return {
    message: String(error),
    name: 'Unknown',
  };
}
