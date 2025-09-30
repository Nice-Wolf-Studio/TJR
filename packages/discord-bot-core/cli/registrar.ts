#!/usr/bin/env node
/**
 * Command Registrar CLI
 * Handles registration of Discord slash commands with dry-run support
 */

import { Command } from 'commander';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { commands } from '../src/commands/index.js';
import { CommandHandler } from '../src/handlers/CommandHandler.js';
import { getProfile, validateProfileEnv } from '../src/config/profiles.js';
import type { DiffResult, CommandManifest } from '../src/types/index.js';

const program = new Command();

program
  .name('discord-registrar')
  .description('Register Discord slash commands with environment support')
  .version('0.1.0')
  .option('-e, --env <environment>', 'Environment to deploy to (dev, stage, prod)', 'dev')
  .option('-t, --token <token>', 'Discord bot token (overrides env-specific token)')
  .option('-a, --application-id <id>', 'Discord application ID (overrides env-specific ID)')
  .option('-g, --guild-id <id>', 'Guild ID for guild-specific commands (overrides profile)')
  .option('-d, --dry-run', 'Show what would be changed without making changes', false)
  .option('-f, --force', 'Force registration even if no changes detected', false)
  .option('-m, --manifest <path>', 'Path to save/load command manifest (overrides profile default)')
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--validate-only', 'Only validate environment configuration without registering', false)
  .parse(process.argv);

const options = program.opts();

/**
 * Load previous manifest if exists
 */
function loadPreviousManifest(path: string): CommandManifest | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(chalk.yellow(`⚠ Failed to load previous manifest: ${error}`));
    return null;
  }
}

/**
 * Calculate differences between manifests
 */
function calculateDiff(current: CommandManifest, previous: CommandManifest | null): DiffResult {
  const result: DiffResult = {
    toAdd: [],
    toUpdate: [],
    toRemove: [],
    unchanged: [],
  };

  if (!previous) {
    // All commands are new
    result.toAdd = current.commands;
    return result;
  }

  const currentMap = new Map(current.commands.map(cmd => [cmd.name, cmd]));
  const previousMap = new Map(previous.commands.map(cmd => [cmd.name, cmd]));

  // Check for new and updated commands
  for (const [name, cmd] of currentMap) {
    const prevCmd = previousMap.get(name);
    if (!prevCmd) {
      result.toAdd.push(cmd);
    } else {
      const currentJson = JSON.stringify(cmd);
      const prevJson = JSON.stringify(prevCmd);
      if (currentJson !== prevJson) {
        const changes: string[] = [];
        if (cmd.description !== prevCmd.description) changes.push('description');
        if (JSON.stringify(cmd.options) !== JSON.stringify(prevCmd.options)) changes.push('options');
        if (cmd.dmPermission !== prevCmd.dmPermission) changes.push('dmPermission');
        if (cmd.defaultMemberPermissions !== prevCmd.defaultMemberPermissions) changes.push('permissions');

        result.toUpdate.push({ name, changes });
      } else {
        result.unchanged.push(name);
      }
    }
  }

  // Check for removed commands
  for (const [name] of previousMap) {
    if (!currentMap.has(name)) {
      result.toRemove.push(name);
    }
  }

  return result;
}

/**
 * Display diff results
 */
function displayDiff(diff: DiffResult): void {
  console.log('\n' + chalk.bold('📊 Command Registration Diff:\n'));

  if (diff.toAdd.length > 0) {
    console.log(chalk.green.bold('➕ Commands to Add:'));
    diff.toAdd.forEach(cmd => {
      console.log(chalk.green(`   - ${cmd.name}: ${cmd.description}`));
    });
    console.log();
  }

  if (diff.toUpdate.length > 0) {
    console.log(chalk.yellow.bold('🔄 Commands to Update:'));
    diff.toUpdate.forEach(({ name, changes }) => {
      console.log(chalk.yellow(`   - ${name} (${changes.join(', ')})`));
    });
    console.log();
  }

  if (diff.toRemove.length > 0) {
    console.log(chalk.red.bold('➖ Commands to Remove:'));
    diff.toRemove.forEach(name => {
      console.log(chalk.red(`   - ${name}`));
    });
    console.log();
  }

  if (diff.unchanged.length > 0 && options.verbose) {
    console.log(chalk.gray.bold('✅ Unchanged Commands:'));
    diff.unchanged.forEach(name => {
      console.log(chalk.gray(`   - ${name}`));
    });
    console.log();
  }

  const totalChanges = diff.toAdd.length + diff.toUpdate.length + diff.toRemove.length;
  console.log(chalk.bold(`Total changes: ${totalChanges}\n`));
}

/**
 * Register commands with Discord
 */
async function registerCommands(): Promise<void> {
  console.log(chalk.bold.cyan('\n🤖 Discord Command Registrar\n'));

  // Get profile for the specified environment
  const profile = getProfile(options.env);
  console.log(chalk.bold(`Environment: ${chalk.cyan(profile.environment)}\n`));

  // Validate environment configuration
  const validationErrors = validateProfileEnv(profile);
  if (validationErrors.length > 0) {
    console.error(chalk.red('❌ Environment validation failed:\n'));
    validationErrors.forEach(error => {
      console.error(chalk.red(`   - ${error}`));
    });
    console.error(chalk.yellow('\nPlease ensure all required environment variables are set.'));
    process.exit(1);
  }

  if (options.validateOnly) {
    console.log(chalk.green('✅ Environment configuration is valid\n'));
    console.log(chalk.dim('Profile settings:'));
    console.log(chalk.dim(`  - Global: ${profile.global}`));
    console.log(chalk.dim(`  - Enabled commands: ${profile.enabledCommands.join(', ')}`));
    console.log(chalk.dim(`  - Manifest path: ${profile.manifestPath}`));
    if (profile.guildIds?.length) {
      console.log(chalk.dim(`  - Guild IDs: ${profile.guildIds.join(', ')}`));
    }
    return;
  }

  // Get credentials from environment-specific variables or overrides
  const envPrefix = `DISCORD_${profile.environment.toUpperCase()}`;
  const token = options.token || process.env[`${envPrefix}_TOKEN`];
  const applicationId = options.applicationId || process.env[`${envPrefix}_APPLICATION_ID`];
  const guildIds = options.guildId ? [options.guildId] : profile.guildIds;

  if (!token) {
    console.error(chalk.red(`❌ Discord bot token is required (--token or ${envPrefix}_TOKEN env)`));
    process.exit(1);
  }

  if (!applicationId) {
    console.error(chalk.red(`❌ Discord application ID is required (--application-id or ${envPrefix}_APPLICATION_ID env)`));
    process.exit(1);
  }

  // Initialize handler and register only enabled commands for this environment
  const handler = new CommandHandler({} as any);
  const enabledCommands = commands.filter(cmd => profile.enabledCommands.includes(cmd.schema.name));

  // Apply environment-specific overrides
  enabledCommands.forEach(cmd => {
    const overrides = profile.commandOverrides?.[cmd.schema.name];
    if (overrides) {
      const modifiedCmd = {
        ...cmd,
        schema: {
          ...cmd.schema,
          description: overrides.description || cmd.schema.description,
          dmPermission: overrides.dmPermission !== undefined ? overrides.dmPermission : cmd.schema.dmPermission,
          defaultMemberPermissions: overrides.defaultMemberPermissions !== undefined
            ? overrides.defaultMemberPermissions
            : cmd.schema.defaultMemberPermissions,
        }
      };
      handler.registerCommand(modifiedCmd);
    } else {
      handler.registerCommand(cmd);
    }
  });

  const manifest = handler.generateManifest();
  const manifestPath = options.manifest || profile.manifestPath;

  // Ensure manifest directory exists
  const manifestDir = dirname(manifestPath);
  if (!existsSync(manifestDir)) {
    mkdirSync(manifestDir, { recursive: true });
  }

  const previousManifest = loadPreviousManifest(manifestPath);

  // Calculate diff
  const diff = calculateDiff(manifest, previousManifest);

  // Display diff
  displayDiff(diff);

  // Check if any changes
  const hasChanges = diff.toAdd.length > 0 || diff.toUpdate.length > 0 || diff.toRemove.length > 0;

  if (!hasChanges && !options.force) {
    console.log(chalk.green('✅ No changes detected. Commands are up to date.\n'));
    if (!options.dryRun) {
      // Save manifest even if no changes
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(chalk.dim(`Manifest saved to ${manifestPath}\n`));
    }
    return;
  }

  if (options.dryRun) {
    console.log(chalk.yellow('🔍 DRY RUN MODE - No changes will be made\n'));
    console.log(chalk.dim('Run without --dry-run to apply these changes'));
    return;
  }

  // Perform actual registration
  console.log(chalk.cyan('🚀 Registering commands with Discord...\n'));

  const rest = new REST({ version: '10' }).setToken(token);
  const commandsJson = handler.toJSON();

  try {
    const startTime = Date.now();

    // Handle multiple guild deployments or single global deployment
    if (profile.global) {
      // Global deployment
      const route = Routes.applicationCommands(applicationId);
      const registeredCommands = await rest.put(route, { body: commandsJson }) as any[];
      const duration = Date.now() - startTime;

      console.log(chalk.green(`✅ Successfully registered ${registeredCommands.length} commands globally in ${duration}ms\n`));
    } else if (guildIds && guildIds.length > 0) {
      // Guild-specific deployment
      let totalRegistered = 0;
      for (const guildId of guildIds) {
        const route = Routes.applicationGuildCommands(applicationId, guildId);
        const registeredCommands = await rest.put(route, { body: commandsJson }) as any[];
        totalRegistered += registeredCommands.length;
        console.log(chalk.green(`✅ Registered ${registeredCommands.length} commands to guild ${guildId}`));
      }
      const duration = Date.now() - startTime;
      console.log(chalk.green(`\n✅ Successfully registered ${totalRegistered} total commands across ${guildIds.length} guild(s) in ${duration}ms\n`));
    } else {
      console.error(chalk.red('❌ No guild IDs specified for guild-specific deployment'));
      process.exit(1);
    }

    // Save manifest with environment metadata
    const manifestWithMetadata = {
      ...manifest,
      environment: profile.environment,
      deployedAt: new Date().toISOString(),
      global: profile.global,
      guildIds: profile.global ? undefined : guildIds,
    };
    writeFileSync(manifestPath, JSON.stringify(manifestWithMetadata, null, 2));
    console.log(chalk.dim(`Manifest saved to ${manifestPath}\n`));

    // List registered commands if verbose
    if (options.verbose) {
      console.log(chalk.bold('Registered Commands:'));
      enabledCommands.forEach((cmd: any) => {
        console.log(`  - /${cmd.schema.name}: ${cmd.schema.description}`);
      });
      console.log();
    }
  } catch (error) {
    console.error(chalk.red(`❌ Failed to register commands: ${error}`));
    process.exit(1);
  }
}

// Run the registrar
registerCommands().catch(error => {
  console.error(chalk.red(`❌ Unexpected error: ${error}`));
  process.exit(1);
});