import Anthropic from '@anthropic-ai/sdk';
import config from '../config.js';

let anthropicClient = null;

function getClient() {
  if (!anthropicClient) {
    if (config.apiKey && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = config.apiKey;
    }
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

function extractJsonOrText(text) {
  const safeText = text || '';
  // Try to extract JSON from markdown code blocks first
  const jsonMatch = safeText.match(/```json\s*([\s\S]*?)```/) || safeText.match(/```\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse((jsonMatch[1] || '').trim());
    } catch {
      // fall through
    }
  }
  // Try to parse the entire text as JSON
  try {
    return JSON.parse(safeText.trim());
  } catch {
    // fall through
  }
  // Try to find a JSON object in the text
  const objectMatch = safeText.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1].trim());
    } catch {
      // fall through
    }
  }
  return safeText;
}

/**
 * Call Claude API with system + user prompts. Returns parsed JSON or raw text.
 */
export async function callClaude(systemPrompt, userPrompt, maxTokens = 4000) {
  if (!config.apiKey && !process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is missing in backend .env');
  }

  const client = getClient();
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
      return extractJsonOrText(text);
    } catch (error) {
      lastError = error;
      const statusCode = error.status || error.response?.status;
      const isRetryable =
        error.error?.error?.type === 'overloaded_error' ||
        statusCode === 429 ||
        statusCode === 529 ||
        statusCode === 500 ||
        statusCode === 502 ||
        statusCode === 503;

      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        console.warn(`  Agent retry ${attempt}/${MAX_RETRIES} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }

  throw lastError || new Error('Claude API call failed after retries');
}
