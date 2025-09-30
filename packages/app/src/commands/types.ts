/**
 * Command types and interfaces
 */

/**
 * Base command interface
 */
export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  execute(args: string[], options: CommandOptions): Promise<CommandResult>;
}

/**
 * Command execution options
 */
export interface CommandOptions {
  dryRun?: boolean;
  verbose?: boolean;
  format?: 'json' | 'text' | 'table';
  [key: string]: any;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  output: any;
  error?: Error;
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Command registry interface
 */
export interface CommandRegistry {
  register(command: Command): void;
  get(name: string): Command | undefined;
  list(): Command[];
  execute(name: string, args: string[], options: CommandOptions): Promise<CommandResult>;
}