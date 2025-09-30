#!/usr/bin/env node
/**
 * Command Registrar CLI
 * Handles registration of Discord slash commands with dry-run support
 */

import { Command } from 'commander';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord.js';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { commands } from '../src/commands/index.js';
import { CommandHandler } from '../src/handlers/CommandHandler.js';
import type { DiffResult, CommandManifest } from '../src/types/index.js';

const program = new Command();

program
  .name('discord-registrar')
  .description('Register Discord slash commands')
  .version('0.1.0')
  .option('-t, --token <token>', 'Discord bot token (or use DISCORD_TOKEN env)')
  .option('-a, --application-id <id>', 'Discord application ID (or use DISCORD_APPLICATION_ID env)')
  .option('-g, --guild-id <id>', 'Guild ID for guild-specific commands (optional)')
  .option('-d, --dry-run', 'Show what would be changed without making changes', false)
  .option('-f, --force', 'Force registration even if no changes detected', false)
  .option('-m, --manifest <path>', 'Path to save/load command manifest', './command-manifest.json')
  .option('-v, --verbose', 'Show detailed output', false)
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
  const token = options.token || process.env.DISCORD_TOKEN;
  const applicationId = options.applicationId || process.env.DISCORD_APPLICATION_ID;
  const guildId = options.guildId || process.env.DISCORD_GUILD_ID;

  if (!token) {
    console.error(chalk.red('❌ Discord bot token is required (--token or DISCORD_TOKEN env)'));
    process.exit(1);
  }

  if (!applicationId) {
    console.error(chalk.red('❌ Discord application ID is required (--application-id or DISCORD_APPLICATION_ID env)'));
    process.exit(1);
  }

  console.log(chalk.bold.cyan('\n🤖 Discord Command Registrar\n'));

  // Initialize handler and generate manifest
  const handler = new CommandHandler({} as any);
  commands.forEach(cmd => handler.registerCommand(cmd));

  const manifest = handler.generateManifest();
  const previousManifest = loadPreviousManifest(options.manifest);

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
      writeFileSync(options.manifest, JSON.stringify(manifest, null, 2));
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

    const route = guildId
      ? Routes.applicationGuildCommands(applicationId, guildId)
      : Routes.applicationCommands(applicationId);

    const registeredCommands = await rest.put(route, { body: commandsJson }) as any[];

    const duration = Date.now() - startTime;

    console.log(chalk.green(`✅ Successfully registered ${registeredCommands.length} commands in ${duration}ms\n`));

    // Save manifest
    writeFileSync(options.manifest, JSON.stringify(manifest, null, 2));
    console.log(chalk.dim(`Manifest saved to ${options.manifest}\n`));

    // List registered commands if verbose
    if (options.verbose) {
      console.log(chalk.bold('Registered Commands:'));
      registeredCommands.forEach((cmd: any) => {
        console.log(`  - /${cmd.name}: ${cmd.description}`);
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