/**
 * Claude-powered Prompt Processor with MCP Integration
 * Processes natural language prompts using Claude API with access to MCP tools
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '@tjr/logger';
import type { McpClientService } from './mcp-client.service.js';

export interface ClaudePromptProcessorConfig {
  logger: Logger;
  mcpClientService: McpClientService;
  anthropicApiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface PromptContext {
  userId?: string;
  channelId?: string;
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
  private model: string;
  private maxTokens: number;
  private conversations: Map<string, ConversationHistory> = new Map();
  private maxHistoryMessages = 50; // Keep last 50 messages to prevent token overflow
  private conversationTimeoutMs = 60 * 60 * 1000; // 1 hour

  constructor(config: ClaudePromptProcessorConfig) {
    this.logger = config.logger;
    this.mcpClient = config.mcpClientService;
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
    this.model = config.model || 'claude-sonnet-4-5';
    this.maxTokens = config.maxTokens || 4096;
  }

  /**
   * Process a prompt and return a response using Claude with MCP tools
   */
  async process(prompt: string, context: PromptContext): Promise<string> {
    const conversationId = this.buildConversationId(context);

    this.logger.info('Processing prompt with Claude + MCP', {
      prompt: prompt.substring(0, 100),
      context,
      conversationId,
      model: this.model,
    });

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

      this.logger.info('Prompt processed successfully', {
        conversationId,
        iterations: iterationCount,
        responseLength: finalResponse.length,
        totalMessages: messages.length,
      });

      return finalResponse;
    } catch (error) {
      this.logger.error('Error processing prompt with Claude', { error });

      if (error instanceof Anthropic.APIError) {
        return `I encountered an API error: ${error.message}. Please try again.`;
      }

      return `Sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
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
    const basePrompt = `You are TJR Assistant, a helpful AI assistant for the TJR Suite trading analysis platform.

You have access to various tools through MCP (Model Context Protocol):
- Databento: Market data queries (quotes, historical bars, symbology)
- Wolf Governance: Journal writing, PR validation, policy enforcement
- Wolf Evals: Metrics collection and analysis
- GitHub: Repository operations
- Discord: Discord channel operations

When answering questions:
1. Use the appropriate tools to gather accurate, real-time information
2. Provide clear, concise responses
3. Format market data in a readable way (use Discord markdown)
4. Cite data sources when relevant
5. If you cannot answer, explain why

Current context:
${context.userId ? `- User ID: ${context.userId}` : ''}
${context.channelId ? `- Channel ID: ${context.channelId}` : ''}

Be helpful, accurate, and professional.`;

    return basePrompt;
  }
}
