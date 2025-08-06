import { PRICING, getModelName as getModelNameFromConfig, getModelPricing } from './model-config.mjs';

// Re-export PRICING for backward compatibility
export { PRICING };

export class UsageCalculator {
  constructor() {
    this.pricing = PRICING;
  }

  calculateCost(usage, model) {
    if (!usage) {
      return {
        inputCost: 0,
        outputCost: 0,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0
      };
    }
    
    const pricing = getModelPricing(model);
    
    // Convert to numbers, treat invalid values as 0
    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens) || 0;
    
    // Cache tokens cost 10% of input token price
    const effectiveInputTokens = inputTokens + cacheCreationTokens + (cacheReadTokens * 0.1);
    
    const inputCost = (effectiveInputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      inputTokens,
      outputTokens,
      cacheTokens: cacheReadTokens,
      cacheCreationTokens,
      // Include all tokens for context window calculation
      totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens
    };
  }

  calculateSessionTotals(messages, model) {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheCreationTokens = 0;
    let totalCost = 0;
    let turns = 0;

    for (const message of messages) {
      if (message?.message) {
        const cost = this.calculateCost(message.message.usage, model);
        
        totalInputTokens += cost.inputTokens;
        totalOutputTokens += cost.outputTokens;
        totalCacheCreationTokens += cost.cacheCreationTokens || 0;
        // Cache read tokens: use latest value only, not accumulated
        if (cost.cacheTokens > 0) {
          totalCacheReadTokens = cost.cacheTokens;
        }
        totalCost += cost.totalCost;
        
        if (message.message?.role === 'assistant') {
          turns++;
        }
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens: totalCacheReadTokens,
      totalCacheCreationTokens,
      // Include all tokens for context window calculation
      totalTokens: totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens,
      totalCost,
      turns,
      averageTokensPerTurn: turns > 0 ? Math.round((totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens) / turns) : 0
    };
  }

  formatCost(cost) {
    return `$${cost.toFixed(2)}`;
  }

  formatTokens(tokens) {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  getModelName(model) {
    return getModelNameFromConfig(model);
  }

  estimateRemainingTurns(currentTokens, contextWindow, averageTokensPerTurn) {
    if (averageTokensPerTurn === 0) return Infinity;
    
    // currentTokens should include the latest cache tokens (not accumulated)
    const remainingTokens = contextWindow - currentTokens;
    return Math.floor(remainingTokens / averageTokensPerTurn);
  }
}
