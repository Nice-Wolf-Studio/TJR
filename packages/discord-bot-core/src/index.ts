/**
 * @tjr/discord-bot-core
 * Core Discord bot functionality with command schema and registrar
 */

// Export types
export * from './types/index.js';

// Export schemas
export * from './schemas/index.js';

// Export handlers
export { CommandHandler } from './handlers/CommandHandler.js';

// Export commands
export * from './commands/index.js';

// Re-export specific items for convenience
export { commands } from './commands/index.js';
export { schemas } from './schemas/index.js';