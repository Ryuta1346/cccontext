import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_WINDOWS, ContextTracker } from "../src/monitor/context-tracker.ts";

describe("ContextTracker", () => {
  describe("Error Cases", () => {
    it("should handle invalid session data gracefully", () => {
      const tracker = new ContextTracker();

      // null/undefined session data
      expect(() => tracker.updateSession(null)).not.toThrow();
      expect(() => tracker.updateSession(undefined)).not.toThrow();

      // Missing required fields
      const invalidData = {
        sessionId: "test",
        // missing model and messages
      };
      expect(() => tracker.updateSession(invalidData)).not.toThrow();

      // Invalid messages array
      const dataWithInvalidMessages = {
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: "not-an-array",
      };
      expect(() => tracker.updateSession(dataWithInvalidMessages)).not.toThrow();
    });

    it("should handle malformed usage data", () => {
      const tracker = new ContextTracker();

      const sessionData = {
        sessionId: "test-malformed",
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            message: {
              role: "assistant",
              usage: null, // malformed usage
            },
          },
          {
            message: {
              role: "assistant",
              usage: {
                input_tokens: "not-a-number",
                output_tokens: NaN,
              },
            },
          },
          {
            message: {
              role: "assistant",
              // missing usage field
            },
          },
        ],
      };

      const result = tracker.updateSession(sessionData);
      expect(result.totalTokens).toBe(0);
      expect(result.turns).toBe(3);
    });

    it("should handle extremely large token counts", () => {
      const tracker = new ContextTracker();

      const sessionData = {
        sessionId: "test-overflow",
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            message: {
              role: "assistant",
              usage: {
                input_tokens: Number.MAX_SAFE_INTEGER,
                output_tokens: 1000,
              },
            },
          },
        ],
      };

      const result = tracker.updateSession(sessionData);
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.warningLevel).toBe("critical");
    });
  });

  it("should get correct context window size for models", () => {
    const tracker = new ContextTracker();

    // 200k models
    expect(tracker.getContextWindow("claude-3-opus-20241022")).toBe(200_000);
    expect(tracker.getContextWindow("claude-opus-4-20250514")).toBe(200_000);
    expect(tracker.getContextWindow("claude-opus-4-1-20250805")).toBe(200_000);
    expect(tracker.getContextWindow("claude-3-5-sonnet-20241022")).toBe(200_000);
    expect(tracker.getContextWindow("claude-sonnet-4-5-20250929")).toBe(200_000);

    // 1M models
    expect(tracker.getContextWindow("claude-3-opus-20241022[1m]")).toBe(1_000_000);
    expect(tracker.getContextWindow("claude-opus-4-20250514[1m]")).toBe(1_000_000);
    expect(tracker.getContextWindow("claude-opus-4-1-20250805[1m]")).toBe(1_000_000);
    expect(tracker.getContextWindow("claude-3-5-sonnet-20241022[1m]")).toBe(1_000_000);
    expect(tracker.getContextWindow("claude-sonnet-4-5-20250929[1m]")).toBe(1_000_000);

    // Legacy models
    expect(tracker.getContextWindow("claude-2.0")).toBe(100_000);
    expect(tracker.getContextWindow("claude-instant-1.2")).toBe(100_000);

    // Unknown model (default)
    expect(tracker.getContextWindow("unknown-model")).toBe(200_000);
  });

  it("should calculate context usage correctly", () => {
    const tracker = new ContextTracker();

    const sessionData = {
      sessionId: "test-session-1",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "user",
            usage: { input_tokens: 1000, output_tokens: 0 },
          },
        },
        {
          message: {
            role: "assistant",
            usage: { input_tokens: 0, output_tokens: 2000 },
          },
        },
      ],
      startTime: new Date("2025-01-01T00:00:00Z"),
    };

    const result = tracker.updateSession(sessionData);

    expect(result.totalTokens).toBe(3000);
    expect(result.contextWindow).toBe(200_000);
    expect(result.usagePercentage).toBe(1.5);
    expect(result.remainingTokens).toBe(197_000);
    expect(result.turns).toBe(1);
    expect(result.warningLevel).toBe("normal");
  });

  it("should set correct warning levels based on usage", () => {
    const tracker = new ContextTracker();

    const testCases = [
      { tokens: 160_000, expectedLevel: "warning" }, // 80%
      { tokens: 180_000, expectedLevel: "severe" }, // 90%
      { tokens: 190_000, expectedLevel: "critical" }, // 95%
      { tokens: 100_000, expectedLevel: "normal" }, // 50%
    ];

    for (const testCase of testCases) {
      const sessionData = {
        sessionId: `test-${testCase.tokens}`,
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            message: {
              role: "assistant",
              usage: { input_tokens: testCase.tokens, output_tokens: 0 },
            },
          },
        ],
      };

      const result = tracker.updateSession(sessionData);
      expect(result.warningLevel).toBe(testCase.expectedLevel);
    }
  });

  it("should track latest usage information", () => {
    const tracker = new ContextTracker();

    const sessionData = {
      sessionId: "test-latest",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "assistant",
            usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 500 },
          },
        },
      ],
      latestUsage: {
        input: 1000,
        output: 2000,
        cache: 500,
      },
    };

    const result = tracker.updateSession(sessionData);

    expect(result.latestTurn.input).toBe(1000);
    expect(result.latestTurn.output).toBe(2000);
    expect(result.latestTurn.cache).toBe(500);
    expect(result.latestTurn.total).toBe(3000); // 1000 + 2000 (cache not included)
    expect(result.latestTurn.percentage).toBeCloseTo(1.5, 5); // 3000 / 200000 * 100
  });

  it("should format context info correctly", () => {
    const tracker = new ContextTracker();

    const info = {
      sessionId: "abcdef1234567890",
      modelName: "Claude 3.5 Sonnet",
      usagePercentage: 45.6789,
      totalTokens: 91234,
      contextWindow: 200_000,
      remainingTokens: 108766,
      totalCost: 0.45,
      turns: 10,
      averageTokensPerTurn: 9123,
      estimatedRemainingTurns: 12,
      warningLevel: "normal",
      startTime: new Date(Date.now() - 3600000), // 1 hour ago
    };

    const formatted = tracker.formatContextInfo(info);

    expect(formatted.session).toBe("abcdef1234567890");
    expect(formatted.usage).toBe("45.7%");
    expect(formatted.tokens).toBe("91.2k/200.0k");
    expect(formatted.remaining).toBe("108.8k");
    expect(formatted.cost).toBe("$0.45");
    expect(formatted.turns).toBe(10);
    expect(formatted.avgTokensPerTurn).toBe("9.1k");
    expect(formatted.estRemainingTurns).toBe("12");
    expect(formatted.duration).toBe("1h 0m");
  });

  it("should manage sessions correctly", () => {
    const tracker = new ContextTracker();

    const sessionData1 = {
      sessionId: "session-1",
      model: "claude-3-5-sonnet-20241022",
      messages: [],
    };

    const sessionData2 = {
      sessionId: "session-2",
      model: "claude-3-5-sonnet-20241022",
      messages: [],
    };

    tracker.updateSession(sessionData1);
    tracker.updateSession(sessionData2);

    expect(tracker.getAllSessions()).toHaveLength(2);
    expect(tracker.getSession("session-1")).toBeTruthy();
    expect(tracker.getSession("session-2")).toBeTruthy();
    expect(tracker.getSession("non-existent")).toBeUndefined();
  });

  describe("Active Sessions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should get active sessions within time window", () => {
      const tracker = new ContextTracker();
      const now = new Date("2025-01-01T12:00:00Z");
      vi.setSystemTime(now);

      // Create sessions with different ages
      const recentSession = {
        sessionId: "recent",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      };

      const oldSession = {
        sessionId: "old",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      };

      // Update recent session
      tracker.updateSession(recentSession);

      // Move time forward 2 hours
      vi.setSystemTime(new Date("2025-01-01T14:00:00Z"));

      // Update old session
      tracker.updateSession(oldSession);

      // Get active sessions within 1 hour
      const activeSessions = tracker.getActiveSessions(3600000); // 1 hour

      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].sessionId).toBe("old");
    });

    it("should use default max age of 1 hour", () => {
      const tracker = new ContextTracker();
      const now = new Date("2025-01-01T12:00:00Z");
      vi.setSystemTime(now);

      tracker.updateSession({
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      });

      // Move forward 30 minutes
      vi.setSystemTime(new Date("2025-01-01T12:30:00Z"));
      expect(tracker.getActiveSessions()).toHaveLength(1);

      // Move forward another 31 minutes (total 61 minutes)
      vi.setSystemTime(new Date("2025-01-01T13:01:00Z"));
      expect(tracker.getActiveSessions()).toHaveLength(0);
    });
  });

  describe("Duration Formatting", () => {
    it("should format duration correctly", () => {
      const tracker = new ContextTracker();
      const now = Date.now();

      // Test various durations
      expect(tracker.formatDuration(new Date(now - 30000))).toBe("0m"); // 30 seconds
      expect(tracker.formatDuration(new Date(now - 60000))).toBe("1m"); // 1 minute
      expect(tracker.formatDuration(new Date(now - 3600000))).toBe("1h 0m"); // 1 hour
      expect(tracker.formatDuration(new Date(now - 3720000))).toBe("1h 2m"); // 1 hour 2 minutes
      expect(tracker.formatDuration(new Date(now - 7380000))).toBe("2h 3m"); // 2 hours 3 minutes
      expect(tracker.formatDuration(null)).toBe("Unknown");
      expect(tracker.formatDuration(undefined)).toBe("Unknown");
    });
  });

  describe("Warning Messages", () => {
    it("should return correct warning messages", () => {
      const tracker = new ContextTracker();

      expect(tracker.getWarningMessage({ warningLevel: "normal" })).toBeNull();
      expect(tracker.getWarningMessage({ warningLevel: "warning" })).toContain("High context usage");
      expect(tracker.getWarningMessage({ warningLevel: "severe" })).toContain("Approaching context limit");
      expect(tracker.getWarningMessage({ warningLevel: "critical" })).toContain("Context limit nearly reached");
    });
  });

  describe("Prompt Formatting", () => {
    it("should format prompts correctly", () => {
      const tracker = new ContextTracker();

      // Test null/undefined
      expect(tracker.formatPrompt(null)).toBe("");
      expect(tracker.formatPrompt(undefined)).toBe("");
      expect(tracker.formatPrompt("")).toBe("");

      // Test short prompts
      expect(tracker.formatPrompt("Hello")).toBe("Hello");

      // Test long prompts
      const longPrompt = "a".repeat(60);
      const formatted = tracker.formatPrompt(longPrompt);
      expect(formatted).toHaveLength(53); // 50 + '...'
      expect(formatted.endsWith("...")).toBe(true);

      // Test prompts with newlines and multiple spaces
      expect(tracker.formatPrompt("Hello\n\n  World")).toBe("Hello World");
      expect(tracker.formatPrompt("  Multiple   spaces  ")).toBe("Multiple spaces");
    });

    it("should handle Japanese characters correctly", () => {
      const tracker = new ContextTracker();

      // Japanese characters count as 2
      const japaneseText = "こんにちは世界"; // 7 characters, 14 width
      expect(tracker.formatPrompt(japaneseText)).toBe(japaneseText);

      // Mixed text
      const mixedText = "Hello こんにちは World 世界 test";
      const formatted = tracker.formatPrompt(mixedText);
      expect(formatted).toContain("Hello こんにちは World");

      // Long Japanese text should be truncated
      const longJapanese = "あ".repeat(30); // 30 characters, 60 width
      const formattedLong = tracker.formatPrompt(longJapanese);
      expect(formattedLong.endsWith("...")).toBe(true);
      expect(formattedLong.length).toBeLessThan(longJapanese.length);
    });
  });

  describe("Model Names and Context Windows", () => {
    it("should have correct context window sizes", () => {
      expect(CONTEXT_WINDOWS["claude-3-opus-20241022"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-opus-4-20250514"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-opus-4-1-20250805"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-3-5-sonnet-20241022"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-3-5-haiku-20241022"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-3-haiku-20240307"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-2.1"]).toBe(200_000);
      expect(CONTEXT_WINDOWS["claude-2.0"]).toBe(100_000);
      expect(CONTEXT_WINDOWS["claude-instant-1.2"]).toBe(100_000);
    });
  });

  describe("Edge Cases", () => {
    it("should handle sessions with no messages", () => {
      const tracker = new ContextTracker();

      const result = tracker.updateSession({
        sessionId: "empty",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      });

      expect(result.totalTokens).toBe(0);
      expect(result.turns).toBe(0);
      expect(result.averageTokensPerTurn).toBe(0);
      expect(result.estimatedRemainingTurns).toBe(Infinity);
    });

    it("should handle missing sessionId", () => {
      const tracker = new ContextTracker();

      const result = tracker.updateSession({
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      });

      expect(result.sessionId).toBe("unknown");
      expect(result.totalTokens).toBe(0);
    });

    it("should handle missing model", () => {
      const tracker = new ContextTracker();

      const result = tracker.updateSession({
        sessionId: "test",
        messages: [],
      });

      expect(result.totalTokens).toBe(0);
      expect(result.warningLevel).toBe("normal");
    });

    it("should calculate latest turn correctly with zero cache tokens", () => {
      const tracker = new ContextTracker();

      const sessionData = {
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
        latestUsage: {
          input: 1000,
          output: 2000,
          cache: 0,
        },
      };

      const result = tracker.updateSession(sessionData);

      expect(result.latestTurn).toEqual({
        input: 1000,
        output: 2000,
        cache: 0,
        total: 3000,
        percentage: 1.5,
      });
    });

    it("should format infinity correctly for estimated remaining turns", () => {
      const tracker = new ContextTracker();

      const info = {
        sessionId: "test",
        modelName: "Claude 3.5 Sonnet",
        usagePercentage: 0,
        totalTokens: 0,
        contextWindow: 200_000,
        remainingTokens: 200_000,
        totalCost: 0,
        turns: 0,
        averageTokensPerTurn: 0,
        estimatedRemainingTurns: Infinity,
        warningLevel: "normal",
        startTime: new Date(),
      };

      const formatted = tracker.formatContextInfo(info);
      expect(formatted.estRemainingTurns).toBe("∞");
    });
  });

  describe("Session Data Updates", () => {
    it("should update lastUpdate timestamp on each update", () => {
      const tracker = new ContextTracker();
      const sessionData = {
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: [],
      };

      const result1 = tracker.updateSession(sessionData);
      const time1 = result1.lastUpdate;

      // Wait a bit
      const result2 = tracker.updateSession(sessionData);
      const time2 = result2.lastUpdate;

      expect(time2.getTime()).toBeGreaterThanOrEqual(time1.getTime());
    });

    it("should preserve session data across updates", () => {
      const tracker = new ContextTracker();

      // First update
      tracker.updateSession({
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            message: {
              role: "assistant",
              usage: { input_tokens: 1000, output_tokens: 0 },
            },
          },
        ],
        startTime: new Date("2025-01-01T00:00:00Z"),
        latestPrompt: "First prompt",
        latestPromptTime: "2025-01-01T00:00:00Z",
      });

      // Second update with more messages
      const result = tracker.updateSession({
        sessionId: "test",
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            message: {
              role: "assistant",
              usage: { input_tokens: 1000, output_tokens: 0 },
            },
          },
          {
            message: {
              role: "assistant",
              usage: { input_tokens: 2000, output_tokens: 0 },
            },
          },
        ],
        startTime: new Date("2025-01-01T00:00:00Z"),
        latestPrompt: "Second prompt",
        latestPromptTime: "2025-01-01T00:01:00Z",
      });

      expect(result.totalTokens).toBe(3000);
      expect(result.turns).toBe(2);
      expect(result.latestPrompt).toBe("Second prompt");
      expect(result.latestPromptTime).toBe("2025-01-01T00:01:00Z");
    });
  });
});
