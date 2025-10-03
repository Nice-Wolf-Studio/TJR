/**
 * @fileoverview Custom Winston formats for TJR Logger
 * Includes PII redaction, field normalization, output formatting, and request ID injection.
 */

import { format } from 'winston';
import { getRequestId } from './request-context.js';

/**
 * Sensitive field patterns that should be redacted from logs.
 * Matches are case-insensitive to catch common variations.
 *
 * Examples of redacted fields:
 * - password, Password, PASSWORD, passwd, pwd
 * - api_key, apiKey, API_KEY, secret, token
 * - authorization, Authorization, auth, Auth
 * - private_key, privateKey, PRIVATE_KEY
 * - credit_card, creditCard, ssn, SSN
 */
const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /passwd/i,
  /pwd/i,
  /secret/i,
  /api[_-]?key/i,
  /apikey/i,
  /token/i,
  /authorization/i,
  /auth/i,
  /private[_-]?key/i,
  /privatekey/i,
  /credit[_-]?card/i,
  /creditcard/i,
  /ssn/i,
];

/**
 * Replacement value for redacted sensitive data.
 */
const REDACTED = '[REDACTED]';

/**
 * Recursively redacts sensitive fields from an object.
 *
 * @param obj - Object to redact (will be mutated)
 * @returns The redacted object
 *
 * @example
 * ```typescript
 * const data = { username: 'alice', password: 'secret123' };
 * redactSensitiveFields(data);
 * // Result: { username: 'alice', password: '[REDACTED]' }
 * ```
 */
function redactSensitiveFields(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item));
  }

  // Handle plain objects
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }

    // Check if field name matches any sensitive pattern
    const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      // Redact the field value
      obj[key] = REDACTED;
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      // Recursively redact nested objects
      obj[key] = redactSensitiveFields(obj[key]);
    }
  }

  return obj;
}

/**
 * Winston format that redacts sensitive fields from log metadata.
 * Should be applied early in the format chain to ensure PII is never logged.
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   format: format.combine(
 *     redactPII(),
 *     format.json()
 *   )
 * });
 *
 * logger.info('User login', { username: 'alice', password: 'secret' });
 * // Output: {"level":"info","message":"User login","username":"alice","password":"[REDACTED]"}
 * ```
 */
export const redactPII = format((info) => {
  // Clone the info object to avoid mutating the original
  const redacted = { ...info };

  // Redact all fields except core Winston fields
  const coreFields = ['level', 'message', 'timestamp', 'label'];

  for (const key in redacted) {
    if (!coreFields.includes(key) && typeof redacted[key] === 'object') {
      redacted[key] = redactSensitiveFields(redacted[key]);
    } else if (!coreFields.includes(key)) {
      // Check if the key itself is sensitive
      const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
      if (isSensitive) {
        redacted[key] = REDACTED;
      }
    }
  }

  return redacted;
});

/**
 * Winston format that adds standard TJR fields and timestamp.
 * Automatically injects request_id from AsyncLocalStorage context if available.
 *
 * @example
 * ```typescript
 * const logger = createLogger({
 *   format: format.combine(
 *     standardFields(),
 *     format.json()
 *   )
 * });
 * ```
 */
export const standardFields = format.combine(
  // Add timestamp in ISO 8601 format
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),

  // Add errors field for Error objects
  format.errors({ stack: true }),

  // Inject request_id from AsyncLocalStorage context
  format((info) => {
    const requestId = getRequestId();
    if (requestId && !info['request_id']) {
      info['request_id'] = requestId;
    }
    return info;
  })()
);

/**
 * Winston format for human-readable pretty-print output.
 * Suitable for development environments and console debugging.
 *
 * @example
 * ```typescript
 * // Output format:
 * // [2025-09-29T12:34:56.789Z] info: User logged in symbol=AAPL request_id=req-123
 * ```
 */
export const prettyPrint = format.combine(
  format.colorize(),
  format.printf((info) => {
    const { timestamp, level, message, component, symbol, timeframe, request_id, ...rest } = info;

    // Build context string from structured fields
    const context: string[] = [];
    if (component) context.push(`component=${component}`);
    if (symbol) context.push(`symbol=${symbol}`);
    if (timeframe) context.push(`timeframe=${timeframe}`);
    if (request_id) context.push(`request_id=${request_id}`);

    // Add any additional fields
    for (const [key, value] of Object.entries(rest)) {
      // Skip internal Winston fields
      if (['level', 'message', 'timestamp', 'stack', 'splat'].includes(key)) {
        continue;
      }
      context.push(`${key}=${JSON.stringify(value)}`);
    }

    const contextStr = context.length > 0 ? ` ${context.join(' ')}` : '';
    const baseMsg = `[${timestamp}] ${level}: ${message}${contextStr}`;

    // Add stack trace if present (for errors)
    if (info['stack']) {
      return `${baseMsg}\n${info['stack']}`;
    }

    return baseMsg;
  })
);
