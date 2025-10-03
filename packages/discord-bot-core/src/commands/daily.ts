/**
 * Daily report command handler
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types/index.js';
import { dailySchema, type DailyReport } from '../schemas/daily.js';

/**
 * Generate mock daily report (placeholder for actual implementation)
 */
function generateDailyReport(
  type: string = 'summary',
  date: string = new Date().toISOString().split('T')[0] ?? '2024-01-01'
): DailyReport {
  return {
    date,
    type: type as DailyReport['type'],
    metrics: {
      trades: Math.floor(Math.random() * 100),
      volume: Math.round(Math.random() * 1000000),
      pnl: Math.round((Math.random() - 0.5) * 10000),
      winRate: Math.round(Math.random() * 100),
      sharpeRatio: Math.round(Math.random() * 3 * 100) / 100,
    },
    highlights: [
      'Strong performance in morning session',
      'Risk limits maintained throughout',
      'All systems operational',
    ],
    warnings: [
      'Elevated volatility detected in afternoon',
      'Consider position size reduction tomorrow',
    ],
    recommendations: [
      'Review stop-loss levels for open positions',
      'Monitor overnight risk exposure',
    ],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Format report as text for export
 */
function formatReportAsText(report: DailyReport): string {
  const lines = [
    `# Daily Trading Report - ${report.date}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Metrics',
    `- Trades: ${report.metrics.trades}`,
    `- Volume: $${report.metrics.volume.toLocaleString()}`,
    `- P&L: $${report.metrics.pnl.toLocaleString()}`,
    `- Win Rate: ${report.metrics.winRate}%`,
    `- Sharpe Ratio: ${report.metrics.sharpeRatio}`,
    '',
    '## Highlights',
    ...report.highlights.map((h) => `- ${h}`),
    '',
  ];

  if (report.warnings && report.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push(...report.warnings.map((w) => `⚠️ ${w}`));
    lines.push('');
  }

  if (report.recommendations && report.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push(...report.recommendations.map((r) => `→ ${r}`));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Daily command handler
 */
export async function dailyHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const type = interaction.options.getString('type') ?? 'summary';
  const date = interaction.options.getString('date') ?? new Date().toISOString().split('T')[0];
  const shouldExport = interaction.options.getBoolean('export') ?? false;

  // Validate date format
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    await interaction.editReply({
      content: '❌ Invalid date format. Please use YYYY-MM-DD',
    });
    return;
  }

  const report = generateDailyReport(type, date);

  // Create embed for display
  const embed = {
    title: `📊 Daily ${type.charAt(0).toUpperCase() + type.slice(1)} Report`,
    description: `Report for ${report.date}`,
    color: report.metrics.pnl >= 0 ? 0x00ff00 : 0xff0000,
    fields: [
      {
        name: '📈 Trades',
        value: report.metrics.trades.toString(),
        inline: true,
      },
      {
        name: '💰 Volume',
        value: `$${report.metrics.volume.toLocaleString()}`,
        inline: true,
      },
      {
        name: report.metrics.pnl >= 0 ? '✅ P&L' : '❌ P&L',
        value: `$${report.metrics.pnl.toLocaleString()}`,
        inline: true,
      },
      {
        name: '🎯 Win Rate',
        value: `${report.metrics.winRate}%`,
        inline: true,
      },
      {
        name: '📊 Sharpe Ratio',
        value: report.metrics.sharpeRatio?.toString() || 'N/A',
        inline: true,
      },
      {
        name: '🔍 Highlights',
        value: report.highlights.join('\n'),
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'TJR Trading System',
    },
  };

  // Add warnings if present
  if (report.warnings && report.warnings.length > 0) {
    embed.fields.push({
      name: '⚠️ Warnings',
      value: report.warnings.join('\n'),
      inline: false,
    });
  }

  // Add recommendations if present
  if (report.recommendations && report.recommendations.length > 0) {
    embed.fields.push({
      name: '💡 Recommendations',
      value: report.recommendations.join('\n'),
      inline: false,
    });
  }

  const replyOptions: any = { embeds: [embed] };

  // Add file attachment if export requested
  if (shouldExport) {
    const content = formatReportAsText(report);
    const buffer = Buffer.from(content, 'utf-8');

    replyOptions.files = [
      {
        attachment: buffer,
        name: `daily-report-${date}.md`,
        description: `Daily ${type} report for ${date}`,
      },
    ];
  }

  await interaction.editReply(replyOptions);
}

/**
 * Daily command definition
 */
export const dailyCommand: Command = {
  schema: dailySchema,
  handler: dailyHandler,
};
