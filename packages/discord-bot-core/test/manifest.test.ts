/**
 * Manifest generation snapshot tests
 */

import { describe, it, expect } from 'vitest';
import { CommandHandler } from '../src/handlers/CommandHandler.js';
import { commands } from '../src/commands/index.js';

describe('Command Manifest Generation', () => {
  it('should generate a deterministic manifest', () => {
    const handler = new CommandHandler({} as any);
    commands.forEach((cmd) => handler.registerCommand(cmd));

    const manifest = handler.generateManifest();

    // Check structure
    expect(manifest).toHaveProperty('version');
    expect(manifest).toHaveProperty('generatedAt');
    expect(manifest).toHaveProperty('commands');
    expect(manifest).toHaveProperty('hash');

    // Verify commands
    expect(manifest.commands).toHaveLength(2);
    expect(manifest.commands.map((c: any) => c.name)).toEqual(['health', 'daily']);
  });

  it('should generate consistent hash for same commands', () => {
    const handler1 = new CommandHandler({} as any);
    const handler2 = new CommandHandler({} as any);

    commands.forEach((cmd) => {
      handler1.registerCommand(cmd);
      handler2.registerCommand(cmd);
    });

    const manifest1 = handler1.generateManifest();
    const manifest2 = handler2.generateManifest();

    // Hash should be the same for identical commands
    expect(manifest1.hash).toBe(manifest2.hash);
  });

  it('should match snapshot for health command', () => {
    const healthCommand = commands.find((cmd) => cmd.schema.name === 'health');
    expect(healthCommand?.schema).toMatchInlineSnapshot(`
      {
        "description": "Check bot health and status",
        "dmPermission": true,
        "name": "health",
        "options": [
          {
            "description": "Show detailed health information",
            "name": "detailed",
            "required": false,
            "type": 5,
          },
        ],
      }
    `);
  });

  it('should match snapshot for daily command', () => {
    const dailyCommand = commands.find((cmd) => cmd.schema.name === 'daily');
    expect(dailyCommand?.schema).toMatchInlineSnapshot(`
      {
        "description": "Get daily trading report and analysis",
        "dmPermission": false,
        "name": "daily",
        "options": [
          {
            "choices": [
              {
                "name": "Summary",
                "value": "summary",
              },
              {
                "name": "Performance",
                "value": "performance",
              },
              {
                "name": "Risk Analysis",
                "value": "risk",
              },
              {
                "name": "Full Report",
                "value": "full",
              },
            ],
            "description": "Type of daily report",
            "name": "type",
            "required": false,
            "type": 3,
          },
          {
            "description": "Date for report (YYYY-MM-DD)",
            "maxLength": 10,
            "minLength": 10,
            "name": "date",
            "required": false,
            "type": 3,
          },
          {
            "description": "Export report as file",
            "name": "export",
            "required": false,
            "type": 5,
          },
        ],
      }
    `);
  });

  it('should generate valid Discord command JSON', () => {
    const handler = new CommandHandler({} as any);
    commands.forEach((cmd) => handler.registerCommand(cmd));

    const json = handler.toJSON();

    // Check JSON structure matches Discord API requirements
    expect(json).toHaveLength(2);

    json.forEach((cmd: any) => {
      expect(cmd).toHaveProperty('name');
      expect(cmd).toHaveProperty('description');
      expect(cmd).toHaveProperty('options');
      expect(typeof cmd.name).toBe('string');
      expect(typeof cmd.description).toBe('string');
      expect(Array.isArray(cmd.options)).toBe(true);
    });
  });
});
