/**
 * MCP Client Service
 * Manages connections to multiple MCP servers and handles tool execution
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Logger } from '@tjr/logger';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface McpServerConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

export interface Tool {
  name: string;
  description?: string;
  inputSchema: object;
}

export interface ToolCall {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Service for managing MCP client connections
 */
export class McpClientService {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, Tool[]> = new Map(); // serverName -> tools
  private logger: Logger;
  private mcpConfig: McpConfig | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Initialize MCP clients from .mcp.json configuration
   */
  async initialize(configPath?: string): Promise<void> {
    try {
      // Default to .mcp.json in project root
      const mcpJsonPath = configPath || path.join(process.cwd(), '.mcp.json');

      this.logger.info('Loading MCP configuration', { path: mcpJsonPath });

      const configContent = await fs.readFile(mcpJsonPath, 'utf-8');
      this.mcpConfig = JSON.parse(configContent) as McpConfig;

      // Initialize each MCP server
      for (const [serverName, serverConfig] of Object.entries(this.mcpConfig.mcpServers)) {
        if (serverConfig.type !== 'stdio') {
          this.logger.warn('Only stdio MCP servers are supported', { serverName, type: serverConfig.type });
          continue;
        }

        await this.connectToServer(serverName, serverConfig);
      }

      this.logger.info('MCP clients initialized', {
        serverCount: this.clients.size,
        servers: Array.from(this.clients.keys())
      });
    } catch (error) {
      this.logger.error('Failed to initialize MCP clients', { error });
      throw error;
    }
  }

  /**
   * Connect to a single MCP server
   */
  private async connectToServer(serverName: string, config: McpServerConfig): Promise<void> {
    try {
      this.logger.info('Connecting to MCP server', { serverName, command: config.command });

      // Create client and transport
      const client = new Client({
        name: `tjr-suite-${serverName}`,
        version: '1.0.0',
      }, {
        capabilities: {},
      });

      // Create stdio transport with command
      const env = config.env ? { ...config.env } : undefined;
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env,
      });

      // Connect client to transport
      await client.connect(transport);

      // List available tools
      const toolsResponse = await client.listTools();
      const tools: Tool[] = toolsResponse.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));

      this.clients.set(serverName, client);
      this.tools.set(serverName, tools);

      this.logger.info('Connected to MCP server', {
        serverName,
        toolCount: tools.length,
        tools: tools.map(t => t.name)
      });
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', { serverName, error });
      throw error;
    }
  }

  /**
   * Get all available tools across all MCP servers
   * Returns tools in Anthropic API format with server prefix
   */
  getAllTools(): Array<{ name: string; description: string; input_schema: { type: 'object'; [key: string]: unknown } }> {
    const allTools: Array<{ name: string; description: string; input_schema: { type: 'object'; [key: string]: unknown } }> = [];

    for (const [serverName, tools] of this.tools.entries()) {
      for (const tool of tools) {
        // Ensure input_schema has a type property (must be literal 'object')
        const inputSchema = tool.inputSchema as Record<string, unknown>;
        if (!inputSchema['type']) {
          inputSchema['type'] = 'object' as const;
        }

        allTools.push({
          name: `${serverName}__${tool.name}`, // Prefix with server name
          description: tool.description || `Tool from ${serverName}`,
          input_schema: inputSchema as { type: 'object'; [key: string]: unknown },
        });
      }
    }

    return allTools;
  }

  /**
   * Execute a tool call on the appropriate MCP server
   */
  async executeTool(toolName: string, toolArguments: Record<string, unknown>): Promise<ToolResult> {
    try {
      // Parse server name from tool name (format: serverName__toolName)
      const [serverName, actualToolName] = toolName.split('__');

      if (!serverName || !actualToolName) {
        throw new Error(`Invalid tool name format: ${toolName}. Expected format: serverName__toolName`);
      }

      const client = this.clients.get(serverName);
      if (!client) {
        throw new Error(`MCP server not found: ${serverName}`);
      }

      this.logger.info('Executing tool', { serverName, toolName: actualToolName, arguments: toolArguments });

      const result = await client.callTool({
        name: actualToolName,
        arguments: toolArguments,
      });

      this.logger.info('Tool execution completed', {
        serverName,
        toolName: actualToolName,
        resultType: Array.isArray(result.content) && result.content.length > 0 ? result.content[0].type : 'unknown'
      });

      // Ensure content is properly typed
      const typedContent = Array.isArray(result.content)
        ? result.content.map(item => ({
            type: String(item.type || 'text'),
            text: String(item.type === 'text' && 'text' in item ? item.text : JSON.stringify(item))
          }))
        : [{ type: 'text', text: JSON.stringify(result.content) }];

      return {
        content: typedContent,
        isError: Boolean(result.isError),
      };
    } catch (error) {
      this.logger.error('Tool execution failed', { toolName, error });
      return {
        content: [{
          type: 'text',
          text: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        }],
        isError: true,
      };
    }
  }

  /**
   * Close all MCP client connections
   */
  async close(): Promise<void> {
    this.logger.info('Closing MCP clients', { count: this.clients.size });

    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        this.logger.debug('Closed MCP client', { serverName });
      } catch (error) {
        this.logger.error('Error closing MCP client', { serverName, error });
      }
    }

    this.clients.clear();
    this.tools.clear();
  }

  /**
   * Get server names
   */
  getServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get tools for a specific server
   */
  getServerTools(serverName: string): Tool[] {
    return this.tools.get(serverName) || [];
  }
}
