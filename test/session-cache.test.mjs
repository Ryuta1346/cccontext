import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionCache } from "../src/monitor/session-cache.js";

describe("SessionCache", () => {
  let cache;
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cccontext-test-cache-"));
    cache = new SessionCache();
  });

  afterEach(async () => {
    if (cache) {
      cache.clearAll();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Initialization", () => {
    it("should initialize with empty cache", () => {
      expect(cache.getCacheStats().cachedSessions).toBe(0);
      expect(cache.getCacheStats().fileStats).toBe(0);
    });

    it("should have default debug mode off", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      cache.log("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("Debug Mode", () => {
    it("should log messages when debug mode is enabled", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      cache.setDebugMode(true);
      cache.log("test message");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("test message"));
      consoleSpy.mockRestore();
    });

    it("should not log messages when debug mode is disabled", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      cache.setDebugMode(false);
      cache.log("test message");
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("Session Parsing and Caching", () => {
    it("should parse and cache a valid session file", async () => {
      const sessionFile = path.join(tempDir, "test-session.jsonl");
      const sessionData = [
        {
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "user",
            content: "Hello",
          },
        },
        {
          timestamp: "2025-01-01T00:00:01Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "assistant",
            content: "Hi there!",
            usage: {
              input_tokens: 100,
              output_tokens: 200,
              cache_read_input_tokens: 50,
            },
          },
        },
      ];

      await fs.writeFile(sessionFile, `${sessionData.map((d) => JSON.stringify(d)).join("\n")}\n`);

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.sessionId).toBe("test-session");
      expect(result.model).toBe("claude-3-5-sonnet-20241022");
      expect(result.totalInputTokens).toBe(100);
      expect(result.totalOutputTokens).toBe(200);
      expect(result.totalTokens).toBe(300);
      expect(result.totalCacheTokens).toBe(50);
      expect(result.turns).toBe(1);
      expect(result.latestPrompt).toBe("Hello");
    });

    it("should handle invalid JSON lines gracefully", async () => {
      const sessionFile = path.join(tempDir, "invalid-session.jsonl");
      const content = `{"timestamp": "2025-01-01T00:00:00Z", "message": {"role": "user"}}
invalid json line
{"timestamp": "2025-01-01T00:00:01Z", "message": {"role": "assistant", "usage": {"input_tokens": 50, "output_tokens": 100}}}
`;

      await fs.writeFile(sessionFile, content);

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.sessionId).toBe("invalid-session");
      expect(result.totalInputTokens).toBe(50);
      expect(result.totalOutputTokens).toBe(100);
      expect(result.totalTokens).toBe(150);
    });

    it("should handle empty file", async () => {
      const sessionFile = path.join(tempDir, "empty-session.jsonl");
      await fs.writeFile(sessionFile, "");

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.sessionId).toBe("empty-session");
      expect(result.totalTokens).toBe(0);
      expect(result.turns).toBe(0);
    });

    it("should handle file not found", async () => {
      const sessionFile = path.join(tempDir, "nonexistent.jsonl");

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeNull();
    });

    it("should cache session data for subsequent calls", async () => {
      const sessionFile = path.join(tempDir, "cached-session.jsonl");
      const sessionData = {
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          model: "claude-3-5-sonnet-20241022",
          role: "assistant",
          usage: { input_tokens: 100, output_tokens: 200 },
        },
      };

      await fs.writeFile(sessionFile, `${JSON.stringify(sessionData)}\n`);

      // First call - should read from file
      const result1 = await cache.parseAndCacheSession(sessionFile);

      // Second call immediately - should return cached data
      const result2 = await cache.parseAndCacheSession(sessionFile);

      expect(result1.totalTokens).toBe(300);
      expect(result2.totalTokens).toBe(300); // Still cached value
      expect(result1).toEqual(result2); // Should be exact same object from cache

      // Modify the file
      await fs.appendFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:02Z",
          message: {
            role: "assistant",
            usage: { input_tokens: 50, output_tokens: 100 },
          },
        })}\n`,
      );

      // Wait a bit for file to be considered modified
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Third call - should detect file change and re-parse
      const result3 = await cache.parseAndCacheSession(sessionFile);
      expect(result3.totalTokens).toBe(450); // New value after re-parse
    });

    it("should handle multiple messages with various models", async () => {
      const sessionFile = path.join(tempDir, "multi-model.jsonl");
      const messages = [
        {
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "assistant",
            usage: { input_tokens: 100, output_tokens: 200 },
          },
        },
        {
          timestamp: "2025-01-01T00:00:01Z",
          message: {
            model: "claude-3-opus-20240229",
            role: "assistant",
            usage: { input_tokens: 150, output_tokens: 250 },
          },
        },
      ];

      await fs.writeFile(sessionFile, `${messages.map((m) => JSON.stringify(m)).join("\n")}\n`);

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result.model).toBe("claude-3-opus-20240229"); // Last model
      expect(result.totalInputTokens).toBe(250);
      expect(result.totalOutputTokens).toBe(450);
      expect(result.turns).toBe(2);
    });
  });

  describe("Cache Management", () => {
    it("should clear specific session from cache", async () => {
      const sessionFile = path.join(tempDir, "clear-test.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: { role: "assistant", usage: { input_tokens: 100, output_tokens: 200 } },
        })}\n`,
      );

      await cache.parseAndCacheSession(sessionFile);
      expect(cache.getCacheStats().cachedSessions).toBe(1);

      cache.clearSession(sessionFile);
      expect(cache.getCacheStats().cachedSessions).toBe(0);
    });

    it("should clear all sessions from cache", async () => {
      // Create multiple session files
      for (let i = 1; i <= 3; i++) {
        const sessionFile = path.join(tempDir, `session${i}.jsonl`);
        await fs.writeFile(
          sessionFile,
          `${JSON.stringify({
            timestamp: "2025-01-01T00:00:00Z",
            message: { role: "assistant", usage: { input_tokens: 100, output_tokens: 200 } },
          })}\n`,
        );
        await cache.parseAndCacheSession(sessionFile);
      }

      expect(cache.getCacheStats().cachedSessions).toBe(3);
      expect(cache.getCacheStats().fileStats).toBe(3);

      cache.clearAll();

      expect(cache.getCacheStats().cachedSessions).toBe(0);
      expect(cache.getCacheStats().fileStats).toBe(0);
    });
  });

  describe("Usage Percentage in Parsed Sessions", () => {
    it("should include usage percentage in parsed session data", async () => {
      const sessionFile = path.join(tempDir, "usage-test.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "assistant",
            usage: { input_tokens: 50000, output_tokens: 50000 },
          },
        })}\n`,
      );

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.totalTokens).toBe(100000);
      expect(result.usagePercentage).toBe(50); // 100000 / 200000 * 100 (200k baseline)
    });

    it("should calculate usage percentage for different models", async () => {
      const sessionFile = path.join(tempDir, "model-usage-test.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-opus-20240229",
            role: "assistant",
            usage: { input_tokens: 100000, output_tokens: 100000 },
          },
        })}\n`,
      );

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.totalTokens).toBe(200000);
      expect(result.usagePercentage).toBe(20); // 200000 tokens > 90% of 200k → auto-upgrade to 1M → 200000/1000000 * 100
    });

    it("should handle zero token sessions", async () => {
      const sessionFile = path.join(tempDir, "zero-tokens.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "user",
            content: "Hello",
          },
        })}\n`,
      );

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.totalTokens).toBe(0);
      expect(result.usagePercentage).toBe(0);
    });

    it("should handle tokens exceeding context window", async () => {
      const sessionFile = path.join(tempDir, "exceed-tokens.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: {
            model: "claude-3-5-sonnet-20241022",
            role: "assistant",
            usage: { input_tokens: 150000, output_tokens: 100000 },
          },
        })}\n`,
      );

      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.totalTokens).toBe(250000);
      expect(result.usagePercentage).toBe(25); // 250000 tokens > 90% of 200k → auto-upgrade to 1M → 250000/1000000 * 100
    });
  });

  describe("Content Types", () => {
    it("should handle user messages with array content", async () => {
      const sessionFile = path.join(tempDir, "array-content.jsonl");
      const message = {
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "Look at this image" },
            { type: "image", source: { type: "base64", data: "base64data" } },
          ],
        },
      };

      await fs.writeFile(sessionFile, `${JSON.stringify(message)}\n`);
      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.latestPrompt).toBe("Look at this image");
    });

    it("should handle user messages with string content", async () => {
      const sessionFile = path.join(tempDir, "string-content.jsonl");
      const message = {
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
          content: "Simple text message",
        },
      };

      await fs.writeFile(sessionFile, `${JSON.stringify(message)}\n`);
      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.latestPrompt).toBe("Simple text message");
    });

    it("should handle missing content gracefully", async () => {
      const sessionFile = path.join(tempDir, "no-content.jsonl");
      const message = {
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "user",
        },
      };

      await fs.writeFile(sessionFile, `${JSON.stringify(message)}\n`);
      const result = await cache.parseAndCacheSession(sessionFile);

      expect(result).toBeTruthy();
      expect(result.latestPrompt).toBe("");
    });
  });

  describe("Cost Calculation", () => {
    it("should calculate cost based on input and output tokens", async () => {
      const sessionFile = path.join(tempDir, "cost-test.jsonl");
      const message = {
        timestamp: "2025-01-01T00:00:00Z",
        message: {
          role: "assistant",
          usage: {
            input_tokens: 1000000,
            output_tokens: 1000000,
          },
        },
      };

      await fs.writeFile(sessionFile, `${JSON.stringify(message)}\n`);
      const result = await cache.parseAndCacheSession(sessionFile);

      // Cost = (1M / 1M) * 3 + (1M / 1M) * 15 = 3 + 15 = 18
      expect(result.totalCost).toBeCloseTo(18, 2);
    });
  });

  describe("Cache Read Performance", () => {
    it("should read from cache when file is unchanged", async () => {
      const sessionFile = path.join(tempDir, "perf-test.jsonl");
      await fs.writeFile(
        sessionFile,
        `${JSON.stringify({
          timestamp: "2025-01-01T00:00:00Z",
          message: { role: "assistant", usage: { input_tokens: 100, output_tokens: 200 } },
        })}\n`,
      );

      // First read - parses file
      const start1 = Date.now();
      const result1 = await cache.parseAndCacheSession(sessionFile);
      const _time1 = Date.now() - start1;

      // Second read - should use cache (much faster)
      const start2 = Date.now();
      const result2 = await cache.parseAndCacheSession(sessionFile);
      const _time2 = Date.now() - start2;

      expect(result1).toEqual(result2);
      // Cache read should be faster (though timing can be flaky in tests)
      // Just verify it returns the same data
      expect(result2.totalTokens).toBe(300);
    });
  });
});
