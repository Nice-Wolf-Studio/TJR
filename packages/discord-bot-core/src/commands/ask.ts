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
 * Discord message character limit
 */
const DISCORD_MESSAGE_LIMIT = 2000;

/**
 * Split long message into chunks that fit Discord's character limit
 * Tries to split at paragraph breaks first, then sentence breaks
 */
function chunkMessage(content: string, maxLength: number = DISCORD_MESSAGE_LIMIT): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at paragraph break (double newline)
    let splitIndex = remaining.lastIndexOf('\n\n', maxLength);

    // If no paragraph break, try single newline
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }

    // If no newline, try sentence break
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf('. ', maxLength);
      if (splitIndex !== -1) splitIndex += 1; // Include the period
    }

    // If no sentence break, try space
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }

    // Last resort: hard cut at maxLength
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Send prompt to API server
 */
async function sendPromptToAPI(
  prompt: string,
  userId: string,
  channelId: string,
  model?: string
): Promise<AskResponse> {
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
        model: model || 'claude',
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
  // Send immediate response to prevent timeout (Discord invalidates interaction after 3 seconds)
  // We'll edit this message with the actual results once processing completes
  await interaction.reply({ content: '🔄 Calculating...' });

  const prompt = interaction.options.getString('prompt', true);
  const model = interaction.options.getString('model') || 'claude';
  const userId = interaction.user.id;
  const channelId = interaction.channelId;

  try {
    // Send prompt to API server
    const result = await sendPromptToAPI(prompt, userId, channelId, model);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Error: ${result.error || 'Unknown error'}`,
      });
      return;
    }

    const responseText = result.response || 'No response from API';

    // Split response into chunks if it exceeds Discord's limit
    const chunks = chunkMessage(responseText);

    // Edit the initial reply with the first chunk
    await interaction.editReply({
      content: chunks[0],
    });

    // Send remaining chunks as follow-up messages
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({
        content: chunks[i],
      });
    }
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
