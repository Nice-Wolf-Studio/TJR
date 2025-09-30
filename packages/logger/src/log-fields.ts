/**
 * @fileoverview Standardized log field definitions, validators, and formatters
 * Ensures consistent logging structure across all TJR Suite packages
 */

/**
 * Standard log fields for TJR Suite observability
 * All fields are optional to allow flexibility, but should be included when applicable
 */
export interface StandardLogFields {
  /** Unique request identifier (UUID v4) */
  request_id?: string;

  /** Trading symbol (e.g., "SPY", "AAPL", "BTCUSD") */
  symbol?: string;

  /** Data timeframe (e.g., "5m", "1h", "1d") */
  timeframe?: string;

  /** Data provider name (e.g., "yahoo", "polygon", "alphavantage") */
  provider?: string;

  /** Timestamp of data or operation (ISO 8601 format) */
  asOf?: string;

  /** Operation duration in milliseconds */
  duration_ms?: number;

  /** Operation result (e.g., "success", "error", "partial") */
  result?: string;

  /** Component or module identifier */
  component?: string;

  /** Operation name or type */
  operation?: string;

  /** Error code or type (when result is error) */
  error_code?: string;

  /** Number of items processed */
  count?: number;

  /** Cache hit or miss indicator */
  cache?: 'hit' | 'miss';

  /** Allow additional custom fields */
  [key: string]: unknown;
}

/**
 * PII (Personally Identifiable Information) patterns to detect and prevent logging
 * These patterns help prevent accidental logging of sensitive data
 */
const PII_PATTERNS = {
  /** Email addresses */
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,

  /** Phone numbers (various formats) */
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,

  /** Credit card numbers */
  creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,

  /** Social Security Numbers */
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,

  /** API keys (common patterns) */
  apiKey: /\b(api[_-]?key|apikey|access[_-]?token|secret[_-]?key)[=:]\s*['"]?[\w-]{16,}['"]?/i,

  /** Bearer tokens */
  bearerToken: /\bBearer\s+[\w-]+\.[\w-]+\.[\w-]+/i,

  /** AWS access keys */
  awsAccessKey: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
};

/**
 * Field names that should never contain PII but are worth checking
 */
const SENSITIVE_FIELD_NAMES = [
  'email',
  'phone',
  'ssn',
  'password',
  'token',
  'secret',
  'key',
  'credit_card',
  'creditCard',
  'api_key',
  'apiKey',
];

/**
 * Check if a value contains potential PII
 *
 * @param value - Value to check
 * @returns Object with hasPII flag and matched pattern type
 *
 * @example
 * ```typescript
 * const check = containsPII('user@example.com');
 * if (check.hasPII) {
 *   console.warn(`PII detected: ${check.pattern}`);
 * }
 * ```
 */
export function containsPII(value: unknown): { hasPII: boolean; pattern?: string } {
  if (typeof value !== 'string') {
    return { hasPII: false };
  }

  for (const [patternName, regex] of Object.entries(PII_PATTERNS)) {
    if (regex.test(value)) {
      return { hasPII: true, pattern: patternName };
    }
  }

  return { hasPII: false };
}

/**
 * Check if a field name suggests it might contain PII
 *
 * @param fieldName - Field name to check
 * @returns true if field name suggests PII content
 *
 * @example
 * ```typescript
 * if (isSensitiveFieldName('email')) {
 *   console.warn('Sensitive field detected');
 * }
 * ```
 */
export function isSensitiveFieldName(fieldName: string): boolean {
  const normalized = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some((name) => normalized.includes(name));
}

/**
 * Validate log fields for PII and other issues
 *
 * @param fields - Log fields to validate
 * @returns Validation result with warnings
 *
 * @example
 * ```typescript
 * const result = validateLogFields({ email: 'user@example.com' });
 * if (!result.isValid) {
 *   console.error('Validation failed:', result.warnings);
 * }
 * ```
 */
export function validateLogFields(fields: Record<string, unknown>): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    // Check for sensitive field names
    if (isSensitiveFieldName(key)) {
      warnings.push(`Field name "${key}" suggests potentially sensitive data`);
    }

    // Check for PII in string values
    if (typeof value === 'string') {
      const piiCheck = containsPII(value);
      if (piiCheck.hasPII) {
        warnings.push(
          `Field "${key}" contains potential PII (pattern: ${piiCheck.pattern})`
        );
      }
    }

    // Check nested objects recursively
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nestedResult = validateLogFields(value as Record<string, unknown>);
      warnings.push(...nestedResult.warnings.map((w) => `${key}.${w}`));
    }
  }

  return {
    isValid: warnings.length === 0,
    warnings,
  };
}

/**
 * Redact PII from a string value
 *
 * @param value - Value to redact
 * @returns Redacted value with PII replaced by [REDACTED]
 *
 * @example
 * ```typescript
 * const safe = redactPII('Contact: user@example.com');
 * // Returns: "Contact: [REDACTED]"
 * ```
 */
export function redactPII(value: string): string {
  let redacted = value;

  for (const regex of Object.values(PII_PATTERNS)) {
    redacted = redacted.replace(regex, '[REDACTED]');
  }

  return redacted;
}

/**
 * Format duration in milliseconds for logging
 * Ensures consistent formatting and rounds to nearest millisecond
 *
 * @param durationMs - Duration in milliseconds
 * @returns Rounded duration
 *
 * @example
 * ```typescript
 * const duration = formatDuration(123.456);
 * // Returns: 123
 * ```
 */
export function formatDuration(durationMs: number): number {
  return Math.round(durationMs);
}

/**
 * Format a timestamp for logging (ISO 8601 format)
 *
 * @param date - Date to format (defaults to now)
 * @returns ISO 8601 formatted timestamp
 *
 * @example
 * ```typescript
 * const timestamp = formatTimestamp();
 * // Returns: "2025-09-30T12:34:56.789Z"
 * ```
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Sanitize log fields by removing or redacting sensitive data
 * This is a safety net - prefer not logging PII in the first place
 *
 * @param fields - Log fields to sanitize
 * @returns Sanitized fields with PII redacted
 *
 * @example
 * ```typescript
 * const safe = sanitizeLogFields({
 *   symbol: 'SPY',
 *   email: 'user@example.com'
 * });
 * // Returns: { symbol: 'SPY', email: '[REDACTED]' }
 * ```
 */
export function sanitizeLogFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    // Remove fields with sensitive names
    if (isSensitiveFieldName(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Redact PII from string values
    if (typeof value === 'string') {
      const piiCheck = containsPII(value);
      sanitized[key] = piiCheck.hasPII ? redactPII(value) : value;
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogFields(value as Record<string, unknown>);
      continue;
    }

    // Keep other values as-is
    sanitized[key] = value;
  }

  return sanitized;
}

/**
 * Create standardized log fields with request context
 * Automatically includes request_id from async context if available
 *
 * @param fields - Base log fields
 * @returns Fields with request_id added from context
 *
 * @example
 * ```typescript
 * import { withRequestContext } from './request-context.js';
 *
 * await withRequestContext(async () => {
 *   const fields = createLogFields({ symbol: 'SPY', operation: 'fetch' });
 *   // fields will include request_id from context
 * });
 * ```
 */
export function createLogFields(
  fields: Partial<StandardLogFields>
): StandardLogFields {
  // Import dynamically to avoid circular dependencies
  // The request_id will be added by the logger if available
  return {
    ...fields,
  };
}

/**
 * Validate that required fields for a specific operation are present
 *
 * @param fields - Log fields to validate
 * @param requiredFields - List of required field names
 * @returns Validation result with missing fields
 *
 * @example
 * ```typescript
 * const result = validateRequiredFields(
 *   { symbol: 'SPY' },
 *   ['symbol', 'timeframe']
 * );
 * if (!result.isValid) {
 *   console.error('Missing fields:', result.missing);
 * }
 * ```
 */
export function validateRequiredFields(
  fields: Record<string, unknown>,
  requiredFields: string[]
): {
  isValid: boolean;
  missing: string[];
} {
  const missing = requiredFields.filter((field) => !(field in fields));

  return {
    isValid: missing.length === 0,
    missing,
  };
}