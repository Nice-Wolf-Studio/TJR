/**
 * Environment-specific Discord bot profiles
 * Each environment can have different command configurations
 */

export type Environment = 'dev' | 'stage' | 'prod';

export interface ProfileConfig {
  /**
   * Environment name
   */
  environment: Environment;

  /**
   * Whether to register commands globally or to specific guilds
   */
  global: boolean;

  /**
   * Guild IDs for guild-specific registration (when global is false)
   */
  guildIds?: string[];

  /**
   * Commands to include in this environment
   */
  enabledCommands: string[];

  /**
   * Command-specific overrides for this environment
   */
  commandOverrides?: {
    [commandName: string]: {
      description?: string;
      dmPermission?: boolean;
      defaultMemberPermissions?: string | null;
    };
  };

  /**
   * Manifest file path for this environment
   */
  manifestPath: string;
}

/**
 * Default profile configurations
 */
export const profiles: Record<Environment, ProfileConfig> = {
  dev: {
    environment: 'dev',
    global: false,
    guildIds: [], // Will be populated from env vars
    enabledCommands: ['health', 'daily'], // All commands in dev
    manifestPath: './manifests/dev-manifest.json',
  },
  stage: {
    environment: 'stage',
    global: false,
    guildIds: [], // Will be populated from env vars
    enabledCommands: ['health', 'daily'], // All commands in stage
    manifestPath: './manifests/stage-manifest.json',
  },
  prod: {
    environment: 'prod',
    global: true, // Global registration in production
    enabledCommands: ['health', 'daily'], // Can be more selective in prod
    commandOverrides: {
      daily: {
        description: "Get today's trading session information",
      },
    },
    manifestPath: './manifests/prod-manifest.json',
  },
};

/**
 * Get profile configuration for an environment
 */
export function getProfile(env: string = 'dev'): ProfileConfig {
  const environment = env as Environment;

  if (!profiles[environment]) {
    throw new Error(
      `Unknown environment: ${env}. Valid environments are: ${Object.keys(profiles).join(', ')}`
    );
  }

  const profile = { ...profiles[environment] };

  // Load guild IDs from environment variables
  if (!profile.global && profile.guildIds?.length === 0) {
    const envGuildIds = process.env[`DISCORD_${environment.toUpperCase()}_GUILD_IDS`];
    if (envGuildIds) {
      profile.guildIds = envGuildIds.split(',').map((id) => id.trim());
    }
  }

  return profile;
}

/**
 * Validate that required environment variables are set for a profile
 */
export function validateProfileEnv(profile: ProfileConfig): string[] {
  const errors: string[] = [];
  const envPrefix = `DISCORD_${profile.environment.toUpperCase()}`;

  // Check for required base variables
  const requiredVars = [`${envPrefix}_TOKEN`, `${envPrefix}_APPLICATION_ID`];

  // Add guild IDs requirement for non-global deployments
  if (!profile.global) {
    requiredVars.push(`${envPrefix}_GUILD_IDS`);
  }

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      errors.push(`Missing required environment variable: ${varName}`);
    }
  }

  return errors;
}
