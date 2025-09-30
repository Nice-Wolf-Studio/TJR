/**
 * Tests for DI Container
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Container, TOKENS } from '../src/container/index.js';
import type { Service, HealthStatus } from '../src/container/types.js';

// Mock service for testing
class MockService implements Service {
  readonly name = 'MockService';
  readonly dependencies: string[] = [];

  initialized = false;
  shutdownCalled = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  healthCheck(): HealthStatus {
    return {
      healthy: true,
      message: 'Mock service is healthy'
    };
  }
}

class DependentService implements Service {
  readonly name = 'DependentService';
  readonly dependencies = ['MockService'];

  initialized = false;
  shutdownCalled = false;

  constructor(private mockService: MockService) {}

  async initialize(): Promise<void> {
    if (!this.mockService.initialized) {
      throw new Error('Dependency not initialized');
    }
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    this.shutdownCalled = true;
  }

  healthCheck(): HealthStatus {
    return {
      healthy: this.mockService.initialized,
      message: 'Dependent service is healthy'
    };
  }
}

describe('Container', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  describe('Service Registration', () => {
    it('should register a service', () => {
      container.register(TOKENS.Logger, () => 'logger');
      expect(container.has(TOKENS.Logger)).toBe(true);
    });

    it('should not have unregistered service', () => {
      expect(container.has(TOKENS.Logger)).toBe(false);
    });

    it('should register multiple services', () => {
      container.register(TOKENS.Logger, () => 'logger');
      container.register(TOKENS.Config, () => ({ env: 'test' }));

      expect(container.has(TOKENS.Logger)).toBe(true);
      expect(container.has(TOKENS.Config)).toBe(true);
    });
  });

  describe('Service Resolution', () => {
    it('should resolve a registered service', () => {
      container.register(TOKENS.Logger, () => 'logger');
      const logger = container.resolve(TOKENS.Logger);
      expect(logger).toBe('logger');
    });

    it('should throw error for unregistered service', () => {
      expect(() => container.resolve(TOKENS.Logger)).toThrow('Service not registered');
    });

    it('should return singleton instance', () => {
      let counter = 0;
      container.register(TOKENS.Logger, () => ++counter);

      const first = container.resolve(TOKENS.Logger);
      const second = container.resolve(TOKENS.Logger);

      expect(first).toBe(second);
      expect(counter).toBe(1);
    });

    it('should resolve service with dependencies', () => {
      const mockService = new MockService();
      const mockToken = Symbol('mock');
      container.register(mockToken, () => mockService);

      const dependentService = container.resolve(mockToken);
      expect(dependentService).toBe(mockService);
    });
  });

  describe('Dependency Graph', () => {
    it('should generate dependency graph', () => {
      container.register(TOKENS.Logger, () => 'logger', {
        name: 'Logger',
        dependencies: []
      });
      container.register(TOKENS.Config, () => ({}), {
        name: 'Config',
        dependencies: [TOKENS.Logger]
      });

      const graph = container.getDependencyGraph();

      expect(graph).toBeDefined();
      expect(graph.length).toBeGreaterThan(0);
    });

    it('should include dependency relationships', () => {
      container.register(TOKENS.Logger, () => 'logger', {
        name: 'Logger',
        dependencies: []
      });
      container.register(TOKENS.Config, () => ({}), {
        name: 'Config',
        dependencies: [TOKENS.Logger]
      });

      const graph = container.getDependencyGraph();
      const configNode = graph.find(n => n.name === 'Config');

      expect(configNode).toBeDefined();
    });

    it('should render wiring graph as ASCII', () => {
      container.register(TOKENS.Logger, () => 'logger', {
        name: 'Logger'
      });

      const ascii = container.getWiringGraph();

      expect(ascii).toContain('[App Container]');
      expect(ascii).toContain('Logger');
    });
  });

  describe('Service Initialization', () => {
    it('should initialize all services', async () => {
      const mockService = new MockService();
      const mockToken = Symbol('mock');
      container.register(mockToken, () => mockService, {
        name: 'MockService'
      });

      await container.initializeAll();

      expect(mockService.initialized).toBe(true);
    });

    it('should initialize services in dependency order', async () => {
      const mockService = new MockService();
      const dependentService = new DependentService(mockService);

      const mockToken = Symbol('mock');
      const dependentToken = Symbol('dependent');
      container.register(mockToken, () => mockService, {
        name: 'MockService'
      });
      container.register(dependentToken, () => dependentService, {
        name: 'DependentService'
      });

      await container.initializeAll();

      expect(mockService.initialized).toBe(true);
      expect(dependentService.initialized).toBe(true);
    });

    it('should handle services without initialize method', async () => {
      container.register(TOKENS.Logger, () => 'simple-logger');
      await expect(container.initializeAll()).resolves.not.toThrow();
    });
  });

  describe('Service Shutdown', () => {
    it('should shutdown all initialized services', async () => {
      const mockService = new MockService();
      const mockToken = Symbol('mock');
      container.register(mockToken, () => mockService, {
        name: 'MockService'
      });

      await container.initializeAll();
      await container.shutdownAll();

      expect(mockService.shutdownCalled).toBe(true);
    });

    it('should handle shutdown errors gracefully', async () => {
      const errorService: Service = {
        name: 'ErrorService',
        dependencies: [],
        async initialize() {},
        async shutdown() {
          throw new Error('Shutdown error');
        },
        healthCheck() {
          return { healthy: true };
        }
      };

      const errorToken = Symbol('error');
      container.register(errorToken, () => errorService, {
        name: 'ErrorService'
      });
      await container.initializeAll();

      await expect(container.shutdownAll()).resolves.not.toThrow();
    });
  });

  describe('Health Checks', () => {
    it('should perform health check on all services', async () => {
      const mockService = new MockService();
      const mockToken = Symbol('mock');
      container.register(mockToken, () => mockService, {
        name: 'MockService'
      });

      await container.initializeAll();
      const healthStatuses = await container.healthCheckAll();

      expect(healthStatuses.size).toBe(1);
      expect(healthStatuses.get('MockService')).toBeDefined();
      expect(healthStatuses.get('MockService')?.healthy).toBe(true);
    });

    it('should include last check timestamp', async () => {
      const mockService = new MockService();
      const mockToken = Symbol('mock');
      container.register(mockToken, () => mockService, {
        name: 'MockService'
      });

      await container.initializeAll();
      const healthStatuses = await container.healthCheckAll();
      const status = healthStatuses.get('MockService');

      expect(status?.lastCheck).toBeInstanceOf(Date);
    });

    it('should handle health check failures', async () => {
      const unhealthyService: Service = {
        name: 'UnhealthyService',
        dependencies: [],
        async initialize() {},
        async shutdown() {},
        healthCheck() {
          throw new Error('Health check failed');
        }
      };

      const unhealthyToken = Symbol('unhealthy');
      container.register(unhealthyToken, () => unhealthyService, {
        name: 'UnhealthyService'
      });
      await container.initializeAll();

      const healthStatuses = await container.healthCheckAll();
      const status = healthStatuses.get('UnhealthyService');

      expect(status?.healthy).toBe(false);
      expect(status?.message).toContain('Health check failed');
    });
  });
});