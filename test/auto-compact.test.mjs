import { describe, it, expect } from 'vitest';
import { AUTO_COMPACT_CONFIG } from '../src/monitor/auto-compact-config.mjs';
import { ContextTracker } from '../src/monitor/context-tracker.mjs';

describe('AutoCompact Configuration', () => {
  it('should have correct default threshold', () => {
    expect(AUTO_COMPACT_CONFIG.DEFAULT_THRESHOLD).toBe(0.95);
  });

  it('should return correct thresholds for different models', () => {
    expect(AUTO_COMPACT_CONFIG.getThreshold('claude-3-5-sonnet-20241022')).toBe(0.95);
    expect(AUTO_COMPACT_CONFIG.getThreshold('claude-3-opus-20241022')).toBe(0.95);
    expect(AUTO_COMPACT_CONFIG.getThreshold('claude-opus-4-20250514')).toBe(0.95);
    expect(AUTO_COMPACT_CONFIG.getThreshold('claude-sonnet-4-20250514')).toBe(0.95);
    expect(AUTO_COMPACT_CONFIG.getThreshold('unknown-model')).toBe(0.95);
  });

  it('should return correct warning levels', () => {
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(25)).toBe('normal');
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(15)).toBe('notice');
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(8)).toBe('warning');
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(3)).toBe('critical');
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(0)).toBe('active');
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(-5)).toBe('active');
  });
});

describe('AutoCompact in ContextTracker', () => {
  it('should calculate auto-compact information correctly', () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: 'test-session',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'human',
            content: 'Hello',
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 100 }
          }
        }
      ],
      latestUsage: { input: 1000, output: 500, cache: 100 }
    };

    const info = tracker.updateSession(sessionData);
    
    expect(info.autoCompact).toBeDefined();
    expect(info.autoCompact.enabled).toBe(true);
    expect(info.autoCompact.threshold).toBe(0.95);
    expect(info.autoCompact.thresholdPercentage).toBe(95);
    
    // With 1500 tokens used (1000 input + 500 output, cache not counted) out of 200k
    // Usage is 0.75%, so remaining until 95% is 94.25%
    expect(info.usagePercentage).toBeCloseTo(0.75, 2);
    expect(info.autoCompact.remainingPercentage).toBeCloseTo(94.25, 1);
    expect(info.autoCompact.remainingTokens).toBeGreaterThanOrEqual(188499); // ~200k * 0.9425 (allowing for rounding)
    expect(info.autoCompact.warningLevel).toBe('normal');
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it('should handle high usage scenarios correctly', () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: 'test-session',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'human',
            content: 'Hello',
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 120000, output_tokens: 5000, cache_read_input_tokens: 1000 }
          }
        }
      ],
      latestUsage: { input: 120000, output: 5000, cache: 1000 }
    };

    const info = tracker.updateSession(sessionData);
    
    // With 125k tokens used out of 200k, usage is 62.5%
    // So remaining until 95% is 32.5%
    expect(info.usagePercentage).toBe(62.5);
    expect(info.autoCompact.remainingPercentage).toBeCloseTo(32.5, 1);
    expect(info.autoCompact.remainingTokens).toBe(65000); // 200k * 0.325
    expect(info.autoCompact.warningLevel).toBe('normal');
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it('should handle exceeded threshold correctly', () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: 'test-session',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'human',
            content: 'Hello',
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 140000, output_tokens: 10000, cache_read_input_tokens: 1000 }
          }
        }
      ],
      latestUsage: { input: 140000, output: 10000, cache: 1000 }
    };

    const info = tracker.updateSession(sessionData);
    
    // With 150k tokens used out of 200k, usage is 75%
    // Still under 95% threshold, remaining is 20%
    expect(info.usagePercentage).toBe(75);
    expect(info.autoCompact.remainingPercentage).toBe(20);
    expect(info.autoCompact.remainingTokens).toBe(40000); // 200k * 0.20
    expect(info.autoCompact.warningLevel).toBe('normal');
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it('should handle near-threshold scenarios correctly', () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: 'test-session',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'human',
            content: 'Hello',
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 185000, output_tokens: 5000, cache_read_input_tokens: 1000 }
          }
        }
      ],
      latestUsage: { input: 185000, output: 5000, cache: 1000 }
    };

    const info = tracker.updateSession(sessionData);
    
    // With 190k tokens used out of 200k, usage is 95%
    // At the 95% threshold
    expect(info.usagePercentage).toBe(95);
    expect(info.autoCompact.remainingPercentage).toBe(0);
    expect(info.autoCompact.remainingTokens).toBe(0);
    expect(info.autoCompact.warningLevel).toBe('active');
    expect(info.autoCompact.willCompactSoon).toBe(true);
  });

  it('should handle above-threshold scenarios correctly', () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: 'test-session',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'human',
            content: 'Hello',
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 192000, output_tokens: 6000, cache_read_input_tokens: 1000 }
          }
        }
      ],
      latestUsage: { input: 192000, output: 6000, cache: 1000 }
    };

    const info = tracker.updateSession(sessionData);
    
    // With 198k tokens used out of 200k, usage is 99%
    // Above the 95% threshold
    expect(info.usagePercentage).toBe(99);
    expect(info.autoCompact.remainingPercentage).toBe(0);
    expect(info.autoCompact.remainingTokens).toBe(0);
    expect(info.autoCompact.warningLevel).toBe('active');
    expect(info.autoCompact.willCompactSoon).toBe(true);
  });
});