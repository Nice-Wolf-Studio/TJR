/**
 * Daily report command schema
 */

import type { CommandSchema } from '../types/index.js';

export const dailySchema: CommandSchema = {
  name: 'daily',
  description: 'Get daily trading report and analysis',
  dmPermission: false,
  options: [
    {
      type: 3, // STRING
      name: 'type',
      description: 'Type of daily report',
      required: false,
      choices: [
        { name: 'Summary', value: 'summary' },
        { name: 'Performance', value: 'performance' },
        { name: 'Risk Analysis', value: 'risk' },
        { name: 'Full Report', value: 'full' },
      ],
    },
    {
      type: 3, // STRING
      name: 'date',
      description: 'Date for report (YYYY-MM-DD)',
      required: false,
      minLength: 10,
      maxLength: 10,
    },
    {
      type: 5, // BOOLEAN
      name: 'export',
      description: 'Export report as file',
      required: false,
    },
  ],
};

/**
 * Daily report structure
 */
export interface DailyReport {
  date: string;
  type: 'summary' | 'performance' | 'risk' | 'full';
  metrics: {
    trades: number;
    volume: number;
    pnl: number;
    winRate: number;
    sharpeRatio?: number;
  };
  highlights: string[];
  warnings?: string[];
  recommendations?: string[];
  generatedAt: string;
}
