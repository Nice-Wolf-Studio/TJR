/**
 * Core types for dependency injection container
 */

import type { Logger } from '@tjr/logger';

/**
 * Base service interface that all services must implement
 */
export interface Service {
  readonly name: string;
  readonly dependencies: string[];
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  healthCheck(): HealthStatus;
}

/**
 * Health status for service health checks
 */
export interface HealthStatus {
  healthy: boolean;
  message?: string;
  details?: Record<string, any>;
  lastCheck?: Date;
}

/**
 * Service configuration with logger
 */
export interface ServiceConfig {
  logger: Logger;
}

/**
 * Dependency node for visualization
 */
export interface DependencyNode {
  name: string;
  token: symbol;
  dependencies: DependencyNode[];
  metadata?: Record<string, any>;
}

/**
 * Container interface for service registration and resolution
 */
export interface IContainer {
  register<T>(token: symbol, factory: () => T): void;
  resolve<T>(token: symbol): T;
  has(token: symbol): boolean;
  getDependencyGraph(): DependencyNode[];
  getWiringGraph(): string;
  initializeAll(): Promise<void>;
  shutdownAll(): Promise<void>;
  healthCheckAll(): Promise<Map<string, HealthStatus>>;
}

/**
 * Service factory function type
 */
export type ServiceFactory<T> = (container: IContainer) => T;

/**
 * Service registration metadata
 */
export interface ServiceRegistration {
  token: symbol;
  name: string;
  factory: ServiceFactory<any>;
  singleton: boolean;
  dependencies?: symbol[];
}