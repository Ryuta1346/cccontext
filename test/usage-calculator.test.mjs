import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UsageCalculator } from '../src/monitor/usage-calculator.mjs';

describe('UsageCalculator', () => {
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
    assert.equal(result.inputCost.toFixed(5), '0.00315');
    // Output cost: 2000 / 1M * $15 = 0.03
    assert.equal(result.outputCost.toFixed(5), '0.03000');
    assert.equal(result.totalCost.toFixed(5), '0.03315');
    assert.equal(result.totalTokens, 3000);
  });

  it('should use default pricing for unknown models', () => {
    const calculator = new UsageCalculator();
    
    const usage = {
      input_tokens: 1000,
      output_tokens: 1000
    };
    
    const result = calculator.calculateCost(usage, 'unknown-model-xyz');
    
    // Default: $3/1M input, $15/1M output
    assert.equal(result.inputCost, 0.003);
    assert.equal(result.outputCost, 0.015);
    assert.equal(result.totalCost, 0.018);
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
    assert.equal(result.inputCost, 0.003);
    assert.equal(result.outputCost, 0);
    assert.equal(result.totalCost, 0.003);
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
    
    assert.equal(result.totalInputTokens, 300); // 100 + 50 + 150 + 0
    assert.equal(result.totalOutputTokens, 500); // 0 + 200 + 0 + 300
    assert.equal(result.totalCacheTokens, 100);
    assert.equal(result.totalTokens, 800);
    assert.equal(result.turns, 2); // 2 assistant messages
    assert.equal(result.averageTokensPerTurn, 400); // 800 / 2
    
    // Cost: (300 + 100*0.1) / 1M * $3 + 500 / 1M * $15
    const expectedCost = 0.00093 + 0.0075;
    assert.equal(result.totalCost.toFixed(5), expectedCost.toFixed(5));
  });

  it('should format costs correctly', () => {
    const calculator = new UsageCalculator();
    
    assert.equal(calculator.formatCost(0), '$0.00');
    assert.equal(calculator.formatCost(0.123), '$0.12');
    assert.equal(calculator.formatCost(1.567), '$1.57');
    assert.equal(calculator.formatCost(10.999), '$11.00');
  });

  it('should format tokens correctly', () => {
    const calculator = new UsageCalculator();
    
    assert.equal(calculator.formatTokens(0), '0');
    assert.equal(calculator.formatTokens(999), '999');
    assert.equal(calculator.formatTokens(1000), '1.0k');
    assert.equal(calculator.formatTokens(1500), '1.5k');
    assert.equal(calculator.formatTokens(10500), '10.5k');
    assert.equal(calculator.formatTokens(1000000), '1.0M');
    assert.equal(calculator.formatTokens(2500000), '2.5M');
  });

  it('should get model names correctly', () => {
    const calculator = new UsageCalculator();
    
    assert.equal(calculator.getModelName('claude-3-opus-20241022'), 'Claude 3 Opus');
    assert.equal(calculator.getModelName('claude-opus-4-20250514'), 'Claude Opus 4');
    assert.equal(calculator.getModelName('claude-3-5-sonnet-20241022'), 'Claude 3.5 Sonnet');
    assert.equal(calculator.getModelName('unknown-model'), 'Unknown Model');
  });

  it('should estimate remaining turns correctly', () => {
    const calculator = new UsageCalculator();
    
    // 現在: 50k トークン使用、コンテキストウィンドウ: 200k、平均: 10k/ターン
    const remaining = calculator.estimateRemainingTurns(50000, 200000, 10000);
    assert.equal(remaining, 15); // (200k - 50k) / 10k = 15
    
    // 平均が0の場合
    const infiniteRemaining = calculator.estimateRemainingTurns(50000, 200000, 0);
    assert.equal(infiniteRemaining, Infinity);
    
    // ほぼ限界の場合
    const fewRemaining = calculator.estimateRemainingTurns(195000, 200000, 2000);
    assert.equal(fewRemaining, 2); // (200k - 195k) / 2k = 2.5 → 2
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
    
    assert.equal(result.totalInputTokens, 100);
    assert.equal(result.totalOutputTokens, 200);
    assert.equal(result.totalTokens, 300);
    assert.equal(result.turns, 1);
  });
});