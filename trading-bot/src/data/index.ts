import logger from '../utils/logger';

export interface PipelineComponentStatus {
  initialized: boolean;
  running: boolean;
}

export interface HealthCheckResult {
  status: 'healthy' | 'idle';
  timestamp: string;
  pipeline: PipelineComponentStatus;
}

class DataPipeline {
  private initialized = false;
  private running = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Data pipeline already initialized');
      return;
    }

    logger.info('Initializing lightweight data pipeline');
    this.initialized = true;
  }

  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.running) {
      logger.warn('Data pipeline already running');
      return;
    }

    logger.info('Starting lightweight data pipeline');
    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info('Stopping data pipeline');
    this.running = false;
  }

  async shutdown(): Promise<void> {
    await this.stop();
    this.initialized = false;
    logger.info('Data pipeline shut down');
  }

  getStatus(): PipelineComponentStatus {
    return {
      initialized: this.initialized,
      running: this.running
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const status: HealthCheckResult = {
      status: this.running ? 'healthy' : 'idle',
      timestamp: new Date().toISOString(),
      pipeline: this.getStatus()
    };

    return status;
  }
}

const dataPipeline = new DataPipeline();

process.once('SIGINT', async () => {
  await dataPipeline.shutdown();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await dataPipeline.shutdown();
  process.exit(0);
});

export default dataPipeline;
module.exports = dataPipeline;
