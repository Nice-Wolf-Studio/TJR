/**
 * Manual dependency injection container implementation
 */

import type {
  IContainer,
  Service,
  ServiceFactory,
  ServiceRegistration,
  DependencyNode,
  HealthStatus,
} from './types.js';
import { getTokenName } from './tokens.js';

/**
 * Simple dependency injection container
 */
export class Container implements IContainer {
  private services = new Map<symbol, any>();
  private factories = new Map<symbol, ServiceFactory<any>>();
  private registrations = new Map<symbol, ServiceRegistration>();
  private initialized = new Set<symbol>();

  /**
   * Register a service factory
   */
  register<T>(
    token: symbol,
    factory: ServiceFactory<T>,
    metadata?: Partial<ServiceRegistration>
  ): void {
    this.factories.set(token, factory);
    this.registrations.set(token, {
      token,
      name: metadata?.name || getTokenName(token),
      factory,
      singleton: metadata?.singleton !== false,
      dependencies: metadata?.dependencies || [],
    });
  }

  /**
   * Resolve a service instance
   */
  resolve<T>(token: symbol): T {
    // Check if already instantiated (singleton)
    if (this.services.has(token)) {
      return this.services.get(token);
    }

    // Get factory
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service not registered: ${getTokenName(token)}`);
    }

    // Create instance
    const instance = factory(this);

    // Store if singleton
    const registration = this.registrations.get(token);
    if (registration?.singleton) {
      this.services.set(token, instance);
    }

    return instance;
  }

  /**
   * Check if service is registered
   */
  has(token: symbol): boolean {
    return this.factories.has(token);
  }

  /**
   * Get dependency graph for visualization
   */
  getDependencyGraph(): DependencyNode[] {
    const visited = new Set<symbol>();
    const nodes: DependencyNode[] = [];

    const buildNode = (token: symbol): DependencyNode => {
      if (visited.has(token)) {
        return {
          name: getTokenName(token),
          token,
          dependencies: [],
          metadata: { circular: true },
        };
      }

      visited.add(token);
      const registration = this.registrations.get(token);

      const dependencies = (registration?.dependencies || []).map((depToken) =>
        buildNode(depToken)
      );

      return {
        name: registration?.name || getTokenName(token),
        token,
        dependencies,
        metadata: {
          singleton: registration?.singleton,
          initialized: this.initialized.has(token),
        },
      };
    };

    // Build nodes for all registered services
    for (const token of this.registrations.keys()) {
      if (!visited.has(token)) {
        nodes.push(buildNode(token));
      }
    }

    return nodes;
  }

  /**
   * Initialize all registered services
   */
  async initializeAll(): Promise<void> {
    const services: Service[] = [];

    // Collect all services that implement Service interface
    for (const token of this.registrations.keys()) {
      const instance = this.resolve(token);
      if (isService(instance)) {
        services.push(instance);
      }
    }

    // Initialize in dependency order
    const initialized = new Set<string>();
    const initialize = async (service: Service) => {
      if (initialized.has(service.name)) {
        return;
      }

      // Initialize dependencies first
      for (const depName of service.dependencies) {
        const dep = services.find((s) => s.name === depName);
        if (dep) {
          await initialize(dep);
        }
      }

      // Initialize this service
      await service.initialize();
      initialized.add(service.name);

      // Mark token as initialized
      const token = Array.from(this.registrations.entries()).find(
        ([_, reg]) => reg.name === service.name
      )?.[0];
      if (token) {
        this.initialized.add(token);
      }
    };

    // Initialize all services
    for (const service of services) {
      await initialize(service);
    }
  }

  /**
   * Shutdown all services
   */
  async shutdownAll(): Promise<void> {
    const services: Service[] = [];

    // Collect all services
    for (const token of this.initialized) {
      const instance = this.services.get(token);
      if (isService(instance)) {
        services.push(instance);
      }
    }

    // Shutdown in reverse dependency order
    const shutdown = new Set<string>();
    const shutdownService = async (service: Service) => {
      if (shutdown.has(service.name)) {
        return;
      }

      // Shutdown dependents first
      for (const dependent of services) {
        if (dependent.dependencies.includes(service.name)) {
          await shutdownService(dependent);
        }
      }

      // Shutdown this service (catch errors to allow other shutdowns to continue)
      try {
        await service.shutdown();
      } catch (error) {
        // Log error but don't throw - we want to continue shutting down other services
        console.error(`Error shutting down service ${service.name}:`, error);
      }
      shutdown.add(service.name);
    };

    // Shutdown all services
    for (const service of services) {
      await shutdownService(service);
    }

    // Clear state
    this.initialized.clear();
  }

  /**
   * Health check all services
   */
  async healthCheckAll(): Promise<Map<string, HealthStatus>> {
    const results = new Map<string, HealthStatus>();

    for (const token of this.initialized) {
      const instance = this.services.get(token);
      if (isService(instance)) {
        try {
          const status = await instance.healthCheck();
          results.set(instance.name, {
            ...status,
            lastCheck: new Date(),
          });
        } catch (error) {
          results.set(instance.name, {
            healthy: false,
            message: `Health check failed: ${error}`,
            lastCheck: new Date(),
          });
        }
      }
    }

    return results;
  }

  /**
   * Get wiring graph as ASCII art
   */
  getWiringGraph(): string {
    const nodes = this.getDependencyGraph();
    const lines: string[] = ['[App Container]'];

    const renderNode = (node: DependencyNode, prefix: string, isLast: boolean) => {
      const connector = isLast ? '└─> ' : '├─> ';
      const status = node.metadata?.['initialized'] ? '✓' : '○';
      lines.push(`${prefix}${connector}[${node.name}] ${status}`);

      const childPrefix = prefix + (isLast ? '      ' : '│     ');
      node.dependencies.forEach((dep, i) => {
        renderNode(dep, childPrefix, i === node.dependencies.length - 1);
      });
    };

    nodes.forEach((node, i) => {
      renderNode(node, '  ', i === nodes.length - 1);
    });

    return lines.join('\n');
  }
}

/**
 * Type guard for Service interface
 */
function isService(obj: any): obj is Service {
  return (
    obj &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.dependencies) &&
    typeof obj.initialize === 'function' &&
    typeof obj.shutdown === 'function' &&
    typeof obj.healthCheck === 'function'
  );
}

// Re-export types
export * from './types.js';
export * from './tokens.js';
