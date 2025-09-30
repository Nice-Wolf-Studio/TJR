/**
 * Tests for Health Command
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Container, TOKENS } from '../src/container/index.js';
import { HealthCommand } from '../src/commands/health.command.js';
import { createLogger } from '@tjr/logger';
import type { Service, HealthStatus } from '../src/container/types.js';

// Mock service for testing
class MockHealthyService implements Service {
  readonly name = 'HealthyService';
  readonly dependencies: string[] = [];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  healthCheck(): HealthStatus {
    return {
      healthy: true,
      message: 'All systems operational',
      details: {
        uptime: 12345,
        connections: 5
      }
    };
  }
}

class MockUnhealthyService implements Service {
  readonly name = 'UnhealthyService';
  readonly dependencies: string[] = [];

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  healthCheck(): HealthStatus {
    return {
      healthy: false,
      message: 'Service degraded',
      details: {
        error: 'Connection timeout'
      }
    };
  }
}

describe('HealthCommand', () => {
  let container: Container;
  let logger: any;
  let healthCommand: HealthCommand;

  beforeEach(() => {
    container = new Container();
    logger = createLogger({
      level: 'error', // Quiet during tests
      format: 'json'
    });
    healthCommand = new HealthCommand({ container, logger });
  });

  describe('Basic Execution', () => {
    it('should execute successfully', async () => {
      const result = await healthCommand.execute([], {});

      expect(result.success).toBeDefined();
      expect(result.output).toBeDefined();
    });

    it('should return command metadata', async () => {
      const result = await healthCommand.execute([], {});

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.servicesChecked).toBeGreaterThanOrEqual(0);
    });

    it('should have correct command properties', () => {
      expect(healthCommand.name).toBe('health');
      expect(healthCommand.description).toBeTruthy();
      expect(healthCommand.aliases).toContain('status');
    });
  });

  describe('Health Status Checking', () => {
    it('should report healthy when all services healthy', async () => {
      const healthyService = new MockHealthyService();
      const healthyToken = Symbol('healthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], {});

      expect(result.success).toBe(true);
    });

    it('should report unhealthy when any service unhealthy', async () => {
      const healthyService = new MockHealthyService();
      const unhealthyService = new MockUnhealthyService();

      const healthyToken = Symbol('healthy');
      const unhealthyToken = Symbol('unhealthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      container.register(unhealthyToken, () => unhealthyService, { name: 'UnhealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], {});

      expect(result.success).toBe(false);
    });

    it('should include service details in output', async () => {
      const healthyService = new MockHealthyService();
      const healthyToken = Symbol('healthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.services).toBeDefined();
      expect(output.services.length).toBeGreaterThan(0);
      expect(output.services[0].name).toBe('HealthyService');
    });

    it('should include summary statistics', async () => {
      const healthyService = new MockHealthyService();
      const unhealthyService = new MockUnhealthyService();

      const healthyToken = Symbol('healthy');
      const unhealthyToken = Symbol('unhealthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      container.register(unhealthyToken, () => unhealthyService, { name: 'UnhealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], { format: 'json' });
      const output = JSON.parse(result.output);

      expect(output.summary).toBeDefined();
      expect(output.summary.total).toBe(2);
      expect(output.summary.healthy).toBe(1);
      expect(output.summary.unhealthy).toBe(1);
    });
  });

  describe('Output Formatting', () => {
    beforeEach(async () => {
      const healthyService = new MockHealthyService();
      const healthyToken = Symbol('healthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      await container.initializeAll();
    });

    it('should format as JSON', async () => {
      const result = await healthCommand.execute([], { format: 'json' });

      expect(() => JSON.parse(result.output)).not.toThrow();
      const output = JSON.parse(result.output);
      expect(output.status).toBeDefined();
      expect(output.services).toBeDefined();
    });

    it('should format as text', async () => {
      const result = await healthCommand.execute([], { format: 'text' });

      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('Health Status');
      expect(result.output).toContain('HealthyService');
    });

    it('should format as table', async () => {
      const result = await healthCommand.execute([], { format: 'table' });

      expect(typeof result.output).toBe('string');
      expect(result.output).toContain('┌');
      expect(result.output).toContain('Service');
      expect(result.output).toContain('Status');
    });

    it('should include wiring graph when verbose', async () => {
      const result = await healthCommand.execute([], {
        format: 'json',
        verbose: true
      });

      const output = JSON.parse(result.output);
      expect(output.wiringGraph).toBeDefined();
      expect(output.wiringGraph).toContain('[App Container]');
    });

    it('should not include wiring graph when not verbose', async () => {
      const result = await healthCommand.execute([], {
        format: 'json',
        verbose: false
      });

      const output = JSON.parse(result.output);
      expect(output.wiringGraph).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Create a container that will throw during health check
      const errorContainer = new Container();
      errorContainer.healthCheckAll = async () => {
        throw new Error('Health check system failure');
      };

      const errorHealthCommand = new HealthCommand({
        container: errorContainer,
        logger
      });

      const result = await errorHealthCommand.execute([], {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include error in result', async () => {
      const errorContainer = new Container();
      errorContainer.healthCheckAll = async () => {
        throw new Error('Test error');
      };

      const errorHealthCommand = new HealthCommand({
        container: errorContainer,
        logger
      });

      const result = await errorHealthCommand.execute([], {});

      expect(result.error?.message).toContain('Test error');
    });
  });

  describe('Text Output Format', () => {
    it('should show check marks for healthy services', async () => {
      const healthyService = new MockHealthyService();
      const healthyToken = Symbol('healthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], { format: 'text' });

      expect(result.output).toContain('✓');
      expect(result.output).toContain('HealthyService');
    });

    it('should show X marks for unhealthy services', async () => {
      const unhealthyService = new MockUnhealthyService();
      const unhealthyToken = Symbol('unhealthy');
      container.register(unhealthyToken, () => unhealthyService, { name: 'UnhealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], { format: 'text' });

      expect(result.output).toContain('✗');
      expect(result.output).toContain('UnhealthyService');
    });

    it('should include service details when present', async () => {
      const healthyService = new MockHealthyService();
      const healthyToken = Symbol('healthy');
      container.register(healthyToken, () => healthyService, { name: 'HealthyService' });
      await container.initializeAll();

      const result = await healthCommand.execute([], { format: 'text' });

      expect(result.output).toContain('uptime');
      expect(result.output).toContain('connections');
    });
  });
});