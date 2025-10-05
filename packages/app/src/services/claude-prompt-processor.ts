/**
 * Claude-powered Prompt Processor with MCP Integration
 * Processes natural language prompts using Claude API with access to MCP tools
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { Logger } from '@tjr/logger';
import type { McpClientService } from './mcp-client.service.js';
import type { QueryLoggerService } from './query-logger.service.js';

export interface ClaudePromptProcessorConfig {
  logger: Logger;
  mcpClientService: McpClientService;
  anthropicApiKey: string;
  openaiApiKey?: string;
  queryLoggerService?: QueryLoggerService;
  model?: string;
  maxTokens?: number;
}

export interface PromptContext {
  userId?: string;
  channelId?: string;
  model?: 'claude' | 'openai';
}

interface ConversationHistory {
  messages: Anthropic.MessageParam[];
  lastActivity: Date;
}

/**
 * Service for processing natural language prompts using Claude with MCP tools
 */
export class ClaudePromptProcessor {
  private logger: Logger;
  private mcpClient: McpClientService;
  private anthropic: Anthropic;
  private openai?: OpenAI;
  private queryLogger?: QueryLoggerService;
  private model: string;
  private maxTokens: number;
  private conversations: Map<string, ConversationHistory> = new Map();
  private maxHistoryMessages = 50; // Keep last 50 messages to prevent token overflow
  private conversationTimeoutMs = 60 * 60 * 1000; // 1 hour

  constructor(config: ClaudePromptProcessorConfig) {
    this.logger = config.logger;
    this.mcpClient = config.mcpClientService;
    this.queryLogger = config.queryLoggerService;
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });

    // Initialize OpenAI if API key provided (fallback)
    if (config.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: config.openaiApiKey,
      });
      this.logger.info('OpenAI fallback enabled', { service: 'claude-prompt-processor' });
    }

    this.model = config.model || 'claude-sonnet-4-5';
    this.maxTokens = config.maxTokens || 4096;
  }

  /**
   * Process a prompt and return a response using Claude or OpenAI with MCP tools
   */
  async process(prompt: string, context: PromptContext): Promise<string> {
    const conversationId = this.buildConversationId(context);
    const startTime = Date.now();
    const toolsUsed: string[] = [];
    const selectedModel = context.model || 'claude';

    this.logger.info('Processing prompt with AI + MCP', {
      prompt: prompt.substring(0, 100),
      context,
      conversationId,
      selectedModel,
      defaultModel: this.model,
    });

    // If user explicitly requested OpenAI, use it directly
    if (selectedModel === 'openai') {
      if (!this.openai) {
        throw new Error('OpenAI not configured. Please check OPENAI_API_KEY.');
      }
      return await this.processWithOpenAI(prompt, context, conversationId, startTime, toolsUsed);
    }

    // Otherwise use Claude (default)
    try {
      // Get all available tools from MCP servers
      const tools = this.mcpClient.getAllTools();

      this.logger.info('Available MCP tools', {
        toolCount: tools.length,
        tools: tools.map(t => t.name)
      });

      // Build system prompt with context
      const systemPrompt = this.buildSystemPrompt(context);

      // Get existing conversation history or start new
      const messages = this.getConversationHistory(conversationId);

      // Add new user message to history
      messages.push({
        role: 'user',
        content: prompt,
      });

      // Agentic loop: Claude can make multiple tool calls
      let response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        tools,
      });

      this.logger.info('Claude response', {
        stopReason: response.stop_reason,
        contentBlocks: response.content.length,
      });

      // Handle tool use iterations
      let iterationCount = 0;
      const maxIterations = 10; // Prevent infinite loops

      while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
        iterationCount++;

        this.logger.info('Claude requested tool use', {
          iteration: iterationCount,
          contentBlocks: response.content.length,
        });

        // Add Claude's response to message history
        messages.push({
          role: 'assistant',
          content: response.content,
        });

        // Execute all tool calls
        const toolResults: Anthropic.MessageParam = {
          role: 'user',
          content: [],
        };

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            this.logger.info('Executing tool', {
              toolId: block.id,
              toolName: block.name,
              arguments: block.input,
            });

            // Track tool usage
            if (!toolsUsed.includes(block.name)) {
              toolsUsed.push(block.name);
            }

            const result = await this.mcpClient.executeTool(
              block.name,
              block.input as Record<string, unknown>
            );

            // Add tool result to response
            (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content.map(c => c.text).join('\n'),
              is_error: result.isError,
            });

            this.logger.info('Tool executed', {
              toolId: block.id,
              toolName: block.name,
              isError: result.isError,
            });
          }
        }

        // Add tool results to message history
        messages.push(toolResults);

        // Get next response from Claude
        response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages,
          tools,
        });

        this.logger.info('Claude follow-up response', {
          iteration: iterationCount,
          stopReason: response.stop_reason,
          contentBlocks: response.content.length,
        });
      }

      // Extract final text response
      const finalResponse = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      if (!finalResponse) {
        this.logger.warn('No text response from Claude', {
          stopReason: response.stop_reason,
          iterations: iterationCount,
        });
        return 'I processed your request but could not generate a response. Please try rephrasing your question.';
      }

      // Add assistant's final response to conversation history
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      // Update conversation history
      this.updateConversationHistory(conversationId, messages);

      const latencyMs = Date.now() - startTime;

      this.logger.info('Prompt processed successfully', {
        conversationId,
        iterations: iterationCount,
        responseLength: finalResponse.length,
        totalMessages: messages.length,
        latencyMs,
        toolsUsed,
      });

      // Log successful query
      if (this.queryLogger) {
        await this.queryLogger.logQuery({
          user_id: context.userId,
          channel_id: context.channelId,
          conversation_id: conversationId,
          prompt,
          response: finalResponse,
          success: true,
          latency_ms: latencyMs,
          iteration_count: iterationCount,
          tools_used: toolsUsed.length > 0 ? toolsUsed : undefined,
        });
      }

      return finalResponse;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check if this is a rate limit error and we have OpenAI fallback
      const isRateLimitError =
        error instanceof Anthropic.APIError &&
        (error.status === 429 || error.message.includes('rate limit'));

      if (isRateLimitError && this.openai) {
        this.logger.warn('Claude rate limit hit, falling back to OpenAI', {
          error: errorMessage,
          conversationId,
        });

        try {
          return await this.processWithOpenAI(prompt, context, conversationId, startTime, toolsUsed);
        } catch (openaiError) {
          this.logger.error('OpenAI fallback also failed', { error: openaiError });
          // Continue to standard error handling below
        }
      }

      this.logger.error('Error processing prompt with Claude', { error });

      // Log failed query
      if (this.queryLogger) {
        await this.queryLogger.logQuery({
          user_id: context.userId,
          channel_id: context.channelId,
          conversation_id: conversationId,
          prompt,
          success: false,
          error: errorMessage,
          latency_ms: latencyMs,
          tools_used: toolsUsed.length > 0 ? toolsUsed : undefined,
        });
      }

      if (error instanceof Anthropic.APIError) {
        if (error.status === 429) {
          return `I'm currently experiencing rate limits. ${
            this.openai ? 'Fallback system also unavailable.' : 'Please try again in a few minutes.'
          }`;
        }
        return `I encountered an API error: ${error.message}. Please try again.`;
      }

      return `Sorry, I encountered an error processing your request: ${errorMessage}`;
    }
  }

  /**
   * Process prompt using OpenAI as fallback
   */
  private async processWithOpenAI(
    prompt: string,
    context: PromptContext,
    conversationId: string,
    startTime: number,
    toolsUsed: string[]
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    this.logger.info('Processing with OpenAI fallback', { conversationId });

    // Get conversation history (compatible format)
    const messages = this.getConversationHistory(conversationId);

    // Convert Anthropic messages to OpenAI format
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        openaiMessages.push({
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === 'assistant') {
        // Extract text from Anthropic format
        const content = Array.isArray(msg.content)
          ? msg.content
              .filter((block: any) => block.type === 'text')
              .map((block: any) => block.text)
              .join('\n')
          : typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content);

        openaiMessages.push({
          role: 'assistant',
          content,
        });
      }
    }

    // Add new user message
    openaiMessages.push({
      role: 'user',
      content: prompt,
    });

    // Get tools in OpenAI format
    const tools = this.mcpClient.getAllTools();
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema as Record<string, unknown>,
      },
    }));

    this.logger.info('Calling OpenAI with tools', {
      model: 'gpt-4o',
      messageCount: openaiMessages.length,
      toolCount: openaiTools.length,
    });

    // Call OpenAI with tools
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: this.buildSystemPrompt(context),
        },
        ...openaiMessages,
      ],
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      max_tokens: this.maxTokens,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    // Handle tool calls if present
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      this.logger.info('OpenAI requested tool calls', {
        count: choice.message.tool_calls.length,
      });

      // Execute tools
      const toolResults: string[] = [];

      for (const toolCall of choice.message.tool_calls) {
        // Only handle function tool calls
        if (toolCall.type !== 'function') {
          continue;
        }

        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        this.logger.info('Executing tool for OpenAI', {
          toolName,
          arguments: toolArgs,
        });

        // Track tool usage
        if (!toolsUsed.includes(toolName)) {
          toolsUsed.push(toolName);
        }

        const result = await this.mcpClient.executeTool(toolName, toolArgs);
        toolResults.push(result.content.map((c) => c.text).join('\n'));
      }

      // Make second call with tool results
      const followUpResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt(context),
          },
          ...openaiMessages,
          choice.message,
          {
            role: 'user',
            content: `Tool results:\n${toolResults.join('\n\n')}`,
          },
        ],
        max_tokens: this.maxTokens,
      });

      const finalChoice = followUpResponse.choices[0];
      const finalResponse = finalChoice?.message.content || 'No response generated';

      const latencyMs = Date.now() - startTime;

      this.logger.info('OpenAI fallback successful', {
        conversationId,
        latencyMs,
        toolsUsed,
        provider: 'openai',
      });

      // Log successful query with OpenAI provider
      if (this.queryLogger) {
        await this.queryLogger.logQuery({
          user_id: context.userId,
          channel_id: context.channelId,
          conversation_id: conversationId,
          prompt,
          response: finalResponse,
          success: true,
          latency_ms: latencyMs,
          tools_used: [...toolsUsed, 'provider:openai'],
        });
      }

      return finalResponse;
    }

    // No tool calls, return direct response
    const finalResponse = choice.message.content || 'No response generated';
    const latencyMs = Date.now() - startTime;

    this.logger.info('OpenAI fallback successful', {
      conversationId,
      latencyMs,
      provider: 'openai',
    });

    // Log successful query
    if (this.queryLogger) {
      await this.queryLogger.logQuery({
        user_id: context.userId,
        channel_id: context.channelId,
        conversation_id: conversationId,
        prompt,
        response: finalResponse,
        success: true,
        latency_ms: latencyMs,
        tools_used: ['provider:openai'],
      });
    }

    return finalResponse;
  }

  /**
   * Build conversation ID from context
   */
  private buildConversationId(context: PromptContext): string {
    // Use userId_channelId if both available, otherwise fallback to one or generate random
    if (context.userId && context.channelId) {
      return `${context.userId}_${context.channelId}`;
    }
    if (context.userId) {
      return context.userId;
    }
    if (context.channelId) {
      return context.channelId;
    }
    // Fallback to random ID for edge cases
    return `anon_${Date.now()}`;
  }

  /**
   * Get or create conversation history
   */
  private getConversationHistory(conversationId: string): Anthropic.MessageParam[] {
    this.cleanupStaleConversations();

    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      this.logger.debug('Retrieved existing conversation', {
        conversationId,
        messageCount: conversation.messages.length,
      });
      return conversation.messages;
    }

    this.logger.debug('Starting new conversation', { conversationId });
    return [];
  }

  /**
   * Update conversation history
   */
  private updateConversationHistory(
    conversationId: string,
    messages: Anthropic.MessageParam[]
  ): void {
    // Trim to max history length
    const trimmedMessages = messages.slice(-this.maxHistoryMessages);

    this.conversations.set(conversationId, {
      messages: trimmedMessages,
      lastActivity: new Date(),
    });

    this.logger.debug('Updated conversation history', {
      conversationId,
      messageCount: trimmedMessages.length,
    });
  }

  /**
   * Clean up stale conversations
   */
  private cleanupStaleConversations(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [conversationId, conversation] of this.conversations.entries()) {
      const age = now - conversation.lastActivity.getTime();
      if (age > this.conversationTimeoutMs) {
        this.conversations.delete(conversationId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info('Cleaned up stale conversations', {
        count: cleanedCount,
        activeConversations: this.conversations.size,
      });
    }
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(context: PromptContext): string {
    const basePrompt = `You are TJR Assistant, a specialized AI assistant for trading analysis and market data queries.

**STRICT SCOPE: TRADING ONLY**
You are LIMITED to answering questions about:
- Market data and analysis (ES, NQ, SPY, etc.)
- Trading strategies, setups, and execution
- TJR analysis methodology (day profiles, session extremes, bias)
- Market structure (support, resistance, trends, ranges)
- Trading journals and performance tracking

You have access to various tools through MCP (Model Context Protocol):
- Databento: Market data queries (quotes, historical bars, symbology)
- Wolf Governance: Journal writing, PR validation, policy enforcement
- Wolf Evals: Metrics collection and analysis
- GitHub: Repository operations (READ-ONLY for trading data)
- Discord: Discord channel operations

**SECURITY BOUNDARIES**
You MUST REFUSE to:
1. Access or modify database schemas, tables, or infrastructure
2. Perform administrative operations (deploy, restart, configure)
3. Access user credentials, tokens, or authentication systems
4. Execute code, scripts, or system commands
5. Modify GitHub repositories (PRs, commits, merges)
6. Perform file system operations
7. Answer general knowledge questions unrelated to trading

**SUPABASE USAGE RULES**
- ONLY query Supabase for trading-related data (market data, trading journals, TJR analysis)
- NEVER access user tables, auth tables, or system tables
- NEVER perform INSERT, UPDATE, DELETE operations without explicit user confirmation
- ALWAYS use read-only queries when possible

When answering questions:
1. Use the appropriate tools to gather accurate, real-time information
2. Provide clear, concise responses
3. Format market data in a readable way (use Discord markdown)
4. Cite data sources when relevant
5. If a question is outside your trading scope, politely decline and explain your limitations

Current context:
${context.userId ? `- User ID: ${context.userId}` : ''}
${context.channelId ? `- Channel ID: ${context.channelId}` : ''}

Be helpful, accurate, and professional within your trading analysis scope.`;

    return basePrompt;
  }
}
