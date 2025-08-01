// モデル別の料金設定（USD per 1M tokens）
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

// デフォルト料金（未知のモデル用）
const DEFAULT_PRICING = {
  input: 3.00,
  output: 15.00,
  name: 'Unknown Model!'
};

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
    
    const pricing = this.pricing[model] || DEFAULT_PRICING;
    
    // 数値に変換し、無効な値は0として扱う
    const inputTokens = Number(usage.input_tokens) || 0;
    const outputTokens = Number(usage.output_tokens) || 0;
    const cacheTokens = Number(usage.cache_read_input_tokens) || 0;
    
    // キャッシュトークンは入力トークンの10%のコストとして計算
    const effectiveInputTokens = inputTokens + (cacheTokens * 0.1);
    
    const inputCost = (effectiveInputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    
    return {
      inputCost,
      outputCost,
      totalCost: inputCost + outputCost,
      inputTokens,
      outputTokens,
      cacheTokens,
      totalTokens: inputTokens + outputTokens + cacheTokens
    };
  }

  calculateSessionTotals(messages, model) {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheTokens = 0;
    let totalCost = 0;
    let turns = 0;

    for (const message of messages) {
      if (message?.message) {
        const cost = this.calculateCost(message.message.usage, model);
        
        totalInputTokens += cost.inputTokens;
        totalOutputTokens += cost.outputTokens;
        totalCacheTokens += cost.cacheTokens;
        totalCost += cost.totalCost;
        
        if (message.message?.role === 'assistant') {
          turns++;
        }
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalCacheTokens,
      totalTokens: totalInputTokens + totalOutputTokens + totalCacheTokens,
      totalCost,
      turns,
      averageTokensPerTurn: turns > 0 ? Math.round((totalInputTokens + totalOutputTokens + totalCacheTokens) / turns) : 0
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
    const info = this.pricing[model];
    return info ? info.name : 'Unknown Model';
  }

  estimateRemainingTurns(currentTokens, contextWindow, averageTokensPerTurn) {
    if (averageTokensPerTurn === 0) return Infinity;
    
    const remainingTokens = contextWindow - currentTokens;
    return Math.floor(remainingTokens / averageTokensPerTurn);
  }
}
