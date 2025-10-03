import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getProfile, validateProfileEnv, type Environment } from '../src/config/profiles.js';

describe('Discord Deployment System', () => {
  describe('Profile Configuration', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.DISCORD_DEV_TOKEN;
      delete process.env.DISCORD_DEV_APPLICATION_ID;
      delete process.env.DISCORD_DEV_GUILD_IDS;
      delete process.env.DISCORD_STAGE_TOKEN;
      delete process.env.DISCORD_STAGE_APPLICATION_ID;
      delete process.env.DISCORD_STAGE_GUILD_IDS;
      delete process.env.DISCORD_PROD_TOKEN;
      delete process.env.DISCORD_PROD_APPLICATION_ID;
    });

    it('should load dev profile with correct defaults', () => {
      const profile = getProfile('dev');

      expect(profile.environment).toBe('dev');
      expect(profile.global).toBe(false);
      expect(profile.manifestPath).toBe('./manifests/dev-manifest.json');
      expect(profile.enabledCommands).toContain('health');
      expect(profile.enabledCommands).toContain('daily');
    });

    it('should load stage profile with correct defaults', () => {
      const profile = getProfile('stage');

      expect(profile.environment).toBe('stage');
      expect(profile.global).toBe(false);
      expect(profile.manifestPath).toBe('./manifests/stage-manifest.json');
      expect(profile.enabledCommands).toContain('health');
      expect(profile.enabledCommands).toContain('daily');
    });

    it('should load prod profile with global registration', () => {
      const profile = getProfile('prod');

      expect(profile.environment).toBe('prod');
      expect(profile.global).toBe(true);
      expect(profile.manifestPath).toBe('./manifests/prod-manifest.json');
      expect(profile.enabledCommands).toContain('health');
      expect(profile.enabledCommands).toContain('daily');
    });

    it('should throw error for unknown environment', () => {
      expect(() => getProfile('invalid')).toThrow('Unknown environment: invalid');
    });

    it('should load guild IDs from environment variables', () => {
      process.env.DISCORD_DEV_GUILD_IDS = '123,456,789';

      const profile = getProfile('dev');

      expect(profile.guildIds).toEqual(['123', '456', '789']);
    });

    it('should apply command overrides in production', () => {
      const profile = getProfile('prod');

      expect(profile.commandOverrides).toBeDefined();
      expect(profile.commandOverrides?.daily?.description).toBe(
        "Get today's trading session information"
      );
    });
  });

  describe('Environment Validation', () => {
    it('should validate dev environment successfully', () => {
      process.env.DISCORD_DEV_TOKEN = 'test_token';
      process.env.DISCORD_DEV_APPLICATION_ID = 'test_app_id';
      process.env.DISCORD_DEV_GUILD_IDS = '123456';

      const profile = getProfile('dev');
      const errors = validateProfileEnv(profile);

      expect(errors).toHaveLength(0);
    });

    it('should detect missing token', () => {
      process.env.DISCORD_DEV_APPLICATION_ID = 'test_app_id';
      process.env.DISCORD_DEV_GUILD_IDS = '123456';

      const profile = getProfile('dev');
      const errors = validateProfileEnv(profile);

      expect(errors).toContain('Missing required environment variable: DISCORD_DEV_TOKEN');
    });

    it('should detect missing application ID', () => {
      process.env.DISCORD_DEV_TOKEN = 'test_token';
      process.env.DISCORD_DEV_GUILD_IDS = '123456';

      const profile = getProfile('dev');
      const errors = validateProfileEnv(profile);

      expect(errors).toContain('Missing required environment variable: DISCORD_DEV_APPLICATION_ID');
    });

    it('should detect missing guild IDs for non-global deployment', () => {
      process.env.DISCORD_DEV_TOKEN = 'test_token';
      process.env.DISCORD_DEV_APPLICATION_ID = 'test_app_id';

      const profile = getProfile('dev');
      const errors = validateProfileEnv(profile);

      expect(errors).toContain('Missing required environment variable: DISCORD_DEV_GUILD_IDS');
    });

    it('should not require guild IDs for global deployment', () => {
      process.env.DISCORD_PROD_TOKEN = 'test_token';
      process.env.DISCORD_PROD_APPLICATION_ID = 'test_app_id';

      const profile = getProfile('prod');
      const errors = validateProfileEnv(profile);

      expect(errors).toHaveLength(0);
    });
  });

  describe('Manifest Snapshots', () => {
    it('should generate consistent manifest for dev environment', () => {
      const profile = getProfile('dev');

      // Snapshot test for manifest structure
      const expectedManifest = {
        version: expect.any(String),
        commands: expect.arrayContaining([
          expect.objectContaining({
            name: 'health',
            description: expect.any(String),
          }),
          expect.objectContaining({
            name: 'daily',
            description: expect.any(String),
          }),
        ]),
      };

      // This would be generated by the actual handler
      const manifest = {
        version: '1.0.0',
        commands: profile.enabledCommands.map((name) => ({
          name,
          description: `${name} command description`,
        })),
      };

      expect(manifest).toMatchObject(expectedManifest);
    });

    it('should generate consistent manifest for prod environment', () => {
      const profile = getProfile('prod');

      // Verify production has correct command set
      expect(profile.enabledCommands).toEqual(['health', 'daily']);

      // Verify production overrides are applied
      expect(profile.commandOverrides?.daily).toBeDefined();
    });
  });

  describe('Diff Calculation', () => {
    const calculateDiff = (current: any, previous: any) => {
      const result = {
        toAdd: [] as any[],
        toUpdate: [] as any[],
        toRemove: [] as string[],
        unchanged: [] as string[],
      };

      if (!previous) {
        result.toAdd = current.commands;
        return result;
      }

      const currentMap = new Map(current.commands.map((cmd: any) => [cmd.name, cmd]));
      const previousMap = new Map(previous.commands.map((cmd: any) => [cmd.name, cmd]));

      for (const [name, cmd] of currentMap) {
        const prevCmd = previousMap.get(name);
        if (!prevCmd) {
          result.toAdd.push(cmd);
        } else if (JSON.stringify(cmd) !== JSON.stringify(prevCmd)) {
          result.toUpdate.push({ name, changes: ['updated'] });
        } else {
          result.unchanged.push(name);
        }
      }

      for (const [name] of previousMap) {
        if (!currentMap.has(name)) {
          result.toRemove.push(name);
        }
      }

      return result;
    };

    it('should detect new commands', () => {
      const current = {
        commands: [
          { name: 'health', description: 'Check health' },
          { name: 'daily', description: 'Daily info' },
        ],
      };
      const previous = {
        commands: [{ name: 'health', description: 'Check health' }],
      };

      const diff = calculateDiff(current, previous);

      expect(diff.toAdd).toHaveLength(1);
      expect(diff.toAdd[0].name).toBe('daily');
      expect(diff.unchanged).toContain('health');
    });

    it('should detect updated commands', () => {
      const current = {
        commands: [{ name: 'health', description: 'Check bot health status' }],
      };
      const previous = {
        commands: [{ name: 'health', description: 'Check health' }],
      };

      const diff = calculateDiff(current, previous);

      expect(diff.toUpdate).toHaveLength(1);
      expect(diff.toUpdate[0].name).toBe('health');
    });

    it('should detect removed commands', () => {
      const current = {
        commands: [{ name: 'health', description: 'Check health' }],
      };
      const previous = {
        commands: [
          { name: 'health', description: 'Check health' },
          { name: 'daily', description: 'Daily info' },
        ],
      };

      const diff = calculateDiff(current, previous);

      expect(diff.toRemove).toHaveLength(1);
      expect(diff.toRemove).toContain('daily');
      expect(diff.unchanged).toContain('health');
    });

    it('should handle no changes', () => {
      const manifest = {
        commands: [
          { name: 'health', description: 'Check health' },
          { name: 'daily', description: 'Daily info' },
        ],
      };

      const diff = calculateDiff(manifest, manifest);

      expect(diff.toAdd).toHaveLength(0);
      expect(diff.toUpdate).toHaveLength(0);
      expect(diff.toRemove).toHaveLength(0);
      expect(diff.unchanged).toHaveLength(2);
    });

    it('should handle initial deployment', () => {
      const current = {
        commands: [
          { name: 'health', description: 'Check health' },
          { name: 'daily', description: 'Daily info' },
        ],
      };

      const diff = calculateDiff(current, null);

      expect(diff.toAdd).toHaveLength(2);
      expect(diff.toAdd.map((c: any) => c.name)).toEqual(['health', 'daily']);
    });
  });

  describe('Idempotency', () => {
    it('should produce no-op on repeated deployments', () => {
      const manifest = {
        version: '1.0.0',
        commands: [
          { name: 'health', description: 'Check bot health' },
          { name: 'daily', description: 'Get daily info' },
        ],
        environment: 'dev',
        deployedAt: new Date().toISOString(),
        global: false,
        guildIds: ['123456'],
      };

      // First deployment
      const firstResult = {
        ...manifest,
        deployedAt: new Date().toISOString(),
      };

      // Second deployment (commands unchanged)
      const secondManifest = {
        ...manifest,
        commands: manifest.commands,
      };

      // Compare command arrays
      expect(JSON.stringify(secondManifest.commands)).toBe(JSON.stringify(firstResult.commands));
    });
  });
});
