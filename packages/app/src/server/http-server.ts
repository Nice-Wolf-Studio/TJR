/**
 * HTTP API server for TJR Suite
 * Provides REST endpoints for Discord bot and other clients
 */

import express, { type Express, type Request, type Response } from 'express';
import type { Logger } from '@tjr/logger';
import type { IContainer } from '../container/types.js';
import { PromptProcessor } from '../services/prompt-processor.js';

export interface HttpServerConfig {
  port: number;
  host: string;
  logger: Logger;
  container: IContainer;
}

export interface AskRequest {
  prompt: string;
  userId?: string;
  channelId?: string;
}

export interface AskResponse {
  success: boolean;
  response?: string;
  error?: string;
}

/**
 * HTTP server for handling API requests
 */
export class HttpServer {
  private app: Express;
  private logger: Logger;
  private promptProcessor: PromptProcessor;
  private server?: ReturnType<Express['listen']>;

  constructor(private config: HttpServerConfig) {
    this.logger = config.logger;
    this.promptProcessor = new PromptProcessor({
      logger: config.logger.child({ service: 'prompt-processor' }),
    });
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Request logging
    this.app.use((req, _res, next) => {
      this.logger.debug('HTTP request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Ask endpoint
    this.app.post('/api/ask', async (req: Request, res: Response) => {
      try {
        const { prompt, userId, channelId } = req.body as AskRequest;

        if (!prompt || typeof prompt !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Invalid prompt: must be a non-empty string',
          } satisfies AskResponse);
          return;
        }

        this.logger.info('Processing ask request', {
          prompt: prompt.substring(0, 100),
          userId,
          channelId,
        });

        // TODO: Process the prompt using PromptProcessor service
        const response = await this.processPrompt(prompt, { userId, channelId });

        res.json({
          success: true,
          response,
        } satisfies AskResponse);
      } catch (error) {
        this.logger.error('Error processing ask request', { error });

        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        } satisfies AskResponse);
      }
    });

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  /**
   * Process a prompt using the PromptProcessor service
   */
  private async processPrompt(
    prompt: string,
    context: { userId?: string; channelId?: string }
  ): Promise<string> {
    return await this.promptProcessor.process(prompt, context);
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.logger.info('HTTP server started', {
            host: this.config.host,
            port: this.config.port,
            url: `http://${this.config.host}:${this.config.port}`,
          });
          resolve();
        });

        this.server.on('error', (error) => {
          this.logger.error('HTTP server error', { error });
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          this.logger.error('Error stopping HTTP server', { error });
          reject(error);
        } else {
          this.logger.info('HTTP server stopped');
          resolve();
        }
      });
    });
  }
}
