import { EventEmitter } from 'events';

interface DataCollectorOptions {
  intervalMs?: number;
}

interface DataCollectorHealth {
  status: 'healthy' | 'idle';
  initialized: boolean;
  running: boolean;
  lastRun: string | null;
}

class DataCollector extends EventEmitter {
  private initialized = false;
  private running = false;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private lastRun: number | null = null;

  constructor(options: DataCollectorOptions = {}) {
    super();
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 60_000);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.emit('initialized');
  }

  private tick = (): void => {
    this.lastRun = Date.now();
    this.emit('tick', { timestamp: new Date(this.lastRun).toISOString() });
  };

  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.running) {
      return;
    }

    this.running = true;
    this.tick();
    this.timer = setInterval(this.tick, this.intervalMs);
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    this.emit('stopped');
  }

  async shutdown(): Promise<void> {
    await this.stop();
    this.initialized = false;
    this.emit('shutdown');
  }

  getHealth(): DataCollectorHealth {
    return {
      status: this.running ? 'healthy' : 'idle',
      initialized: this.initialized,
      running: this.running,
      lastRun: this.lastRun ? new Date(this.lastRun).toISOString() : null
    };
  }

  async healthCheck(): Promise<DataCollectorHealth> {
    return this.getHealth();
  }
}

const singleton = new DataCollector();

type CollectorModule = DataCollector & {
  DataCollector: typeof DataCollector;
  create: (options?: DataCollectorOptions) => DataCollector;
};

const collectorModule: CollectorModule = Object.assign(singleton, {
  DataCollector,
  create: (options?: DataCollectorOptions) => new DataCollector(options)
});

export default collectorModule;

module.exports = collectorModule;
module.exports.DataCollector = DataCollector;
module.exports.create = (options?: DataCollectorOptions) => new DataCollector(options);
