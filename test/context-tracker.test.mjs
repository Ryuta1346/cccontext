import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContextTracker } from '../src/monitor/context-tracker.mjs';

describe('ContextTracker', () => {
  it('should get correct context window size for models', () => {
    const tracker = new ContextTracker();
    
    assert.equal(tracker.getContextWindow('claude-3-opus-20241022'), 200_000);
    assert.equal(tracker.getContextWindow('claude-opus-4-20250514'), 200_000);
    assert.equal(tracker.getContextWindow('claude-3-5-sonnet-20241022'), 200_000);
    assert.equal(tracker.getContextWindow('claude-2.0'), 100_000);
    assert.equal(tracker.getContextWindow('claude-instant-1.2'), 100_000);
    assert.equal(tracker.getContextWindow('unknown-model'), 200_000); // default
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
    
    assert.equal(result.totalTokens, 3000);
    assert.equal(result.contextWindow, 200_000);
    assert.equal(result.usagePercentage, 1.5);
    assert.equal(result.remainingTokens, 197_000);
    assert.equal(result.turns, 1);
    assert.equal(result.warningLevel, 'normal');
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
      assert.equal(result.warningLevel, testCase.expectedLevel,
        `Expected ${testCase.expectedLevel} for ${testCase.tokens} tokens`);
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
    
    assert.deepEqual(result.latestTurn, {
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
    
    assert.equal(formatted.session, 'abcdef12');
    assert.equal(formatted.usage, '45.7%');
    assert.equal(formatted.tokens, '91.2k/200.0k');
    assert.equal(formatted.remaining, '108.8k');
    assert.equal(formatted.cost, '$0.45');
    assert.equal(formatted.turns, 10);
    assert.equal(formatted.avgTokensPerTurn, '9.1k');
    assert.equal(formatted.estRemainingTurns, '12');
    assert.equal(formatted.duration, '1h 0m');
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
    
    assert.equal(tracker.getAllSessions().length, 2);
    assert.ok(tracker.getSession('session-1'));
    assert.ok(tracker.getSession('session-2'));
    assert.equal(tracker.getSession('non-existent'), undefined);
  });
});