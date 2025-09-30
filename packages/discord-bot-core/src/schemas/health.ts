/**
 * Health check command schema
 */

import type { CommandSchema } from '../types/index.js';

export const healthSchema: CommandSchema = {
  name: 'health',
  description: 'Check bot health and status',
  dmPermission: true,
  options: [
    {
      type: 5, // BOOLEAN
      name: 'detailed',
      description: 'Show detailed health information',
      required: false,
    },
  ],
};

/**
 * Health response structure
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  latency?: number;
  timestamp: string;
  version?: string;
  services?: Record<string, {
    status: 'up' | 'down' | 'unknown';
    latency?: number;
  }>;
}