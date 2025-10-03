/**
 * Export all command schemas
 */

export { healthSchema, type HealthResponse } from './health.js';
export { dailySchema, type DailyReport } from './daily.js';
export { askSchema, type AskResponse } from './ask.js';

import { healthSchema } from './health.js';
import { dailySchema } from './daily.js';
import { askSchema } from './ask.js';
import type { CommandSchema } from '../types/index.js';

/**
 * All available command schemas
 */
export const schemas: CommandSchema[] = [healthSchema, dailySchema, askSchema];

/**
 * Get schema by name
 */
export function getSchema(name: string): CommandSchema | undefined {
  return schemas.find((schema) => schema.name === name);
}

/**
 * Get all schema names
 */
export function getSchemaNames(): string[] {
  return schemas.map((schema) => schema.name);
}
