/**
 * Health command handler
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types/index.js';
import { healthSchema, type HealthResponse } from '../schemas/health.js';

/**
 * Get system health metrics
 */
function getHealthMetrics(): HealthResponse {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();

  return {
    status: 'healthy',
    uptime: Math.floor(uptime),
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    },
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  };
}

/**
 * Health command handler
 */
export async function healthHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const detailed = interaction.options.getBoolean('detailed') ?? false;
  const health = getHealthMetrics();

  if (!detailed) {
    await interaction.editReply({
      content: `✅ Bot is **${health.status}** | Uptime: ${Math.floor(health.uptime / 60)}m | Memory: ${health.memory.percentage}%`,
    });
    return;
  }

  // Detailed response
  const embed = {
    title: '🏥 Health Report',
    color:
      health.status === 'healthy' ? 0x00ff00 : health.status === 'degraded' ? 0xffff00 : 0xff0000,
    fields: [
      {
        name: 'Status',
        value: health.status.toUpperCase(),
        inline: true,
      },
      {
        name: 'Uptime',
        value: formatUptime(health.uptime),
        inline: true,
      },
      {
        name: 'Version',
        value: health.version || 'Unknown',
        inline: true,
      },
      {
        name: 'Memory Usage',
        value: `${health.memory.used}MB / ${health.memory.total}MB (${health.memory.percentage}%)`,
        inline: false,
      },
      {
        name: 'Process Info',
        value: `PID: ${process.pid}\nNode: ${process.version}\nPlatform: ${process.platform}`,
        inline: false,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'TJR Discord Bot',
    },
  };

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Format uptime to human readable string
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Health command definition
 */
export const healthCommand: Command = {
  schema: healthSchema,
  handler: healthHandler,
};
