/**
 * Centralized model configuration
 * Single source of truth for all model-related settings
 */

import type { ModelPricing } from "../types/index.js";

interface PricingInfo extends ModelPricing {
  input: number;
  output: number;
  name: string;
}

interface PricingConfig {
  [key: string]: PricingInfo;
}

interface ContextWindowConfig {
  [key: string]: number;
}

interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// Model pricing configuration (USD per 1M tokens)
export const PRICING: PricingConfig = {
  "claude-3-opus-20241022": {
    input: 15.0,
    output: 75.0,
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    name: "Claude 3 Opus",
  },
  "claude-opus-4-20250514": {
    input: 15.0,
    output: 75.0,
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    name: "Claude Opus 4",
  },
  "claude-opus-4-1-20250805": {
    input: 15.0,
    output: 75.0,
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    name: "Claude Opus 4.1",
  },
  "claude-sonnet-4-20250514": {
    input: 2.25,
    output: 11.25,
    inputPerMillion: 2.25,
    outputPerMillion: 11.25,
    name: "Claude Sonnet 4",
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    name: "Claude 3.5 Sonnet",
  },
  "claude-3-5-haiku-20241022": {
    input: 1.0,
    output: 5.0,
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    name: "Claude 3.5 Haiku",
  },
  "claude-3-haiku-20240307": {
    input: 0.25,
    output: 1.25,
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
    name: "Claude 3 Haiku",
  },
};

// Model context window sizes
export const CONTEXT_WINDOWS: ContextWindowConfig = {
  "claude-3-opus-20241022": 200_000,
  "claude-opus-4-20250514": 200_000,
  "claude-opus-4-1-20250805": 200_000,
  "claude-sonnet-4-20250514": 200_000,
  "claude-3-5-sonnet-20241022": 200_000,
  "claude-3-5-haiku-20241022": 200_000,
  "claude-3-haiku-20240307": 200_000,
  "claude-2.1": 200_000,
  "claude-2.0": 100_000,
  "claude-instant-1.2": 100_000,
};

// Default pricing for unknown models
export const DEFAULT_PRICING: PricingInfo = {
  input: 3.0,
  output: 15.0,
  inputPerMillion: 3.0,
  outputPerMillion: 15.0,
  name: "Unknown Model",
};

// Default context window size
export const DEFAULT_CONTEXT_WINDOW: number = 200_000;

/**
 * Get model display name
 */
export function getModelName(model: string): string {
  const info = PRICING[model];
  return info ? info.name : DEFAULT_PRICING.name;
}

/**
 * Get model pricing information
 */
export function getModelPricing(model: string): PricingInfo {
  return PRICING[model] || DEFAULT_PRICING;
}

/**
 * Get model context window size
 */
export function getContextWindow(model: string): number {
  return CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
}

/**
 * Calculate message cost based on usage
 */
export function calculateMessageCost(model: string, usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;

  const pricing = getModelPricing(model);
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheTokens = usage.cache_read_input_tokens || 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;

  // Cache tokens cost 10% of input token price
  const effectiveInputTokens = inputTokens + cacheCreationTokens + cacheTokens * 0.1;

  const inputCost = (effectiveInputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Calculate usage percentage for a model
 */
export function calculateUsagePercentage(model: string, totalTokens: number): number {
  const contextWindow = getContextWindow(model);
  return (totalTokens / contextWindow) * 100;
}
