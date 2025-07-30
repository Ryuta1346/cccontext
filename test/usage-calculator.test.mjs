import { describe, it, expect } from 'vitest';
import { UsageCalculator } from '../src/monitor/usage-calculator.mjs';

describe('UsageCalculator', () => {
  describe('Error Cases', () => {
    it('should handle invalid usage data gracefully', () => {
      const calculator = new UsageCalculator();
      
      // null usage
      const result1 = calculator.calculateCost(null, 'claude-3-5-sonnet-20241022');
      expect(result1.totalCost).toBe(0);
      expect(result1.totalTokens).toBe(0);
      
      // undefined usage
      const result2 = calculator.calculateCost(undefined, 'claude-3-5-sonnet-20241022');
      expect(result2.totalCost).toBe(0);
      expect(result2.totalTokens).toBe(0);
      
      // Invalid token values
      const result3 = calculator.calculateCost({
        input_tokens: -100,
        output_tokens: 'not-a-number',
        cache_read_input_tokens: NaN
      }, 'claude-3-5-sonnet-20241022');
      // With -100 input tokens, cost will be negative
      expect(typeof result3.totalCost).toBe('number');
      expect(result3.totalTokens).toBe(-100); // -100 + 0 (NaN becomes 0)
    });

    it('should handle edge cases in token calculations', () => {
      const calculator = new UsageCalculator();
      
      // Very large numbers
      const usage = {
        input_tokens: Number.MAX_SAFE_INTEGER,
        output_tokens: 1000
      };
      
      const result = calculator.calculateCost(usage, 'claude-3-5-sonnet-20241022');
      expect(result.totalCost).toBeGreaterThan(0);
      expect(isFinite(result.totalCost)).toBeTruthy();
      
      // Zero values
      const zeroResult = calculator.calculateCost({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0
      }, 'claude-3-5-sonnet-20241022');
      expect(zeroResult.totalCost).toBe(0);
      expect(zeroResult.totalTokens).toBe(0);
    });

    it('should handle malformed messages in session totals', () => {
      const calculator = new UsageCalculator();
      
      const messages = [
        null,
        undefined,
        {},
        { message: null },
        { message: {} },
        { message: { role: 'assistant' } }, // no usage
        {
          message: {
            role: 'assistant',
            usage: 'not-an-object'
          }
        },
        {
          message: {
            role: 'assistant',
            usage: {
              input_tokens: [1, 2, 3], // array instead of number
              output_tokens: { value: 100 } // object instead of number
            }
          }
        }
      ];
      
      // Should not throw
      const result = calculator.calculateSessionTotals(messages, 'claude-3-5-sonnet-20241022');
      expect(result).toBeTruthy();
      expect(result.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.totalTokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle division by zero in averages', () => {
      const calculator = new UsageCalculator();
      
      // No assistant messages (0 turns)
      const messages = [
        {
          message: {
            role: 'user',
            usage: { input_tokens: 100, output_tokens: 0 }
          }
        }
      ];
      
      const result = calculator.calculateSessionTotals(messages, 'claude-3-5-sonnet-20241022');
      expect(result.turns).toBe(0);
      expect(result.averageTokensPerTurn).toBe(0); // Should handle division by zero
    });

    it('should handle edge cases in estimateRemainingTurns', () => {
      const calculator = new UsageCalculator();
      
      // Negative values
      expect(calculator.estimateRemainingTurns(-100, 200000, 1000)).toBe(200); // (200000 - (-100)) / 1000
      expect(calculator.estimateRemainingTurns(100000, -200000, 1000)).toBeLessThan(0); // negative result
      expect(calculator.estimateRemainingTurns(100000, 200000, -1000)).toBeLessThan(0); // negative result
      
      // Already exceeded context - result will be negative and floored
      expect(calculator.estimateRemainingTurns(300000, 200000, 1000)).toBe(-100); // Math.floor((200000-300000)/1000)
      
      // Exactly at limit
      expect(calculator.estimateRemainingTurns(200000, 200000, 1000)).toBe(0);
      
      // Very small average
      expect(calculator.estimateRemainingTurns(100000, 200000, 0.1)).toBeGreaterThan(0);
    });

    it('should handle extreme cost values', () => {
      const calculator = new UsageCalculator();
      
      // Test formatting of very large costs
      expect(calculator.formatCost(9999999.99)).toBe('$9999999.99');
      expect(calculator.formatCost(0.001)).toBe('$0.00');
      expect(calculator.formatCost(0.009)).toBe('$0.01');
      
      // Test formatting of negative costs (shouldn't happen but handle gracefully)
      expect(calculator.formatCost(-10)).toBe('$-10.00');
    });

    it('should handle extreme token values in formatting', () => {
      const calculator = new UsageCalculator();
      
      // Very large numbers
      expect(calculator.formatTokens(999999999)).toMatch(/M$/);
      expect(calculator.formatTokens(Number.MAX_SAFE_INTEGER)).toMatch(/M$/);
      
      // Negative numbers (shouldn't happen but handle gracefully)
      expect(calculator.formatTokens(-100)).toBe('-100');
      expect(calculator.formatTokens(-1500)).toBe('-1500'); // Negative numbers don't get formatted with suffixes
    });
  });

  it('should calculate cost correctly for known models', () => {
    const calculator = new UsageCalculator();
    
    const usage = {
      input_tokens: 1000,
      output_tokens: 2000,
      cache_read_input_tokens: 500
    };
    
    // Claude 3.5 Sonnet: $3/1M input, $15/1M output
    const result = calculator.calculateCost(usage, 'claude-3-5-sonnet-20241022');
    
    // Input cost: (1000 + 500*0.1) / 1M * $3 = 0.00315
    expect(result.inputCost.toFixed(5)).toBe('0.00315');
    // Output cost: 2000 / 1M * $15 = 0.03
    expect(result.outputCost.toFixed(5)).toBe('0.03000');
    expect(result.totalCost.toFixed(5)).toBe('0.03315');
    expect(result.totalTokens).toBe(3000);
  });

  it('should use default pricing for unknown models', () => {
    const calculator = new UsageCalculator();
    
    const usage = {
      input_tokens: 1000,
      output_tokens: 1000
    };
    
    const result = calculator.calculateCost(usage, 'unknown-model-xyz');
    
    // Default: $3/1M input, $15/1M output
    expect(result.inputCost).toBe(0.003);
    expect(result.outputCost).toBe(0.015);
    expect(result.totalCost).toBe(0.018);
  });

  it('should handle cache tokens with 10% cost', () => {
    const calculator = new UsageCalculator();
    
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 10000
    };
    
    const result = calculator.calculateCost(usage, 'claude-3-5-sonnet-20241022');
    
    // Cache cost: 10000 * 0.1 / 1M * $3 = 0.003
    expect(result.inputCost).toBe(0.003);
    expect(result.outputCost).toBe(0);
    expect(result.totalCost).toBe(0.003);
  });

  it('should calculate session totals correctly', () => {
    const calculator = new UsageCalculator();
    
    const messages = [
      {
        message: {
          role: 'user',
          usage: {
            input_tokens: 100,
            output_tokens: 0
          }
        }
      },
      {
        message: {
          role: 'assistant',
          usage: {
            input_tokens: 50,
            output_tokens: 200,
            cache_read_input_tokens: 100
          }
        }
      },
      {
        message: {
          role: 'user',
          usage: {
            input_tokens: 150,
            output_tokens: 0
          }
        }
      },
      {
        message: {
          role: 'assistant',
          usage: {
            input_tokens: 0,
            output_tokens: 300
          }
        }
      }
    ];
    
    const result = calculator.calculateSessionTotals(messages, 'claude-3-5-sonnet-20241022');
    
    expect(result.totalInputTokens).toBe(300); // 100 + 50 + 150 + 0
    expect(result.totalOutputTokens).toBe(500); // 0 + 200 + 0 + 300
    expect(result.totalCacheTokens).toBe(100);
    expect(result.totalTokens).toBe(800);
    expect(result.turns).toBe(2); // 2 assistant messages
    expect(result.averageTokensPerTurn).toBe(400); // 800 / 2
    
    // Cost: (300 + 100*0.1) / 1M * $3 + 500 / 1M * $15
    const expectedCost = 0.00093 + 0.0075;
    expect(result.totalCost.toFixed(5)).toBe(expectedCost.toFixed(5));
  });

  it('should format costs correctly', () => {
    const calculator = new UsageCalculator();
    
    expect(calculator.formatCost(0)).toBe('$0.00');
    expect(calculator.formatCost(0.123)).toBe('$0.12');
    expect(calculator.formatCost(1.567)).toBe('$1.57');
    expect(calculator.formatCost(10.999)).toBe('$11.00');
  });

  it('should format tokens correctly', () => {
    const calculator = new UsageCalculator();
    
    expect(calculator.formatTokens(0)).toBe('0');
    expect(calculator.formatTokens(999)).toBe('999');
    expect(calculator.formatTokens(1000)).toBe('1.0k');
    expect(calculator.formatTokens(1500)).toBe('1.5k');
    expect(calculator.formatTokens(10500)).toBe('10.5k');
    expect(calculator.formatTokens(1000000)).toBe('1.0M');
    expect(calculator.formatTokens(2500000)).toBe('2.5M');
  });

  it('should get model names correctly', () => {
    const calculator = new UsageCalculator();
    
    expect(calculator.getModelName('claude-3-opus-20241022')).toBe('Claude 3 Opus');
    expect(calculator.getModelName('claude-opus-4-20250514')).toBe('Claude Opus 4');
    expect(calculator.getModelName('claude-3-5-sonnet-20241022')).toBe('Claude 3.5 Sonnet');
    expect(calculator.getModelName('unknown-model')).toBe('Unknown Model');
  });

  it('should estimate remaining turns correctly', () => {
    const calculator = new UsageCalculator();
    
    // 現在: 50k トークン使用、コンテキストウィンドウ: 200k、平均: 10k/ターン
    const remaining = calculator.estimateRemainingTurns(50000, 200000, 10000);
    expect(remaining).toBe(15); // (200k - 50k) / 10k = 15
    
    // 平均が0の場合
    const infiniteRemaining = calculator.estimateRemainingTurns(50000, 200000, 0);
    expect(infiniteRemaining).toBe(Infinity);
    
    // ほぼ限界の場合
    const fewRemaining = calculator.estimateRemainingTurns(195000, 200000, 2000);
    expect(fewRemaining).toBe(2); // (200k - 195k) / 2k = 2.5 → 2
  });

  it('should handle messages without usage data', () => {
    const calculator = new UsageCalculator();
    
    const messages = [
      { message: { role: 'user' } }, // usage なし
      {
        message: {
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      },
      { message: { role: 'system' } } // usage なし
    ];
    
    const result = calculator.calculateSessionTotals(messages, 'claude-3-5-sonnet-20241022');
    
    expect(result.totalInputTokens).toBe(100);
    expect(result.totalOutputTokens).toBe(200);
    expect(result.totalTokens).toBe(300);
    expect(result.turns).toBe(1);
  });
});