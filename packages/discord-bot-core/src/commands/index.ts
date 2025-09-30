/**
 * Export all commands
 */

export { healthCommand, healthHandler } from './health.js';
export { dailyCommand, dailyHandler } from './daily.js';

import { healthCommand } from './health.js';
import { dailyCommand } from './daily.js';
import type { Command } from '../types/index.js';

/**
 * All available commands
 */
export const commands: Command[] = [
  healthCommand,
  dailyCommand,
];

/**
 * Get command by name
 */
export function getCommand(name: string): Command | undefined {
  return commands.find(cmd => cmd.schema.name === name);
}

/**
 * Get all command names
 */
export function getCommandNames(): string[] {
  return commands.map(cmd => cmd.schema.name);
}