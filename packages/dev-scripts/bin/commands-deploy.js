#!/usr/bin/env node

/**
 * Discord Commands Deployment Tool
 * Provides diff, validate, and apply operations for Discord command deployment across environments
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Command } = require('commander');

const program = new Command();

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Utility functions for colored output
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.error(`${colors.red}✗${colors.reset} ${msg}`),
  heading: (msg) => console.log(`\n${colors.bright}${msg}${colors.reset}\n`),
};

program
  .name('commands-deploy')
  .description('Deploy Discord commands across environments')
  .version('0.1.0');

program
  .command('diff')
  .description('Show differences between current and deployed commands')
  .option('-e, --env <environment>', 'Target environment (dev, stage, prod)', 'dev')
  .option('--json', 'Output diff in JSON format', false)
  .action(async (options) => {
    try {
      log.heading(`Discord Commands Diff - ${options.env.toUpperCase()}`);

      const registrarPath = path.join(__dirname, '../../discord-bot-core/dist/cli/registrar.js');

      // Run registrar in dry-run mode
      const cmd = `node ${registrarPath} --env ${options.env} --dry-run`;
      const output = execSync(cmd, {
        encoding: 'utf-8',
        stdio: options.json ? 'pipe' : 'inherit',
      });

      if (options.json) {
        // Parse output and extract diff information
        const lines = output.split('\n');
        const diff = {
          environment: options.env,
          toAdd: [],
          toUpdate: [],
          toRemove: [],
          unchanged: [],
        };

        let currentSection = null;
        lines.forEach((line) => {
          if (line.includes('Commands to Add:')) currentSection = 'toAdd';
          else if (line.includes('Commands to Update:')) currentSection = 'toUpdate';
          else if (line.includes('Commands to Remove:')) currentSection = 'toRemove';
          else if (line.includes('Unchanged Commands:')) currentSection = 'unchanged';
          else if (currentSection && line.trim().startsWith('-')) {
            const command = line.trim().substring(1).trim();
            diff[currentSection].push(command);
          }
        });

        console.log(JSON.stringify(diff, null, 2));
      }

      log.success('Diff completed successfully');
    } catch (error) {
      log.error(`Failed to generate diff: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate environment configuration without deploying')
  .option('-e, --env <environment>', 'Target environment (dev, stage, prod)', 'dev')
  .option('-v, --verbose', 'Show detailed validation output', false)
  .action(async (options) => {
    try {
      log.heading(`Validating ${options.env.toUpperCase()} Environment`);

      const registrarPath = path.join(__dirname, '../../discord-bot-core/dist/cli/registrar.js');

      // Run registrar in validate-only mode
      const cmd = `node ${registrarPath} --env ${options.env} --validate-only`;
      execSync(cmd, {
        encoding: 'utf-8',
        stdio: 'inherit',
      });

      // Check for required environment variables
      const envPrefix = `DISCORD_${options.env.toUpperCase()}`;
      const requiredVars = [`${envPrefix}_TOKEN`, `${envPrefix}_APPLICATION_ID`];

      if (options.env !== 'prod') {
        requiredVars.push(`${envPrefix}_GUILD_IDS`);
      }

      log.info('Checking environment variables...');
      const missing = [];
      const present = [];

      requiredVars.forEach((varName) => {
        if (process.env[varName]) {
          present.push(varName);
          if (options.verbose) {
            log.success(`${varName} is set`);
          }
        } else {
          missing.push(varName);
          log.warn(`${varName} is not set`);
        }
      });

      if (missing.length > 0) {
        log.error('Validation failed: Missing required environment variables');
        process.exit(1);
      }

      log.success(`Environment ${options.env} is properly configured`);
    } catch (error) {
      log.error(`Validation failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('apply')
  .description('Apply command changes to Discord')
  .option('-e, --env <environment>', 'Target environment (dev, stage, prod)', 'dev')
  .option('-f, --force', 'Force deployment even if no changes detected', false)
  .option('--no-backup', 'Skip manifest backup', false)
  .action(async (options) => {
    try {
      log.heading(`Deploying to ${options.env.toUpperCase()}`);

      const registrarPath = path.join(__dirname, '../../discord-bot-core/dist/cli/registrar.js');

      // Create backup of current manifest if it exists
      if (options.backup) {
        const manifestPath = `./manifests/${options.env}-manifest.json`;
        if (fs.existsSync(manifestPath)) {
          const backupPath = `./manifests/${options.env}-manifest.backup.${Date.now()}.json`;
          fs.copyFileSync(manifestPath, backupPath);
          log.info(`Backed up current manifest to ${backupPath}`);
        }
      }

      // Run registrar to apply changes
      const forceFlag = options.force ? '--force' : '';
      const cmd = `node ${registrarPath} --env ${options.env} ${forceFlag}`;

      log.info('Applying changes to Discord...');
      execSync(cmd, {
        encoding: 'utf-8',
        stdio: 'inherit',
      });

      log.success(`Successfully deployed to ${options.env}`);
    } catch (error) {
      log.error(`Deployment failed: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show current deployment status for an environment')
  .option('-e, --env <environment>', 'Target environment (dev, stage, prod)', 'dev')
  .action(async (options) => {
    try {
      log.heading(`Deployment Status - ${options.env.toUpperCase()}`);

      const manifestPath = `./manifests/${options.env}-manifest.json`;

      if (!fs.existsSync(manifestPath)) {
        log.warn(`No manifest found for ${options.env} environment`);
        log.info('Run "commands-deploy apply" to create initial deployment');
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      log.info(`Environment: ${manifest.environment || options.env}`);
      log.info(`Last deployed: ${manifest.deployedAt || 'Unknown'}`);
      log.info(`Deployment type: ${manifest.global ? 'Global' : 'Guild-specific'}`);

      if (manifest.guildIds?.length > 0) {
        log.info(`Guild IDs: ${manifest.guildIds.join(', ')}`);
      }

      if (manifest.commands?.length > 0) {
        log.info(`\nDeployed commands (${manifest.commands.length}):`);
        manifest.commands.forEach((cmd) => {
          console.log(`  • /${cmd.name} - ${cmd.description}`);
        });
      }

      log.success('Status check completed');
    } catch (error) {
      log.error(`Failed to get status: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback to a previous manifest')
  .option('-e, --env <environment>', 'Target environment (dev, stage, prod)', 'dev')
  .option('-b, --backup <file>', 'Specific backup file to restore')
  .action(async (options) => {
    try {
      log.heading(`Rollback - ${options.env.toUpperCase()}`);

      const manifestDir = './manifests';
      let backupFile = options.backup;

      if (!backupFile) {
        // Find most recent backup
        const files = fs.readdirSync(manifestDir);
        const backups = files
          .filter((f) => f.startsWith(`${options.env}-manifest.backup.`))
          .sort()
          .reverse();

        if (backups.length === 0) {
          log.error(`No backups found for ${options.env} environment`);
          process.exit(1);
        }

        backupFile = backups[0];
        log.info(`Using most recent backup: ${backupFile}`);
      }

      const backupPath = path.join(manifestDir, backupFile);
      const manifestPath = path.join(manifestDir, `${options.env}-manifest.json`);

      if (!fs.existsSync(backupPath)) {
        log.error(`Backup file not found: ${backupPath}`);
        process.exit(1);
      }

      // Restore backup
      fs.copyFileSync(backupPath, manifestPath);
      log.success(`Restored manifest from ${backupFile}`);

      // Apply the restored manifest
      log.info('Applying restored configuration...');
      const registrarPath = path.join(__dirname, '../../discord-bot-core/dist/cli/registrar.js');
      const cmd = `node ${registrarPath} --env ${options.env} --force`;

      execSync(cmd, {
        encoding: 'utf-8',
        stdio: 'inherit',
      });

      log.success('Rollback completed successfully');
    } catch (error) {
      log.error(`Rollback failed: ${error.message}`);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
