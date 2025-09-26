import logger from '../utils/logger';

interface CacheEntry {
  value: string;
  expires: number;
}

interface RedisHealth {
  status: 'healthy' | 'unhealthy';
  type: 'memory-cache';
  connected: boolean;
  cacheSize: number;
}

class RedisConnection {
  public isConnected = false;
  private cache: Map<string, CacheEntry> = new Map();

  async initialize(): Promise<boolean> {
    this.isConnected = true;
    logger.info('✅ Redis placeholder initialized (in-memory cache)');
    return true;
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 3600): Promise<'OK'> {
    this.ensureConnected();
    const serialized = JSON.stringify(value);
    this.cache.set(key, {
      value: serialized,
      expires: Date.now() + ttlSeconds * 1000
    });
    return 'OK';
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.ensureConnected();
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return JSON.parse(entry.value) as T;
  }

  async del(key: string): Promise<number> {
    this.ensureConnected();
    return this.cache.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<boolean> {
    this.ensureConnected();
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async flushall(): Promise<'OK'> {
    this.cache.clear();
    return 'OK';
  }

  async getHealth(): Promise<RedisHealth> {
    return {
      status: this.isConnected ? 'healthy' : 'unhealthy',
      type: 'memory-cache',
      connected: this.isConnected,
      cacheSize: this.cache.size
    };
  }

  async shutdown(): Promise<void> {
    this.isConnected = false;
    this.cache.clear();
    logger.info('✅ Redis placeholder shut down');
  }
}

export default RedisConnection;

module.exports = RedisConnection;
