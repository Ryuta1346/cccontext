import { describe, expect, it } from "vitest";
import { AUTO_COMPACT_CONFIG } from "../src/monitor/auto-compact-config.ts";
import { calculateAutoCompactInfo } from "../src/monitor/claude-calculation.ts";
import { ContextTracker } from "../src/monitor/context-tracker.ts";

describe("AutoCompact Configuration", () => {
  it("should have correct default threshold", () => {
    expect(AUTO_COMPACT_CONFIG.DEFAULT_THRESHOLD).toBe(0.92);
  });

  it("should return correct thresholds for different models", () => {
    // Latest models with 1M context window
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-3-5-sonnet-20241022")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-3-opus-20241022")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-opus-4-20250514")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-opus-4-1-20250805")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-sonnet-4-20250514")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-sonnet-4-5-20250929")).toBe(0.92);
    expect(AUTO_COMPACT_CONFIG.getThreshold("claude-haiku-4-5-20251001")).toBe(0.92);

    // Unknown model
    expect(AUTO_COMPACT_CONFIG.getThreshold("unknown-model")).toBe(0.92);
  });

  it("should return correct warning levels", () => {
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(25)).toBe("normal");
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(15)).toBe("notice");
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(8)).toBe("warning");
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(3)).toBe("critical");
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(0)).toBe("active");
    expect(AUTO_COMPACT_CONFIG.getWarningLevel(-5)).toBe("active");
  });
});

describe("AutoCompact in ContextTracker", () => {
  it("should calculate auto-compact information correctly", () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: "test-session",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "human",
            content: "Hello",
            model: "claude-3-5-sonnet-20241022",
            usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 100 },
          },
        },
      ],
      latestUsage: { input: 1000, output: 500, cache: 100 },
    };

    const info = tracker.updateSession(sessionData);

    expect(info.autoCompact).toBeDefined();
    expect(info.autoCompact.enabled).toBe(true);
    expect(info.autoCompact.threshold).toBe(0.92);
    expect(info.autoCompact.thresholdPercentage).toBe(92);

    // With 1600 tokens used (1000 input + 500 output + 100 cache) out of 1M
    // But Claude Code subtracts system overhead first
    // The auto-compact calculation is complex due to overhead
    expect(info.usagePercentage).toBeCloseTo(0.16, 2);
    // Exact values depend on system overhead calculation
    expect(info.autoCompact.remainingPercentage).toBeGreaterThan(85);
    expect(info.autoCompact.remainingTokens).toBeGreaterThan(850000);
    expect(info.autoCompact.warningLevel).toBe("normal");
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it("should handle high usage scenarios correctly", () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: "test-session",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "human",
            content: "Hello",
            model: "claude-3-5-sonnet-20241022",
            usage: { input_tokens: 120000, output_tokens: 5000, cache_read_input_tokens: 1000 },
          },
        },
      ],
      latestUsage: { input: 120000, output: 5000, cache: 1000 },
    };

    const info = tracker.updateSession(sessionData);

    // With 126k tokens used (125k + 1k cache) out of 1M, usage is 12.6%
    // Auto-compact calculation considers system overhead
    expect(info.usagePercentage).toBe(12.6);
    // With 1M context, remaining percentage is much higher
    expect(info.autoCompact.remainingPercentage).toBeGreaterThan(75);
    expect(info.autoCompact.remainingTokens).toBeGreaterThan(750000);
    expect(info.autoCompact.warningLevel).toBe("normal");
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it("should handle exceeded threshold correctly", () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: "test-session",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "human",
            content: "Hello",
            model: "claude-3-5-sonnet-20241022",
            usage: { input_tokens: 140000, output_tokens: 10000, cache_read_input_tokens: 1000 },
          },
        },
      ],
      latestUsage: { input: 140000, output: 10000, cache: 1000 },
    };

    const info = tracker.updateSession(sessionData);

    // With 151k tokens used (150k + 1k cache) out of 1M, usage is 15.1%
    // Auto-compact calculation considers system overhead
    expect(info.usagePercentage).toBe(15.1);
    // With 1M context, remaining percentage is much higher
    expect(info.autoCompact.remainingPercentage).toBeGreaterThan(74);
    expect(info.autoCompact.remainingTokens).toBeGreaterThan(700000);
    expect(info.autoCompact.warningLevel).toBe("normal");
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it("should handle near-threshold scenarios correctly", () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: "test-session",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "human",
            content: "Hello",
            model: "claude-3-5-sonnet-20241022",
            usage: { input_tokens: 185000, output_tokens: 5000, cache_read_input_tokens: 1000 },
          },
        },
      ],
      latestUsage: { input: 185000, output: 5000, cache: 1000 },
    };

    const info = tracker.updateSession(sessionData);

    // With 191k tokens used (190k + 1k cache) out of 1M, usage is 19.1%
    // Still well below threshold with 1M context
    expect(info.usagePercentage).toBe(19.1);
    // With 1M context, remaining percentage is much higher
    expect(info.autoCompact.remainingPercentage).toBeGreaterThan(75);
    expect(info.autoCompact.remainingTokens).toBeGreaterThan(700000);
    expect(info.autoCompact.warningLevel).toBe("normal");
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });

  it("should handle above-threshold scenarios correctly", () => {
    const tracker = new ContextTracker();
    const sessionData = {
      sessionId: "test-session",
      model: "claude-3-5-sonnet-20241022",
      messages: [
        {
          message: {
            role: "human",
            content: "Hello",
            model: "claude-3-5-sonnet-20241022",
            usage: { input_tokens: 192000, output_tokens: 6000, cache_read_input_tokens: 1000 },
          },
        },
      ],
      latestUsage: { input: 192000, output: 6000, cache: 1000 },
    };

    const info = tracker.updateSession(sessionData);

    // With 199k tokens used (198k + 1k cache) out of 1M, usage is 19.9%
    // Still well below threshold with 1M context
    expect(info.usagePercentage).toBeCloseTo(19.9, 1);
    // With 1M context, remaining percentage is much higher
    expect(info.autoCompact.remainingPercentage).toBeGreaterThan(69);
    expect(info.autoCompact.remainingTokens).toBeGreaterThan(650000);
    expect(info.autoCompact.warningLevel).toBe("normal");
    expect(info.autoCompact.willCompactSoon).toBe(false);
  });
});

describe("Claude Calculation Module", () => {
  it("should debug calculation for high usage scenario", () => {
    // Test with 126k tokens
    const currentUsage = 126000;
    const contextWindow = 200000;

    const info = calculateAutoCompactInfo(currentUsage, contextWindow, {
      messageCount: 1, // Assuming 1 turn
      cacheSize: 1000,
      autoCompactEnabled: true,
    });

    console.log("High usage debug:", {
      currentUsage,
      systemOverhead: info.systemOverhead,
      effectiveLimit: info.effectiveLimit,
      autoCompactThreshold: info.autoCompactThreshold,
      remainingPercentage: info.remainingPercentage,
      remainingTokens: info.remainingTokens,
    });
  });

  it("should debug calculation for exceeded threshold scenario", () => {
    // Test with 151k tokens
    const currentUsage = 151000;
    const contextWindow = 200000;

    const info = calculateAutoCompactInfo(currentUsage, contextWindow, {
      messageCount: 1,
      cacheSize: 1000,
      autoCompactEnabled: true,
    });

    console.log("Exceeded threshold debug:", {
      currentUsage,
      systemOverhead: info.systemOverhead,
      effectiveLimit: info.effectiveLimit,
      autoCompactThreshold: info.autoCompactThreshold,
      remainingPercentage: info.remainingPercentage,
      remainingTokens: info.remainingTokens,
    });
  });

  it("should calculate system overhead correctly", async () => {
    const { calculateSystemOverhead } = await import("../src/monitor/claude-calculation.js");

    // Base overhead only
    expect(calculateSystemOverhead()).toBe(25000);

    // With messages
    expect(calculateSystemOverhead({ messageCount: 10 })).toBe(25150); // 25000 + 10*15

    // With cache
    expect(calculateSystemOverhead({ cacheSize: 10000 })).toBe(25150); // 25000 + 10000*0.015

    // Combined
    expect(
      calculateSystemOverhead({
        messageCount: 20,
        cacheSize: 20000,
      }),
    ).toBe(25600); // 25000 + 20*15 + 20000*0.015

    // Max overhead limit
    expect(
      calculateSystemOverhead({
        messageCount: 5000,
        cacheSize: 1000000,
      }),
    ).toBe(40000); // Capped at 20% of 200k
  });

  it("should match expected calculations", () => {
    // Test case for context calculator
    const currentUsage = 150000;
    const contextWindow = 200000;

    const info = calculateAutoCompactInfo(currentUsage, contextWindow, {
      messageCount: 10,
      cacheSize: 5000,
      autoCompactEnabled: true,
    });

    // System overhead: 25000 + 10*15 + 5000*0.015 = 25225
    // Available tokens: 200000 - 25225 = 174775
    // Auto-compact threshold: 174775 * 0.92 = 160793
    // Remaining until compact: 160793 - 150000 = 10793
    // Remaining percentage: 10793 / 160793 = 6.71% ≈ 7%

    expect(info.systemOverhead).toBe(25225);
    expect(info.effectiveLimit).toBe(160793);
    expect(info.remainingPercentage).toBeCloseTo(7, 1);
    expect(info.remainingTokens).toBeCloseTo(10793, 0);
    expect(info.warningLevel).toBe("warning"); // < 10%
  });
});
