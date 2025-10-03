/**
 * Command handler tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthHandler } from '../src/commands/health.js';
import { dailyHandler } from '../src/commands/daily.js';

describe('Health Command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    mockInteraction = {
      options: {
        getBoolean: vi.fn().mockReturnValue(false),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
  });

  it('should handle simple health check', async () => {
    await healthHandler(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockInteraction.editReply).toHaveBeenCalled();

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.content).toMatch(/✅ Bot is \*\*healthy\*\*/);
    expect(replyCall.content).toMatch(/Uptime:/);
    expect(replyCall.content).toMatch(/Memory:/);
  });

  it('should handle detailed health check', async () => {
    mockInteraction.options.getBoolean.mockReturnValue(true);

    await healthHandler(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(mockInteraction.editReply).toHaveBeenCalled();

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.embeds).toBeDefined();
    expect(replyCall.embeds[0].title).toBe('🏥 Health Report');
    expect(replyCall.embeds[0].fields).toHaveLength(5);
  });
});

describe('Daily Command', () => {
  let mockInteraction: any;

  beforeEach(() => {
    mockInteraction = {
      options: {
        getString: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(false),
      },
      deferReply: vi.fn(),
      editReply: vi.fn(),
    };
  });

  it('should generate summary report by default', async () => {
    await dailyHandler(mockInteraction);

    expect(mockInteraction.deferReply).toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalled();

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.embeds).toBeDefined();
    expect(replyCall.embeds[0].title).toMatch(/Daily Summary Report/);
  });

  it('should handle different report types', async () => {
    mockInteraction.options.getString.mockImplementation((key: string) => {
      if (key === 'type') return 'performance';
      return null;
    });

    await dailyHandler(mockInteraction);

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.embeds[0].title).toMatch(/Daily Performance Report/);
  });

  it('should validate date format', async () => {
    mockInteraction.options.getString.mockImplementation((key: string) => {
      if (key === 'date') return 'invalid-date';
      return null;
    });

    await dailyHandler(mockInteraction);

    expect(mockInteraction.editReply).toHaveBeenCalledWith({
      content: '❌ Invalid date format. Please use YYYY-MM-DD',
    });
  });

  it('should handle valid date format', async () => {
    mockInteraction.options.getString.mockImplementation((key: string) => {
      if (key === 'date') return '2024-01-15';
      return null;
    });

    await dailyHandler(mockInteraction);

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.embeds[0].description).toContain('2024-01-15');
  });

  it('should export report as file when requested', async () => {
    mockInteraction.options.getBoolean.mockImplementation((key: string) => {
      return key === 'export';
    });

    await dailyHandler(mockInteraction);

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    expect(replyCall.files).toBeDefined();
    expect(replyCall.files[0]).toHaveProperty('attachment');
    expect(replyCall.files[0].name).toMatch(/daily-report-.*\.md/);
  });

  it('should include all report sections', async () => {
    mockInteraction.options.getString.mockImplementation((key: string) => {
      if (key === 'type') return 'full';
      return null;
    });

    await dailyHandler(mockInteraction);

    const replyCall = mockInteraction.editReply.mock.calls[0][0];
    const embed = replyCall.embeds[0];

    // Check for required fields
    const fieldNames = embed.fields.map((f: any) => f.name);
    expect(fieldNames).toContain('📈 Trades');
    expect(fieldNames).toContain('💰 Volume');
    expect(fieldNames.some((n: string) => n.includes('P&L'))).toBe(true);
    expect(fieldNames).toContain('🎯 Win Rate');
    expect(fieldNames).toContain('📊 Sharpe Ratio');
    expect(fieldNames).toContain('🔍 Highlights');
    expect(fieldNames).toContain('⚠️ Warnings');
    expect(fieldNames).toContain('💡 Recommendations');
  });
});
