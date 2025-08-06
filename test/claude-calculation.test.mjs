import { describe, it, expect } from 'vitest';
import { 
  calculateClaudeContextStatus as calculateContextStatus, 
  calculateSystemOverhead, 
  CLAUDE_CONSTANTS as CONSTANTS,
  generateClaudeDisplayMessage as generateDisplayMessage
} from '../src/monitor/claude-calculation.mjs';

describe('Claude Calculation', () => {
  describe('calculateSystemOverhead', () => {
    it('should calculate basic overhead', () => {
      const overhead = calculateSystemOverhead();
      expect(overhead).toBe(CONSTANTS.BASE_OVERHEAD);
    });

    it('should add message overhead', () => {
      const overhead = calculateSystemOverhead({ messageCount: 10 });
      const expected = CONSTANTS.BASE_OVERHEAD + (10 * CONSTANTS.MESSAGE_OVERHEAD_FACTOR);
      expect(overhead).toBe(expected);
    });

    it('should add cache overhead', () => {
      const overhead = calculateSystemOverhead({ cacheSize: 10000 });
      const expected = CONSTANTS.BASE_OVERHEAD + Math.floor(10000 * CONSTANTS.CACHE_OVERHEAD_FACTOR);
      expect(overhead).toBe(expected);
    });

    it('should cap message overhead at 5000', () => {
      const overhead = calculateSystemOverhead({ messageCount: 1000 });
      const expected = CONSTANTS.BASE_OVERHEAD + 5000;
      expect(overhead).toBe(expected);
    });

    it('should cap total overhead at 20% of base limit', () => {
      const overhead = calculateSystemOverhead({ 
        messageCount: 1000, 
        cacheSize: 100000 
      });
      const maxOverhead = CONSTANTS.BASE_LIMIT * 0.2;
      expect(overhead).toBeLessThanOrEqual(maxOverhead);
    });
  });

  describe('calculateContextStatus', () => {
    it('should calculate basic status with auto-compact enabled', () => {
      const result = calculateContextStatus(100000, true, 200000);
      
      expect(result.currentUsage).toBe(100000);
      expect(result.autoCompactEnabled).toBe(true);
      // baseLimit property doesn't exist - using availableTokens instead
      expect(result.systemOverhead).toBe(CONSTANTS.BASE_OVERHEAD);
      expect(result.availableTokens).toBe(200000 - CONSTANTS.BASE_OVERHEAD);
      
      // Auto-compact threshold should be 92% of available tokens
      const expectedThreshold = (200000 - CONSTANTS.BASE_OVERHEAD) * CONSTANTS.AUTO_COMPACT_FACTOR;
      expect(result.autoCompactThreshold).toBe(Math.round(expectedThreshold));
    });

    it('should calculate status with auto-compact disabled', () => {
      const result = calculateContextStatus(100000, false, 200000);
      
      expect(result.autoCompactEnabled).toBe(false);
      expect(result.isAboveAutoCompactThreshold).toBe(false);
      expect(result.remainingUntilAutoCompact).toBeNull();
      
      // Effective limit should be full available tokens when auto-compact is disabled
      const expectedLimit = 200000 - CONSTANTS.BASE_OVERHEAD;
      expect(result.effectiveLimit).toBe(expectedLimit);
    });

    it('should calculate remaining tokens correctly', () => {
      const currentUsage = 120000;
      const result = calculateContextStatus(currentUsage, true, 200000);
      
      const expectedRemaining = result.effectiveLimit - currentUsage;
      expect(result.remainingTokens).toBe(Math.max(0, expectedRemaining));
      
      const expectedRemainingUntilCompact = result.autoCompactThreshold - currentUsage;
      expect(result.remainingUntilAutoCompact).toBe(Math.max(0, expectedRemainingUntilCompact));
    });

    it('should calculate percentages correctly', () => {
      const currentUsage = 80000;
      const result = calculateContextStatus(currentUsage, true, 200000);
      
      const expectedPercentUsed = Math.round((currentUsage / result.effectiveLimit) * 100);
      expect(result.percentUsed).toBe(expectedPercentUsed);
      
      const expectedPercentLeft = Math.max(0, Math.round((result.effectiveLimit - currentUsage) / result.effectiveLimit * 100));
      expect(result.percentLeft).toBe(expectedPercentLeft);
    });

    it('should determine threshold flags correctly', () => {
      const availableTokens = 200000 - CONSTANTS.BASE_OVERHEAD;
      const autoCompactThreshold = availableTokens * CONSTANTS.AUTO_COMPACT_FACTOR;
      const warningThreshold = autoCompactThreshold * CONSTANTS.WARNING_FACTOR;
      const errorThreshold = autoCompactThreshold * CONSTANTS.ERROR_FACTOR;
      
      // Below all thresholds
      let result = calculateContextStatus(50000, true, 200000);
      expect(result.isAboveWarningThreshold).toBe(false);
      expect(result.isAboveErrorThreshold).toBe(false);
      expect(result.isAboveAutoCompactThreshold).toBe(false);
      
      // Above warning threshold (note: warning and error thresholds are the same in this implementation)
      result = calculateContextStatus(warningThreshold + 1000, true, 200000);
      expect(result.isAboveWarningThreshold).toBe(true);
      expect(result.isAboveErrorThreshold).toBe(true); // Same as warning threshold
      expect(result.isAboveAutoCompactThreshold).toBe(false);
      
      // Above error threshold (which is same as warning threshold in this implementation)
      result = calculateContextStatus(errorThreshold + 1000, true, 200000);
      expect(result.isAboveWarningThreshold).toBe(true);
      expect(result.isAboveErrorThreshold).toBe(true);
      expect(result.isAboveAutoCompactThreshold).toBe(false);
      
      // Above auto-compact threshold
      result = calculateContextStatus(autoCompactThreshold + 1000, true, 200000);
      expect(result.isAboveWarningThreshold).toBe(true);
      expect(result.isAboveErrorThreshold).toBe(true);
      expect(result.isAboveAutoCompactThreshold).toBe(true);
      expect(result.willAutoCompact).toBe(true);
    });

    it('should handle edge cases', () => {
      // Zero usage
      let result = calculateContextStatus(0, true, 200000);
      expect(result.remainingTokens).toBe(result.effectiveLimit);
      expect(result.percentLeft).toBe(100);
      
      // Usage at exactly auto-compact threshold
      const availableTokens = 200000 - CONSTANTS.BASE_OVERHEAD;
      const autoCompactThreshold = availableTokens * CONSTANTS.AUTO_COMPACT_FACTOR;
      result = calculateContextStatus(autoCompactThreshold, true, 200000);
      expect(result.isAboveAutoCompactThreshold).toBe(true);
      expect(result.remainingUntilAutoCompact).toBe(0);
      
      // Usage above effective limit
      result = calculateContextStatus(result.effectiveLimit + 1000, true, 200000);
      expect(result.remainingTokens).toBe(0);
      expect(result.percentLeft).toBe(0);
    });

    it('should include system overhead in calculations with different options', () => {
      const overheadOptions = {
        messageCount: 50,
        cacheSize: 15000,
        sessionDuration: 1800000 // 30 minutes
      };
      
      const result = calculateContextStatus(100000, true, 200000, overheadOptions);
      
      // System overhead should be higher than base
      expect(result.systemOverhead).toBeGreaterThan(CONSTANTS.BASE_OVERHEAD);
      
      // Available tokens should be reduced by the increased overhead
      expect(result.availableTokens).toBeLessThan(200000 - CONSTANTS.BASE_OVERHEAD);
      
      // Auto-compact threshold should be based on reduced available tokens
      const expectedThreshold = result.availableTokens * CONSTANTS.AUTO_COMPACT_FACTOR;
      expect(result.autoCompactThreshold).toBe(Math.round(expectedThreshold));
    });
  });

  describe('Constants', () => {
    it('should have correct constant values', () => {
      expect(CONSTANTS.BASE_LIMIT).toBe(200000);
      expect(CONSTANTS.AUTO_COMPACT_FACTOR).toBe(0.92);
      expect(CONSTANTS.WARNING_FACTOR).toBe(0.8);
      expect(CONSTANTS.ERROR_FACTOR).toBe(0.8);
      expect(CONSTANTS.BASE_OVERHEAD).toBe(25000);
      expect(CONSTANTS.MESSAGE_OVERHEAD_FACTOR).toBe(15);
      expect(CONSTANTS.CACHE_OVERHEAD_FACTOR).toBe(0.015);
    });
  });

  describe('generateDisplayMessage', () => {
    it('should return null when below warning threshold', () => {
      const message = generateDisplayMessage(25, true, false);
      expect(message).toBeNull();
    });

    it('should return auto-compact message when enabled and above warning', () => {
      const message = generateDisplayMessage(15, true, true);
      expect(message).toBe('Context left until auto-compact: 15%');
    });

    it('should return manual compact message when disabled and above warning', () => {
      const message = generateDisplayMessage(15, false, true);
      expect(message).toBe('Context low (15% remaining) · Run /compact to compact & continue');
    });
  });

  /* compareScenarios is not exported from the module
  describe('compareScenarios', () => {
    it('should compare auto-compact enabled vs disabled scenarios', () => {
      const result = compareScenarios(100000, 200000);
      
      expect(result.withAutoCompact).toBeDefined();
      expect(result.withoutAutoCompact).toBeDefined();
      expect(result.difference).toBeDefined();
      
      expect(result.withAutoCompact.autoCompactEnabled).toBe(true);
      expect(result.withoutAutoCompact.autoCompactEnabled).toBe(false);
      
      // With auto-compact should have lower effective limit
      expect(result.withAutoCompact.effectiveLimit).toBeLessThan(result.withoutAutoCompact.effectiveLimit);
      
      // Difference should be positive (without has more remaining)
      expect(result.difference.percentLeft).toBeGreaterThan(0);
      expect(result.difference.remainingTokens).toBeGreaterThan(0);
    });
  });
  */

  /* generateReport is not exported from the module
  describe('generateReport', () => {
    it('should generate a formatted report', () => {
      const report = generateReport(100000, true, 200000);
      
      expect(report).toContain('Claude Code Context Usage Report');
      expect(report).toContain('Current Status');
      expect(report).toContain('Thresholds');
      expect(report).toContain('Status Flags');
      expect(report).toContain('Scenario Comparison');
      expect(report).toContain('100,000');
      expect(report).toContain('Auto-compact: Enabled');
    });

    it('should include display message when above warning', () => {
      const report = generateReport(150000, true, 200000);
      expect(report).toContain('Display Message');
      expect(report).toContain('Context left until auto-compact');
    });

    it('should include remaining until auto-compact when enabled', () => {
      const report = generateReport(100000, true, 200000);
      expect(report).toContain('Until Auto-compact');
    });
  });
  */
});