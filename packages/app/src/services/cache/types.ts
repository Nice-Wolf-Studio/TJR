/**
 * Cache service types and interfaces
 */

import type { Service } from '../../container/types.js';

/**
 * Cache service interface
 */
export interface CacheService extends Service {
  /**
   * Get value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete key from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): CacheStats;

  /**
   * Get all keys (for debugging)
   */
  keys(): Promise<string[]>;

  /**
   * Get cache size in bytes
   */
  size(): Promise<number>;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  keys: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  type: 'memory' | 'redis';
  defaultTTL?: number;
  maxSize?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
}