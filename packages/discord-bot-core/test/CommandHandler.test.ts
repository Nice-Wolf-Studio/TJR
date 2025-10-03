/**
 * CommandHandler unit tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandHandler } from '../src/handlers/CommandHandler.js';
import type { Command, CommandSchema } from '../src/types/index.js';

describe('CommandHandler', () => {
  let handler: CommandHandler;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {};
    handler = new CommandHandler(mockClient);
  });

  describe('registerCommand', () => {
    it('should register a command', () => {
      const command: Command = {
        schema: { name: 'test', description: 'Test command' },
        handler: vi.fn(),
      };

      handler.registerCommand(command);
      expect(handler.getCommand('test')).toBe(command);
    });

    it('should throw error for command without name', () => {
      const command: Command = {
        schema: { name: '', description: 'Test command' },
        handler: vi.fn(),
      };

      expect(() => handler.registerCommand(command)).toThrow('Command must have a name');
    });

    it('should override existing command with same name', () => {
      const command1: Command = {
        schema: { name: 'test', description: 'First command' },
        handler: vi.fn(),
      };

      const command2: Command = {
        schema: { name: 'test', description: 'Second command' },
        handler: vi.fn(),
      };

      handler.registerCommand(command1);
      handler.registerCommand(command2);

      expect(handler.getCommand('test')).toBe(command2);
    });
  });

  describe('registerCommands', () => {
    it('should register multiple commands', () => {
      const commands: Command[] = [
        {
          schema: { name: 'test1', description: 'Test 1' },
          handler: vi.fn(),
        },
        {
          schema: { name: 'test2', description: 'Test 2' },
          handler: vi.fn(),
        },
      ];

      handler.registerCommands(commands);
      expect(handler.getAllCommands()).toHaveLength(2);
      expect(handler.getCommand('test1')).toBe(commands[0]);
      expect(handler.getCommand('test2')).toBe(commands[1]);
    });
  });

  describe('getCommand', () => {
    it('should return undefined for non-existent command', () => {
      expect(handler.getCommand('nonexistent')).toBeUndefined();
    });
  });

  describe('handleInteraction', () => {
    it('should handle valid command interaction', async () => {
      const mockHandler = vi.fn().mockResolvedValue(undefined);
      const command: Command = {
        schema: { name: 'test', description: 'Test command' },
        handler: mockHandler,
      };

      handler.registerCommand(command);

      const mockInteraction = {
        isChatInputCommand: () => true,
        commandName: 'test',
        reply: vi.fn(),
        replied: false,
        deferred: false,
      };

      await handler.handleInteraction(mockInteraction as any);
      expect(mockHandler).toHaveBeenCalledWith(mockInteraction);
    });

    it('should reply with error for non-existent command', async () => {
      const mockInteraction = {
        isChatInputCommand: () => true,
        commandName: 'nonexistent',
        reply: vi.fn(),
      };

      await handler.handleInteraction(mockInteraction as any);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Command nonexistent not found',
        ephemeral: true,
      });
    });

    it('should handle errors in command handler', async () => {
      const error = new Error('Test error');
      const mockHandler = vi.fn().mockRejectedValue(error);
      const command: Command = {
        schema: { name: 'test', description: 'Test command' },
        handler: mockHandler,
      };

      handler.registerCommand(command);

      const mockInteraction = {
        isChatInputCommand: () => true,
        commandName: 'test',
        reply: vi.fn(),
        replied: false,
        deferred: false,
      };

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await handler.handleInteraction(mockInteraction as any);

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error handling command test:', error);
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: 'Error: Test error',
        ephemeral: true,
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('buildCommand', () => {
    it('should build command with string option', () => {
      const schema: CommandSchema = {
        name: 'test',
        description: 'Test command',
        options: [
          {
            type: 3, // STRING
            name: 'text',
            description: 'Some text',
            required: true,
            minLength: 1,
            maxLength: 100,
          },
        ],
      };

      const builder = handler.buildCommand(schema);
      const json = builder.toJSON();

      expect(json.name).toBe('test');
      expect(json.description).toBe('Test command');
      expect(json.options).toHaveLength(1);
      expect(json.options?.[0]).toMatchObject({
        name: 'text',
        description: 'Some text',
        type: 3,
        required: true,
        min_length: 1,
        max_length: 100,
      });
    });

    it('should build command with boolean option', () => {
      const schema: CommandSchema = {
        name: 'test',
        description: 'Test command',
        dmPermission: true,
        options: [
          {
            type: 5, // BOOLEAN
            name: 'flag',
            description: 'A flag',
            required: false,
          },
        ],
      };

      const builder = handler.buildCommand(schema);
      const json = builder.toJSON();

      expect(json.dm_permission).toBe(true);
      expect(json.options?.[0]).toMatchObject({
        name: 'flag',
        description: 'A flag',
        type: 5,
        required: false,
      });
    });

    it('should build command with choices', () => {
      const schema: CommandSchema = {
        name: 'test',
        description: 'Test command',
        options: [
          {
            type: 3, // STRING
            name: 'choice',
            description: 'Pick one',
            choices: [
              { name: 'Option A', value: 'a' },
              { name: 'Option B', value: 'b' },
            ],
          },
        ],
      };

      const builder = handler.buildCommand(schema);
      const json = builder.toJSON();

      expect(json.options?.[0].choices).toEqual([
        { name: 'Option A', value: 'a' },
        { name: 'Option B', value: 'b' },
      ]);
    });
  });

  describe('toJSON', () => {
    it('should convert all commands to JSON', () => {
      const commands: Command[] = [
        {
          schema: { name: 'test1', description: 'Test 1' },
          handler: vi.fn(),
        },
        {
          schema: { name: 'test2', description: 'Test 2' },
          handler: vi.fn(),
        },
      ];

      handler.registerCommands(commands);
      const json = handler.toJSON();

      expect(json).toHaveLength(2);
      expect(json[0].name).toBe('test1');
      expect(json[1].name).toBe('test2');
    });
  });

  describe('generateManifest', () => {
    it('should generate manifest with correct structure', () => {
      const command: Command = {
        schema: { name: 'test', description: 'Test command' },
        handler: vi.fn(),
      };

      handler.registerCommand(command);
      const manifest = handler.generateManifest();

      expect(manifest).toHaveProperty('version', '1.0.0');
      expect(manifest).toHaveProperty('generatedAt');
      expect(manifest).toHaveProperty('commands');
      expect(manifest).toHaveProperty('hash');
      expect(manifest.commands).toHaveLength(1);
      expect(manifest.commands[0]).toBe(command.schema);
    });
  });
});
