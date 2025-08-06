/**
 * Centralized model configuration
 * Single source of truth for all model-related settings
 */

// Model pricing configuration (USD per 1M tokens)
export const PRICING = {
  'claude-3-opus-20241022': {
    input: 15.00,
    output: 75.00,
    name: 'Claude 3 Opus'
  },
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    name: 'Claude Opus 4'
  },
  'claude-opus-4-1-20250805': {
    input: 15.00,
    output: 75.00,
    name: 'Claude Opus 4.1'
  },
  'claude-sonnet-4-20250514': {
    input: 2.25,
    output: 11.25,
    name: 'Claude Sonnet 4'
  },
  'claude-3-5-sonnet-20241022': {
    input: 3.00,
    output: 15.00,
    name: 'Claude 3.5 Sonnet'
  },
  'claude-3-5-haiku-20241022': {
    input: 1.00,
    output: 5.00,
    name: 'Claude 3.5 Haiku'
  },
  'claude-3-haiku-20240307': {
    input: 0.25,
    output: 1.25,
    name: 'Claude 3 Haiku'
  }
};

// Model context window sizes
export const CONTEXT_WINDOWS = {
  'claude-3-opus-20241022': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-opus-4-1-20250805': 200_000,
  'claude-sonnet-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-haiku-20240307': 200_000,
  'claude-2.1': 200_000,
  'claude-2.0': 100_000,
  'claude-instant-1.2': 100_000
};

// Default pricing for unknown models
export const DEFAULT_PRICING = {
  input: 3.00,
  output: 15.00,
  name: 'Unknown Model'
};

// Default context window size
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Get model display name
 * @param {string} model - Model identifier
 * @returns {string} Display name
 */
export function getModelName(model) {
  const info = PRICING[model];
  return info ? info.name : DEFAULT_PRICING.name;
}

/**
 * Get model pricing information
 * @param {string} model - Model identifier
 * @returns {object} Pricing information
 */
export function getModelPricing(model) {
  return PRICING[model] || DEFAULT_PRICING;
}

/**
 * Get model context window size
 * @param {string} model - Model identifier
 * @returns {number} Context window size
 */
export function getContextWindow(model) {
  return CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
}

/**
 * Calculate message cost based on usage
 * @param {string} model - Model identifier
 * @param {object} usage - Token usage object
 * @returns {number} Total cost in USD
 */
export function calculateMessageCost(model, usage) {
  if (!usage) return 0;
  
  const pricing = getModelPricing(model);
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheTokens = usage.cache_read_input_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
  
  // Cache tokens cost 10% of input token price
  const effectiveInputTokens = inputTokens + cacheCreationTokens + (cacheTokens * 0.1);
  
  const inputCost = (effectiveInputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Calculate usage percentage for a model
 * @param {string} model - Model identifier
 * @param {number} totalTokens - Total tokens used
 * @returns {number} Usage percentage
 */
export function calculateUsagePercentage(model, totalTokens) {
  const contextWindow = getContextWindow(model);
  return (totalTokens / contextWindow) * 100;
}