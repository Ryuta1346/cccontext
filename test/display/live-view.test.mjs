import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { LiveView } from '../../src/display/live-view.mjs';

describe('LiveView', () => {
  let liveView;

  beforeEach(() => {
    liveView = new LiveView();
  });

  afterEach(() => {
    if (liveView && liveView.screen) {
      liveView.destroy();
    }
  });

  describe('formatTokens', () => {
    it('should format small token counts as-is', () => {
      expect(liveView.formatTokens(999)).toBe('999');
      expect(liveView.formatTokens(0)).toBe('0');
      expect(liveView.formatTokens(1)).toBe('1');
    });

    it('should format thousands with k suffix', () => {
      expect(liveView.formatTokens(1_000)).toBe('1.0k');
      expect(liveView.formatTokens(1_500)).toBe('1.5k');
      expect(liveView.formatTokens(999_999)).toBe('1000.0k');
    });

    it('should format millions with M suffix', () => {
      expect(liveView.formatTokens(1_000_000)).toBe('1.0M');
      expect(liveView.formatTokens(1_500_000)).toBe('1.5M');
      expect(liveView.formatTokens(2_300_000)).toBe('2.3M');
    });
  });

  describe('formatCost', () => {
    it('should format cost with two decimal places', () => {
      expect(liveView.formatCost(0)).toBe('$0.00');
      expect(liveView.formatCost(1.5)).toBe('$1.50');
      expect(liveView.formatCost(10.999)).toBe('$11.00');
      expect(liveView.formatCost(0.001)).toBe('$0.00');
    });
  });

  describe('getPercentageColor', () => {
    it('should return correct colors based on percentage', () => {
      expect(liveView.getPercentageColor(0)).toBe('green');
      expect(liveView.getPercentageColor(59)).toBe('green');
      expect(liveView.getPercentageColor(60)).toBe('yellowBright');
      expect(liveView.getPercentageColor(79)).toBe('yellowBright');
      expect(liveView.getPercentageColor(80)).toBe('yellow');
      expect(liveView.getPercentageColor(89)).toBe('yellow');
      expect(liveView.getPercentageColor(90)).toBe('redBright');
      expect(liveView.getPercentageColor(94)).toBe('redBright');
      expect(liveView.getPercentageColor(95)).toBe('red');
      expect(liveView.getPercentageColor(100)).toBe('red');
    });
  });

  describe('getBorderColor', () => {
    it('should return correct border colors based on warning level', () => {
      expect(liveView.getBorderColor('critical')).toBe('red');
      expect(liveView.getBorderColor('severe')).toBe('redBright');
      expect(liveView.getBorderColor('warning')).toBe('yellow');
      expect(liveView.getBorderColor('normal')).toBe('gray');
      expect(liveView.getBorderColor('unknown')).toBe('gray');
    });
  });

  describe('createProgressBar', () => {
    it('should create correct progress bars', () => {
      // プログレスバーの長さをテスト（ANSI色コードを除く）
      const bar0 = liveView.createProgressBar(0);
      const bar50 = liveView.createProgressBar(50);
      const bar100 = liveView.createProgressBar(100);
      
      // ANSIコードを除去して長さを確認
      const stripAnsi = (str) => str.replace(/\u001b\[[0-9;]*m/g, '');
      
      expect(stripAnsi(bar0).length).toBe(40);
      expect(stripAnsi(bar50).length).toBe(40);
      expect(stripAnsi(bar100).length).toBe(40);
      
      // 50%の場合、約半分が塗りつぶされているか確認
      const filled50 = stripAnsi(bar50).match(/█/g)?.length || 0;
      expect(filled50).toBeGreaterThanOrEqual(19);
      expect(filled50).toBeLessThanOrEqual(21); // 20 ± 1
    });
  });

  describe('formatSessionInfo', () => {
    it('should format session info correctly', () => {
      const info = {
        sessionId: '1234567890abcdef1234567890abcdef',
        modelName: 'Claude 3.5 Sonnet',
        duration: '5m'
      };
      
      const formatted = liveView.formatSessionInfo(info);
      expect(formatted).toMatch(/Session: .*1234567890abcdef\.\.\./);
      expect(formatted).toMatch(/Model: .*Claude 3\.5 Sonnet/);
      expect(formatted).toMatch(/Started: .*5m ago/);
    });
  });

  describe('formatContextUsage', () => {
    it('should format context usage with normal warning level', () => {
      const info = {
        usagePercentage: 25.5,
        totalTokens: 50000,
        contextWindow: 200000,
        remainingTokens: 150000,
        remainingPercentage: 75.0,
        warningLevel: 'normal'
      };
      
      const formatted = liveView.formatContextUsage(info);
      expect(formatted).toMatch(/25\.5%/);
      expect(formatted).toMatch(/50\.0k\/200\.0k/);
      expect(formatted).toMatch(/Remaining: .*150\.0k tokens \(75\.0%\)/);
      expect(formatted).not.toMatch(/⚠️/); // 警告なし
    });

    it('should format context usage with warning', () => {
      const info = {
        usagePercentage: 85.0,
        totalTokens: 170000,
        contextWindow: 200000,
        remainingTokens: 30000,
        remainingPercentage: 15.0,
        warningLevel: 'warning'
      };
      
      const formatted = liveView.formatContextUsage(info);
      expect(formatted).toMatch(/85\.0%/);
      expect(formatted).toMatch(/⚠️  Notice: High context usage/);
    });

    it('should format context usage with critical warning', () => {
      const info = {
        usagePercentage: 98.0,
        totalTokens: 196000,
        contextWindow: 200000,
        remainingTokens: 4000,
        remainingPercentage: 2.0,
        warningLevel: 'critical'
      };
      
      const formatted = liveView.formatContextUsage(info);
      expect(formatted).toMatch(/98\.0%/);
      expect(formatted).toMatch(/⚠️  CRITICAL: Context limit nearly reached!/);
    });
  });

  describe('formatLatestTurn', () => {
    it('should format latest turn info correctly', () => {
      const info = {
        latestTurn: {
          input: 1500,
          output: 2500,
          cache: 500,
          total: 4500,
          percentage: 2.25
        }
      };
      
      const formatted = liveView.formatLatestTurn(info);
      expect(formatted).toMatch(/Input:.*1\.5k tokens/);
      expect(formatted).toMatch(/Output:.*2\.5k tokens/);
      expect(formatted).toMatch(/Cache:.*500 tokens \(read\)/);
      expect(formatted).toMatch(/Total:.*4\.5k tokens \(2\.25% of window\)/);
    });
  });

  describe('formatLatestPrompt', () => {
    it('should format short prompts as-is', () => {
      const info = {
        latestPrompt: 'Short prompt'
      };
      
      const formatted = liveView.formatLatestPrompt(info);
      expect(formatted).toMatch(/Short prompt/);
    });

    it('should truncate long prompts', () => {
      const info = {
        latestPrompt: 'This is a very long prompt that should be truncated because it exceeds the maximum display length of 100 characters'
      };
      
      const formatted = liveView.formatLatestPrompt(info);
      expect(formatted).toMatch(/\.\.\./);
      expect(formatted.length).toBeLessThan(110); // 100文字 + 装飾
    });

    it('should handle multi-line prompts', () => {
      const info = {
        latestPrompt: 'Line 1\nLine 2\nLine 3\nLine 4'
      };
      
      const formatted = liveView.formatLatestPrompt(info);
      expect(formatted).toMatch(/Line 1 Line 2/); // 改行がスペースに変換される
      expect(formatted).not.toMatch(/Line 4/); // 最大2行なので4行目は含まれない
    });

    it('should handle empty prompt', () => {
      const info = {
        latestPrompt: null
      };
      
      const formatted = liveView.formatLatestPrompt(info);
      expect(formatted).toMatch(/No prompt yet/);
    });
  });

  describe('formatSessionTotals', () => {
    it('should format session totals correctly', () => {
      const info = {
        turns: 10,
        totalTokens: 50000,
        totalCost: 0.75,
        averageTokensPerTurn: 5000,
        estimatedRemainingTurns: 30
      };
      
      const formatted = liveView.formatSessionTotals(info);
      expect(formatted).toMatch(/Turns:.*10/);
      expect(formatted).toMatch(/Total Tokens:.*50\.0k/);
      expect(formatted).toMatch(/Cost:.*\$0\.75/);
      expect(formatted).toMatch(/Avg\/Turn:.*5\.0k/);
      expect(formatted).toMatch(/Est\. Remaining Turns:.*30/);
    });

    it('should handle infinite remaining turns', () => {
      const info = {
        turns: 1,
        totalTokens: 100,
        totalCost: 0.01,
        averageTokensPerTurn: 100,
        estimatedRemainingTurns: Infinity
      };
      
      const formatted = liveView.formatSessionTotals(info);
      expect(formatted).toMatch(/Est\. Remaining Turns:.*∞/);
    });
  });

  describe('getWarningMessage', () => {
    it('should return appropriate warning messages', () => {
      expect(liveView.getWarningMessage({ warningLevel: 'normal' })).toBe('');
      expect(liveView.getWarningMessage({ warningLevel: 'warning' })).toMatch(/Notice: High context usage/);
      expect(liveView.getWarningMessage({ warningLevel: 'severe' })).toMatch(/WARNING: Approaching context limit/);
      expect(liveView.getWarningMessage({ warningLevel: 'critical' })).toMatch(/CRITICAL: Context limit nearly reached!/);
    });
  });
});