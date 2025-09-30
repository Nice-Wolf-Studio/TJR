/**
 * In-memory cache implementation
 */

import type { Logger } from '@tjr/logger';
import type { CacheService, CacheStats } from './types.js';
import type { HealthStatus } from '../../container/types.js';

export interface MemoryCacheConfig {
  logger: Logger;
  defaultTTL?: number;
  maxSize?: number;
  checkInterval?: number;
}

interface CacheEntry<T> {
  value: T;
  expires: number;
  size: number;
}

/**
 * Simple in-memory cache with TTL support
 */
export class MemoryCache implements CacheService {
  readonly name = 'CacheService';
  readonly dependencies = ['Logger'];

  private logger: Logger;
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    size: 0,
    keys: 0
  };
  private defaultTTL: number;
  private maxSize: number;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: MemoryCacheConfig) {
    this.logger = config.logger;
    this.defaultTTL = config.defaultTTL ?? 300000; // 5 minutes
    this.maxSize = config.maxSize ?? 100 * 1024 * 1024; // 100MB
  }

  async initialize(): Promise<void> {
    this.logger.info('Memory cache initializing', {
      defaultTTL: this.defaultTTL,
      maxSize: this.maxSize
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Run every minute
  }

  async shutdown(): Promise<void> {
    this.logger.info('Memory cache shutting down');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cache.clear();
  }

  healthCheck(): HealthStatus {
    const healthy = this.stats.size < this.maxSize * 0.9; // Warn at 90% capacity

    return {
      healthy,
      message: healthy ? 'Memory cache is healthy' : 'Memory cache near capacity',
      details: {
        ...this.stats,
        utilizationPercent: (this.stats.size / this.maxSize) * 100
      }
    };
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      this.stats.size -= entry.size;
      this.stats.keys--;
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    this.stats.hits++;
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const size = this.estimateSize(value);

    // Check if we need to evict entries
    if (this.stats.size + size > this.maxSize) {
      await this.evictEntries(size);
    }

    const entry: CacheEntry<T> = {
      value,
      expires: Date.now() + (ttl ?? this.defaultTTL),
      size
    };

    // Update stats
    const existing = this.cache.get(key);
    if (existing) {
      this.stats.size -= existing.size;
    } else {
      this.stats.keys++;
    }

    this.cache.set(key, entry);
    this.stats.sets++;
    this.stats.size += size;

    this.logger.debug('Cache set', {
      key,
      size,
      ttl: ttl ?? this.defaultTTL
    });
  }

  async delete(key: string): Promise<void> {
    const entry = this.cache.get(key);
    if (entry) {
      this.cache.delete(key);
      this.stats.deletes++;
      this.stats.size -= entry.size;
      this.stats.keys--;

      this.logger.debug('Cache delete', { key });
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expires < Date.now()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    const count = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.stats.keys = 0;

    this.logger.info('Cache cleared', { count });
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  async size(): Promise<number> {
    return this.stats.size;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
        this.stats.size -= entry.size;
        this.stats.keys--;
        this.stats.evictions++;
        removed++;
      }
    }

    if (removed > 0) {
      this.logger.debug('Cache cleanup', { removed });
    }
  }

  /**
   * Evict entries to make room (simple FIFO)
   */
  private async evictEntries(requiredSize: number): Promise<void> {
    const entries = Array.from(this.cache.entries());
    let freedSize = 0;

    for (const [key, entry] of entries) {
      if (this.stats.size - freedSize + requiredSize <= this.maxSize) {
        break;
      }

      this.cache.delete(key);
      freedSize += entry.size;
      this.stats.evictions++;
      this.stats.keys--;
    }

    this.stats.size -= freedSize;
    this.logger.debug('Cache eviction', { freedSize, evicted: this.stats.evictions });
  }

  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    if (value === null || value === undefined) return 0;

    const type = typeof value;
    if (type === 'boolean') return 4;
    if (type === 'number') return 8;
    if (type === 'string') return value.length * 2;

    // For objects/arrays, use JSON stringify as rough estimate
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default size for non-serializable
    }
  }
}