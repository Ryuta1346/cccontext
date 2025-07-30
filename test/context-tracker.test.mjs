import { describe, it, expect } from 'vitest';
import { ContextTracker } from '../src/monitor/context-tracker.mjs';

describe('ContextTracker', () => {
  describe('Error Cases', () => {
    it('should handle invalid session data gracefully', () => {
      const tracker = new ContextTracker();
      
      // null/undefined session data
      expect(() => tracker.updateSession(null)).not.toThrow();
      expect(() => tracker.updateSession(undefined)).not.toThrow();
      
      // Missing required fields
      const invalidData = {
        sessionId: 'test',
        // missing model and messages
      };
      expect(() => tracker.updateSession(invalidData)).not.toThrow();
      
      // Invalid messages array
      const dataWithInvalidMessages = {
        sessionId: 'test',
        model: 'claude-3-5-sonnet-20241022',
        messages: 'not-an-array'
      };
      expect(() => tracker.updateSession(dataWithInvalidMessages)).not.toThrow();
    });

    it('should handle malformed usage data', () => {
      const tracker = new ContextTracker();
      
      const sessionData = {
        sessionId: 'test-malformed',
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            message: {
              role: 'assistant',
              usage: null // malformed usage
            }
          },
          {
            message: {
              role: 'assistant',
              usage: { 
                input_tokens: 'not-a-number',
                output_tokens: NaN
              }
            }
          },
          {
            message: {
              role: 'assistant',
              // missing usage field
            }
          }
        ]
      };
      
      const result = tracker.updateSession(sessionData);
      expect(result.totalTokens).toBe(0);
      expect(result.turns).toBe(3);
    });

    it('should handle extremely large token counts', () => {
      const tracker = new ContextTracker();
      
      const sessionData = {
        sessionId: 'test-overflow',
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            message: {
              role: 'assistant',
              usage: { 
                input_tokens: Number.MAX_SAFE_INTEGER,
                output_tokens: 1000
              }
            }
          }
        ]
      };
      
      const result = tracker.updateSession(sessionData);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.warningLevel).toBe('critical');
    });
  });

  it('should get correct context window size for models', () => {
    const tracker = new ContextTracker();
    
    expect(tracker.getContextWindow('claude-3-opus-20241022')).toBe(200_000);
    expect(tracker.getContextWindow('claude-opus-4-20250514')).toBe(200_000);
    expect(tracker.getContextWindow('claude-3-5-sonnet-20241022')).toBe(200_000);
    expect(tracker.getContextWindow('claude-2.0')).toBe(100_000);
    expect(tracker.getContextWindow('claude-instant-1.2')).toBe(100_000);
    expect(tracker.getContextWindow('unknown-model')).toBe(200_000); // default
  });

  it('should calculate context usage correctly', () => {
    const tracker = new ContextTracker();
    
    const sessionData = {
      sessionId: 'test-session-1',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'user',
            usage: { input_tokens: 1000, output_tokens: 0 }
          }
        },
        {
          message: {
            role: 'assistant',
            usage: { input_tokens: 0, output_tokens: 2000 }
          }
        }
      ],
      startTime: new Date('2025-01-01T00:00:00Z')
    };

    const result = tracker.updateSession(sessionData);
    
    expect(result.totalTokens).toBe(3000);
    expect(result.contextWindow).toBe(200_000);
    expect(result.usagePercentage).toBe(1.5);
    expect(result.remainingTokens).toBe(197_000);
    expect(result.turns).toBe(1);
    expect(result.warningLevel).toBe('normal');
  });

  it('should set correct warning levels based on usage', () => {
    const tracker = new ContextTracker();
    
    const testCases = [
      { tokens: 160_000, expectedLevel: 'warning' },    // 80%
      { tokens: 180_000, expectedLevel: 'severe' },     // 90%
      { tokens: 190_000, expectedLevel: 'critical' },   // 95%
      { tokens: 100_000, expectedLevel: 'normal' }      // 50%
    ];

    for (const testCase of testCases) {
      const sessionData = {
        sessionId: `test-${testCase.tokens}`,
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            message: {
              role: 'assistant',
              usage: { input_tokens: testCase.tokens, output_tokens: 0 }
            }
          }
        ]
      };

      const result = tracker.updateSession(sessionData);
      expect(result.warningLevel).toBe(testCase.expectedLevel);
    }
  });

  it('should track latest usage information', () => {
    const tracker = new ContextTracker();
    
    const sessionData = {
      sessionId: 'test-latest',
      model: 'claude-3-5-sonnet-20241022',
      messages: [
        {
          message: {
            role: 'assistant',
            usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 500 }
          }
        }
      ],
      latestUsage: {
        input: 1000,
        output: 2000,
        cache: 500
      }
    };

    const result = tracker.updateSession(sessionData);
    
    expect(result.latestTurn).toEqual({
      input: 1000,
      output: 2000,
      cache: 500,
      total: 3000,
      percentage: 1.5
    });
  });

  it('should format context info correctly', () => {
    const tracker = new ContextTracker();
    
    const info = {
      sessionId: 'abcdef1234567890',
      modelName: 'Claude 3.5 Sonnet',
      usagePercentage: 45.6789,
      totalTokens: 91234,
      contextWindow: 200_000,
      remainingTokens: 108766,
      totalCost: 0.45,
      turns: 10,
      averageTokensPerTurn: 9123,
      estimatedRemainingTurns: 12,
      warningLevel: 'normal',
      startTime: new Date(Date.now() - 3600000) // 1 hour ago
    };

    const formatted = tracker.formatContextInfo(info);
    
    expect(formatted.session).toBe('abcdef12');
    expect(formatted.usage).toBe('45.7%');
    expect(formatted.tokens).toBe('91.2k/200.0k');
    expect(formatted.remaining).toBe('108.8k');
    expect(formatted.cost).toBe('$0.45');
    expect(formatted.turns).toBe(10);
    expect(formatted.avgTokensPerTurn).toBe('9.1k');
    expect(formatted.estRemainingTurns).toBe('12');
    expect(formatted.duration).toBe('1h 0m');
  });

  it('should manage sessions correctly', () => {
    const tracker = new ContextTracker();
    
    const sessionData1 = {
      sessionId: 'session-1',
      model: 'claude-3-5-sonnet-20241022',
      messages: []
    };
    
    const sessionData2 = {
      sessionId: 'session-2',
      model: 'claude-3-5-sonnet-20241022',
      messages: []
    };

    tracker.updateSession(sessionData1);
    tracker.updateSession(sessionData2);
    
    expect(tracker.getAllSessions()).toHaveLength(2);
    expect(tracker.getSession('session-1')).toBeTruthy();
    expect(tracker.getSession('session-2')).toBeTruthy();
    expect(tracker.getSession('non-existent')).toBeUndefined();
  });
});