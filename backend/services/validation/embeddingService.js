/**
 * Embedding Generation Service
 *
 * Generates vector embeddings for narrative text using AI models.
 * Currently configured for OpenAI's text-embedding-ada-002 (1536 dimensions).
 *
 * TODO: Replace stub with real API integration when keys are configured.
 *
 * @module services/validation/embeddingService
 */

import logger from '../../logger.js';

// Configuration (will be moved to config file)
const EMBEDDING_CONFIG = {
  provider: process.env.EMBEDDING_PROVIDER || 'openai', // 'openai' | 'anthropic' | 'mock'
  model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
  dimensions: 1536, // OpenAI ada-002 dimensions
  max_tokens: 8191,  // OpenAI ada-002 max input tokens
  api_key: process.env.OPENAI_API_KEY || null
};

/**
 * Generates embedding vector for given text.
 *
 * @param {string} text - Text to embed
 * @param {Object} [options] - Embedding options
 * @param {string} [options.provider] - Override default provider
 * @param {string} [options.model] - Override default model
 * @returns {Promise<Array<number>>} Embedding vector (1536-dim for OpenAI)
 *
 * @example
 * const embedding = await generateEmbedding("John was an excellent team member");
 * // Returns: [0.123, -0.456, 0.789, ...] (1536 numbers)
 */
export async function generateEmbedding(text, options = {}) {
  const provider = options.provider || EMBEDDING_CONFIG.provider;

  if (!text || text.length < 10) {
    throw new Error('Text too short for embedding generation (minimum 10 characters)');
  }

  // Truncate if too long (rough approximation: 4 chars per token)
  const maxChars = EMBEDDING_CONFIG.max_tokens * 4;
  const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

  logger.debug('Generating embedding', {
    provider,
    text_length: truncatedText.length,
    model: EMBEDDING_CONFIG.model
  });

  switch (provider) {
    case 'openai':
      return await generateOpenAIEmbedding(truncatedText, options);

    case 'anthropic':
      // TODO: Implement Anthropic embedding generation
      logger.warn('Anthropic embeddings not yet implemented, falling back to mock');
      return generateMockEmbedding(truncatedText);

    case 'mock':
    default:
      return generateMockEmbedding(truncatedText);
  }
}

/**
 * Generates embedding using OpenAI API.
 *
 * @private
 * @param {string} text - Text to embed
 * @param {Object} options - Options
 * @returns {Promise<Array<number>>} Embedding vector
 */
async function generateOpenAIEmbedding(text, options) {
  const apiKey = EMBEDDING_CONFIG.api_key;

  if (!apiKey || apiKey === 'your-api-key-here') {
    logger.warn('OpenAI API key not configured, using mock embedding');
    return generateMockEmbedding(text);
  }

  try {
    // TODO: Replace with actual OpenAI API call when ready for production
    // For now, this is a stub that would make the real API call

    /*
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: text,
        model: options.model || EMBEDDING_CONFIG.model
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
    */

    // For now, return mock embedding with clear logging
    logger.info('OpenAI embedding generation (STUB - replace with real API call)');
    return generateMockEmbedding(text);

  } catch (error) {
    logger.error('OpenAI embedding generation failed', { error: error.message });
    throw new Error(`Failed to generate OpenAI embedding: ${error.message}`);
  }
}

/**
 * Generates deterministic mock embedding for testing.
 *
 * Uses a simple hash-based approach to create reproducible embeddings.
 * NOT suitable for production use.
 *
 * @private
 * @param {string} text - Text to embed
 * @returns {Array<number>} Mock embedding vector (1536-dim)
 */
function generateMockEmbedding(text) {
  const dimensions = EMBEDDING_CONFIG.dimensions;
  const embedding = new Array(dimensions);

  // Simple hash function for reproducibility
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate pseudo-random but deterministic values
  for (let i = 0; i < dimensions; i++) {
    // Use hash + index as seed for each dimension
    const seed = hash + i;
    const rand = Math.sin(seed) * 10000;
    embedding[i] = (rand - Math.floor(rand)) * 2 - 1; // Normalize to [-1, 1]
  }

  logger.debug('Generated mock embedding', {
    dimensions,
    text_preview: text.substring(0, 50)
  });

  return embedding;
}

/**
 * Calculates cosine similarity between two embedding vectors.
 *
 * @param {Array<number>} vec1 - First embedding vector
 * @param {Array<number>} vec2 - Second embedding vector
 * @returns {number} Cosine similarity (0 to 1)
 *
 * @example
 * const similarity = cosineSimilarity(embedding1, embedding2);
 * // Returns: 0.85 (85% similar)
 */
export function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    throw new Error('Invalid embedding vectors for similarity calculation');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Checks if embedding service is properly configured.
 *
 * @returns {Object} Configuration status
 */
export function getEmbeddingServiceStatus() {
  return {
    provider: EMBEDDING_CONFIG.provider,
    model: EMBEDDING_CONFIG.model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    api_key_configured: !!(EMBEDDING_CONFIG.api_key && EMBEDDING_CONFIG.api_key !== 'your-api-key-here'),
    ready: EMBEDDING_CONFIG.provider === 'mock' || !!EMBEDDING_CONFIG.api_key
  };
}

export default {
  generateEmbedding,
  cosineSimilarity,
  getEmbeddingServiceStatus
};
