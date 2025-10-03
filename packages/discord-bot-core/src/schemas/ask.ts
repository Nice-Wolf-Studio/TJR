/**
 * Ask command schema
 * Allows users to ask natural language questions about market data
 */

import type { CommandSchema } from '../types/index.js';

export const askSchema: CommandSchema = {
  name: 'ask',
  description: 'Ask a question about market data and analysis',
  dmPermission: true,
  options: [
    {
      type: 3, // STRING
      name: 'prompt',
      description: 'Your question (e.g., "What is the ES bias?" or "Give me the current NQ quote")',
      required: true,
      minLength: 1,
      maxLength: 500,
    },
  ],
};

/**
 * Ask response structure
 */
export interface AskResponse {
  success: boolean;
  response?: string;
  error?: string;
}
