/**
 * Ask command handler
 * Sends natural language prompts to the API server for processing
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '../types/index.js';
import { askSchema, type AskResponse } from '../schemas/ask.js';

/**
 * API server configuration
 * TODO: Make this configurable via environment variables
 */
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Send prompt to API server
 */
async function sendPromptToAPI(prompt: string, userId: string, channelId: string): Promise<AskResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        userId,
        channelId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `API error: ${response.status} ${errorText}`,
      };
    }

    return (await response.json()) as AskResponse;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error connecting to API',
    };
  }
}

/**
 * Ask command handler
 */
export async function askHandler(interaction: ChatInputCommandInteraction): Promise<void> {
  // Defer reply since processing might take a while
  await interaction.deferReply();

  const prompt = interaction.options.getString('prompt', true);
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  try {
    // Send prompt to API server
    const result = await sendPromptToAPI(prompt, userId, channelId);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Error: ${result.error || 'Unknown error'}`,
      });
      return;
    }

    // Send successful response
    await interaction.editReply({
      content: result.response || 'No response from API',
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

/**
 * Ask command definition
 */
export const askCommand: Command = {
  schema: askSchema,
  handler: askHandler,
};
