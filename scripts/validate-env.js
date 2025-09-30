#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * Validates that required environment variables are set and properly formatted
 * before deployment or local execution.
 *
 * Usage:
 *   node scripts/validate-env.js [--env=production|staging|development]
 *   npm run validate:env
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation errors found
 *   2 - Script execution error
 *
 * Related: ADR-0313-secrets-hardening, docs/security/secrets.md
 */

const fs = require('fs');
const path = require('path');

// Simple .env file parser (no external dependencies)
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');

  // Check if .env exists
  if (!fs.existsSync(envPath)) {
    console.log('Note: No .env file found. Checking system environment variables only.\n');
    return;
  }

  // Read and parse .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      // Only set if not already in environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// Load environment variables from .env file
loadEnvFile();

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

// Parse command line arguments
const args = process.argv.slice(2);
const envArg = args.find((arg) => arg.startsWith('--env='));
const targetEnv = envArg ? envArg.split('=')[1] : process.env.NODE_ENV || 'development';

console.log(`${colors.blue}=== Environment Variable Validation ===${colors.reset}`);
console.log(`Target environment: ${colors.magenta}${targetEnv}${colors.reset}\n`);

/**
 * Validates a single environment variable
 */
function validateSecret(validator) {
  const result = { valid: true, errors: [], warnings: [] };
  const value = process.env[validator.name];

  // Check if required variable is missing
  if (validator.required && !value) {
    result.valid = false;
    result.errors.push(`Missing required environment variable: ${validator.name}`);
    return result;
  }

  // Skip validation if optional and not set
  if (!value) {
    return result;
  }

  // Check for placeholder values in production
  const placeholderPatterns = [
    /your_.*_here/i,
    /replace.*with/i,
    /example/i,
    /placeholder/i,
    /dummy/i,
    /test_.*_key/i,
    /^abc123/i,
    /^xyz789/i,
  ];

  if (targetEnv === 'production') {
    for (const pattern of placeholderPatterns) {
      if (pattern.test(value)) {
        result.valid = false;
        result.errors.push(
          `${validator.name} contains placeholder value in production: "${value.substring(0, 20)}..."`
        );
        break;
      }
    }
  }

  // Validate format using regex pattern
  if (validator.pattern && !validator.pattern.test(value)) {
    result.valid = false;
    result.errors.push(
      `${validator.name} has invalid format. Expected: ${validator.formatDescription || validator.pattern.toString()}`
    );
  }

  // Validate length constraints
  if (validator.minLength && value.length < validator.minLength) {
    result.valid = false;
    result.errors.push(
      `${validator.name} is too short (${value.length} chars). Minimum: ${validator.minLength} chars`
    );
  }

  if (validator.maxLength && value.length > validator.maxLength) {
    result.valid = false;
    result.errors.push(
      `${validator.name} is too long (${value.length} chars). Maximum: ${validator.maxLength} chars`
    );
  }

  // Validate allowed values
  if (validator.allowedValues && !validator.allowedValues.includes(value)) {
    result.valid = false;
    result.errors.push(
      `${validator.name} has invalid value. Allowed: ${validator.allowedValues.join(', ')}`
    );
  }

  return result;
}

/**
 * Validates database connection string
 */
function validateDatabaseUrl() {
  const result = { valid: true, errors: [], warnings: [] };
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    result.errors.push('DATABASE_URL is not set');
    result.valid = false;
    return result;
  }

  // SQLite is OK for development
  if (dbUrl.startsWith('sqlite:')) {
    if (targetEnv === 'production') {
      result.warnings.push('Using SQLite in production is not recommended');
    }
    return result;
  }

  // Validate PostgreSQL connection string
  const pgPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/(.+)$/;
  const match = dbUrl.match(pgPattern);

  if (!match) {
    result.valid = false;
    result.errors.push(
      'DATABASE_URL has invalid format. Expected: postgresql://user:password@host:port/database'
    );
    return result;
  }

  const [, username, password, host, port, database] = match;

  // Validate password strength in production
  if (targetEnv === 'production') {
    if (password.length < 16) {
      result.warnings.push('Database password should be at least 16 characters in production');
    }

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      result.warnings.push(
        'Database password should contain uppercase, lowercase, and numbers in production'
      );
    }
  }

  // Check for localhost in production
  if (targetEnv === 'production' && (host === 'localhost' || host === '127.0.0.1')) {
    result.warnings.push('Database host is localhost in production environment');
  }

  return result;
}

/**
 * Validates Discord configuration for a specific environment
 */
function validateDiscordEnv(env) {
  const result = { valid: true, errors: [], warnings: [] };

  const token = process.env[`DISCORD_${env}_TOKEN`];
  const appId = process.env[`DISCORD_${env}_APPLICATION_ID`];
  const guildIds = process.env[`DISCORD_${env}_GUILD_IDS`];

  // Skip if Discord not configured for this environment
  if (!token && !appId) {
    return result;
  }

  // If one is set, both token and app ID should be set
  if (token && !appId) {
    result.warnings.push(`DISCORD_${env}_TOKEN is set but DISCORD_${env}_APPLICATION_ID is missing`);
  }

  if (!token && appId) {
    result.warnings.push(`DISCORD_${env}_APPLICATION_ID is set but DISCORD_${env}_TOKEN is missing`);
  }

  // Validate token format (Base64 with dots)
  if (token) {
    const tokenPattern = /^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{20,}$/;
    if (!tokenPattern.test(token)) {
      result.valid = false;
      result.errors.push(`DISCORD_${env}_TOKEN has invalid format`);
    }

    // Check length (typical range)
    if (token.length < 59 || token.length > 72) {
      result.warnings.push(`DISCORD_${env}_TOKEN length (${token.length}) is unusual (typically 59-72)`);
    }
  }

  // Validate application ID (snowflake)
  if (appId) {
    const snowflakePattern = /^\d{17,19}$/;
    if (!snowflakePattern.test(appId)) {
      result.valid = false;
      result.errors.push(
        `DISCORD_${env}_APPLICATION_ID has invalid format. Expected 18-19 digit number`
      );
    }
  }

  // Validate guild IDs (comma-separated snowflakes)
  if (guildIds) {
    const ids = guildIds.split(',').map((id) => id.trim());
    for (const id of ids) {
      if (!/^\d{17,19}$/.test(id)) {
        result.valid = false;
        result.errors.push(`DISCORD_${env}_GUILD_IDS contains invalid guild ID: ${id}`);
      }
    }
  }

  // Production should not have guild IDs (uses global registration)
  if (env === 'PROD' && guildIds) {
    result.warnings.push('DISCORD_PROD_GUILD_IDS is set but production should use global registration');
  }

  return result;
}

/**
 * Main validation function
 */
function validate() {
  let allValid = true;
  let totalErrors = 0;
  let totalWarnings = 0;

  const validators = [
    // Market data providers
    {
      name: 'ALPHAVANTAGE_API_KEY',
      required: false,
      pattern: /^[A-Za-z0-9]{8,32}$/,
      formatDescription: 'Alphanumeric string, 8-32 characters',
      minLength: 8,
      maxLength: 32,
    },
    {
      name: 'DATABENTO_API_KEY',
      required: false,
      pattern: /^db-[A-Za-z0-9-]{20,}$/,
      formatDescription: 'Format: db-<alphanumeric-with-hyphens>',
      minLength: 23,
    },
  ];

  // Validate basic secrets
  console.log(`${colors.blue}Validating API Keys...${colors.reset}`);
  for (const validator of validators) {
    const result = validateSecret(validator);
    if (!result.valid) {
      allValid = false;
      totalErrors += result.errors.length;
      for (const error of result.errors) {
        console.log(`${colors.red}✗ ${error}${colors.reset}`);
      }
    } else if (process.env[validator.name]) {
      console.log(`${colors.green}✓ ${validator.name} is valid${colors.reset}`);
    }

    totalWarnings += result.warnings.length;
    for (const warning of result.warnings) {
      console.log(`${colors.yellow}⚠ ${warning}${colors.reset}`);
    }
  }

  // Validate database
  console.log(`\n${colors.blue}Validating Database Configuration...${colors.reset}`);
  const dbResult = validateDatabaseUrl();
  if (!dbResult.valid) {
    allValid = false;
    totalErrors += dbResult.errors.length;
    for (const error of dbResult.errors) {
      console.log(`${colors.red}✗ ${error}${colors.reset}`);
    }
  } else {
    console.log(`${colors.green}✓ DATABASE_URL is valid${colors.reset}`);
  }

  totalWarnings += dbResult.warnings.length;
  for (const warning of dbResult.warnings) {
    console.log(`${colors.yellow}⚠ ${warning}${colors.reset}`);
  }

  // Validate Discord configuration
  console.log(`\n${colors.blue}Validating Discord Configuration...${colors.reset}`);
  const discordEnvs = ['DEV', 'STAGE', 'PROD'];

  for (const env of discordEnvs) {
    const result = validateDiscordEnv(env);

    if (!result.valid) {
      allValid = false;
      totalErrors += result.errors.length;
      for (const error of result.errors) {
        console.log(`${colors.red}✗ ${error}${colors.reset}`);
      }
    } else if (process.env[`DISCORD_${env}_TOKEN`]) {
      console.log(`${colors.green}✓ Discord ${env} configuration is valid${colors.reset}`);
    }

    totalWarnings += result.warnings.length;
    for (const warning of result.warnings) {
      console.log(`${colors.yellow}⚠ ${warning}${colors.reset}`);
    }
  }

  // Summary
  console.log(`\n${colors.blue}=== Validation Summary ===${colors.reset}`);
  console.log(`Total errors: ${totalErrors > 0 ? colors.red : colors.green}${totalErrors}${colors.reset}`);
  console.log(`Total warnings: ${totalWarnings > 0 ? colors.yellow : colors.green}${totalWarnings}${colors.reset}`);

  if (allValid && totalErrors === 0) {
    console.log(`\n${colors.green}✓ All validations passed!${colors.reset}`);
    return true;
  } else {
    console.log(`\n${colors.red}✗ Validation failed!${colors.reset}`);
    console.log(`\nSee ${colors.blue}docs/security/secrets.md${colors.reset} for guidance on fixing these issues.`);
    return false;
  }
}

// Run validation
try {
  const success = validate();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error(`${colors.red}Script execution error:${colors.reset}`, error);
  process.exit(2);
}