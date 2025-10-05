/**
 * HTTP API server for TJR Suite
 * Provides REST endpoints for Discord bot and other clients
 */

import express, { type Express, type Request, type Response } from 'express';
import type { Logger } from '@tjr/logger';
import type { IContainer } from '../container/types.js';
import { ClaudePromptProcessor } from '../services/claude-prompt-processor.js';
import { McpClientService } from '../services/mcp-client.service.js';
import { IntentClassifierService } from '../services/intent-classifier.service.js';
import { QueryLoggerService } from '../services/query-logger.service.js';
import { createClient } from '@supabase/supabase-js';
import { connect } from '@tjr-suite/db-simple';
import { MarketDataCacheWrapper } from '../services/market-data-cache-integration.js';

export interface HttpServerConfig {
  port: number;
  host: string;
  logger: Logger;
  container: IContainer;
  databaseUrl?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  mcpConfigPath?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

export interface AskRequest {
  prompt: string;
  userId?: string;
  channelId?: string;
  model?: 'claude' | 'openai';
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
  private promptProcessor?: ClaudePromptProcessor;
  private mcpClient?: McpClientService;
  private intentClassifier: IntentClassifierService;
  private server?: ReturnType<Express['listen']>;

  constructor(private config: HttpServerConfig) {
    this.logger = config.logger;
    this.intentClassifier = new IntentClassifierService();
    // Note: promptProcessor and mcpClient will be initialized in start()
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
        const { prompt, userId, channelId, model = 'claude' } = req.body as AskRequest;

        if (!prompt || typeof prompt !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Invalid prompt: must be a non-empty string',
          } satisfies AskResponse);
          return;
        }

        // Validate model parameter
        if (model !== 'claude' && model !== 'openai') {
          res.status(400).json({
            success: false,
            error: 'Invalid model: must be "claude" or "openai"',
          } satisfies AskResponse);
          return;
        }

        // Validate prompt intent (Phase 1C security validation)
        const validation = this.intentClassifier.validatePrompt(prompt);
        if (!validation.valid) {
          this.logger.warn('Rejected prompt due to invalid intent', {
            prompt: prompt.substring(0, 100),
            reason: validation.reason,
            userId,
            channelId,
            model,
            blockedKeywords: this.intentClassifier.getBlockedKeywords(prompt),
          });

          res.status(403).json({
            success: false,
            error: validation.reason || 'Prompt validation failed',
          } satisfies AskResponse);
          return;
        }

        this.logger.info('Processing ask request', {
          prompt: prompt.substring(0, 100),
          userId,
          channelId,
          model,
          tradingKeywords: this.intentClassifier.getTradingKeywords(prompt),
        });

        if (!this.promptProcessor) {
          res.status(503).json({
            success: false,
            error: 'Prompt processor not initialized. Please check ANTHROPIC_API_KEY configuration.',
          } satisfies AskResponse);
          return;
        }

        const response = await this.promptProcessor.process(prompt, { userId, channelId, model });

        // Echo the prompt at the beginning of the response
        const formattedResponse = `**Question:** ${prompt}\n\n${response}`;

        res.json({
          success: true,
          response: formattedResponse,
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
   * Start the HTTP server
   */
  async start(): Promise<void> {
    try {
      // Initialize Supabase client and query logger
      let queryLoggerService: QueryLoggerService | undefined;

      if (this.config.supabaseUrl && this.config.supabaseKey) {
        this.logger.info('Initializing Supabase client', {
          supabaseUrl: this.config.supabaseUrl,
        });

        const supabase = createClient(this.config.supabaseUrl, this.config.supabaseKey);

        queryLoggerService = new QueryLoggerService(
          supabase,
          this.logger.child({ service: 'query-logger' })
        );

        this.logger.info('Query logger service initialized');
      } else {
        this.logger.warn('No SUPABASE_URL or SUPABASE_KEY provided, query logging disabled');
      }

      // Initialize MCP client service
      if (this.config.anthropicApiKey) {
        this.logger.info('Initializing MCP client service');

        this.mcpClient = new McpClientService(
          this.logger.child({ service: 'mcp-client' })
        );

        await this.mcpClient.initialize(this.config.mcpConfigPath);

        // Initialize Claude prompt processor with MCP tools, query logger, and OpenAI fallback
        this.promptProcessor = new ClaudePromptProcessor({
          logger: this.logger.child({ service: 'claude-prompt-processor' }),
          mcpClientService: this.mcpClient,
          anthropicApiKey: this.config.anthropicApiKey,
          openaiApiKey: this.config.openaiApiKey,
          queryLoggerService,
        });

        this.logger.info('Claude prompt processor initialized with MCP tools', {
          hasOpenAIFallback: !!this.config.openaiApiKey,
        });
      } else {
        this.logger.warn('No ANTHROPIC_API_KEY provided, /ask endpoint will not work');
      }

      // Initialize database and cache if database URL is provided (for future use)
      if (this.config.databaseUrl) {
        this.logger.info('Initializing database and cache', {
          databaseUrl: this.config.databaseUrl.replace(/:[^:@]+@/, ':***@'), // Redact password
        });

        const db = await connect(this.config.databaseUrl);
        const marketDataCache = new MarketDataCacheWrapper({
          db,
          logger: this.logger.child({ service: 'market-data-cache' }),
          memoryCacheSizeBars: 10000,
          memoryCacheSizeQuotes: 1000,
          providerPriority: ['databento'],
        });

        await marketDataCache.initialize();

        this.logger.info('Market data cache initialized successfully');
      } else {
        this.logger.info('No database URL provided, running without cache');
      }
    } catch (error) {
      this.logger.error('Failed to initialize services', { error });
      this.logger.info('Continuing with available services...');
    }

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
    // Close MCP clients first
    if (this.mcpClient) {
      await this.mcpClient.close();
    }

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
