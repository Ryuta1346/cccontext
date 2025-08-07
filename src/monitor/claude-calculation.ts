/**
 * Claude Code Auto-compact calculation module
 */

interface SystemOverheadOptions {
  messageCount?: number;
  cacheSize?: number;
  sessionDuration?: number;
}

interface ClaudeContextStatus {
  currentUsage: number;
  availableTokens: number;
  effectiveLimit: number;
  autoCompactEnabled: boolean;
  systemOverhead: number;
  percentLeft: number;
  percentUsed: number;
  remainingTokens: number;
  remainingUntilAutoCompact: number | null;
  warningThreshold: number;
  errorThreshold: number;
  autoCompactThreshold: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  willAutoCompact: boolean;
  displayMessage: string | null;
}

interface AutoCompactOptions {
  messageCount?: number;
  cacheSize?: number;
  autoCompactEnabled?: boolean;
}

type WarningLevel = "active" | "critical" | "warning" | "notice" | "normal";

interface AutoCompactInfo {
  enabled: boolean;
  threshold: number;
  thresholdPercentage: number;
  remainingPercentage: number;
  remainingTokens: number;
  warningLevel: WarningLevel;
  willCompactSoon: boolean;
  effectiveLimit: number;
  systemOverhead: number;
  autoCompactThreshold: number;
}

export const CLAUDE_CONSTANTS = {
  BASE_LIMIT: 200_000,
  AUTO_COMPACT_FACTOR: 0.92,
  WARNING_FACTOR: 0.8,
  ERROR_FACTOR: 0.8,

  BASE_OVERHEAD: 25_000,
  MESSAGE_OVERHEAD_FACTOR: 15,
  CACHE_OVERHEAD_FACTOR: 0.015,
};

/**
 * Calculate system overhead
 */
export function calculateSystemOverhead(options: SystemOverheadOptions = {}): number {
  const { messageCount = 0, cacheSize = 0 } = options;

  let overhead = CLAUDE_CONSTANTS.BASE_OVERHEAD;

  if (messageCount > 0) {
    overhead += Math.min(messageCount * CLAUDE_CONSTANTS.MESSAGE_OVERHEAD_FACTOR, 5000);
  }

  if (cacheSize > 0) {
    overhead += Math.floor(cacheSize * CLAUDE_CONSTANTS.CACHE_OVERHEAD_FACTOR);
  }

  const maxOverhead = CLAUDE_CONSTANTS.BASE_LIMIT * 0.2;
  return Math.min(overhead, maxOverhead);
}

/**
 * Calculate Claude context status
 */
export function calculateClaudeContextStatus(
  currentUsage: number,
  autoCompactEnabled: boolean = false,
  availableTokens: number = CLAUDE_CONSTANTS.BASE_LIMIT,
  overheadOptions: SystemOverheadOptions = {},
): ClaudeContextStatus {
  const systemOverhead = calculateSystemOverhead(overheadOptions);

  // Available tokens after overhead
  const LkB = availableTokens - systemOverhead;

  const autoCompactThreshold = LkB * CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR;

  const effectiveLimit = autoCompactEnabled ? autoCompactThreshold : LkB;

  const percentLeft = Math.max(0, Math.round(((effectiveLimit - currentUsage) / effectiveLimit) * 100));

  const warningThreshold = effectiveLimit * CLAUDE_CONSTANTS.WARNING_FACTOR;
  const errorThreshold = effectiveLimit * CLAUDE_CONSTANTS.ERROR_FACTOR;

  const isAboveWarningThreshold = currentUsage >= warningThreshold;
  const isAboveErrorThreshold = currentUsage >= errorThreshold;
  const isAboveAutoCompactThreshold = autoCompactEnabled && currentUsage >= autoCompactThreshold;

  const remainingTokens = Math.max(0, effectiveLimit - currentUsage);
  const remainingUntilAutoCompact = autoCompactEnabled ? Math.max(0, autoCompactThreshold - currentUsage) : null;

  return {
    currentUsage,
    availableTokens: LkB,
    effectiveLimit,
    autoCompactEnabled,
    systemOverhead,

    percentLeft,
    percentUsed: Math.round((currentUsage / effectiveLimit) * 100),

    remainingTokens,
    remainingUntilAutoCompact,

    warningThreshold: Math.round(warningThreshold),
    errorThreshold: Math.round(errorThreshold),
    autoCompactThreshold: Math.round(autoCompactThreshold),

    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    willAutoCompact: isAboveAutoCompactThreshold,

    displayMessage: generateClaudeDisplayMessage(percentLeft, autoCompactEnabled, isAboveWarningThreshold),
  };
}

/**
 * Generate display message
 */
export function generateClaudeDisplayMessage(
  percentLeft: number,
  autoCompactEnabled: boolean,
  isAboveWarningThreshold: boolean,
): string | null {
  if (!isAboveWarningThreshold) {
    return null;
  }

  if (autoCompactEnabled) {
    return `Context left until auto-compact: ${percentLeft}%`;
  }

  return `Context low (${percentLeft}% remaining) · Run /compact to compact & continue`;
}

/**
 * Calculate auto-compact info
 */
export function calculateAutoCompactInfo(
  currentUsage: number,
  contextWindow: number = CLAUDE_CONSTANTS.BASE_LIMIT,
  options: AutoCompactOptions = {},
): AutoCompactInfo {
  const { messageCount = 0, cacheSize = 0, autoCompactEnabled = true } = options;

  const status = calculateClaudeContextStatus(currentUsage, autoCompactEnabled, contextWindow, {
    messageCount,
    cacheSize,
  });

  const percentageUntilCompact =
    autoCompactEnabled && status.remainingUntilAutoCompact !== null
      ? Math.round((status.remainingUntilAutoCompact / status.effectiveLimit) * 100)
      : 0;

  let warningLevel: WarningLevel = "normal";
  if (percentageUntilCompact <= 0) {
    warningLevel = "active";
  } else if (percentageUntilCompact < 5) {
    warningLevel = "critical";
  } else if (percentageUntilCompact < 10) {
    warningLevel = "warning";
  } else if (percentageUntilCompact < 20) {
    warningLevel = "notice";
  }

  return {
    enabled: autoCompactEnabled,
    threshold: CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR,
    thresholdPercentage: CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR * 100,
    remainingPercentage: percentageUntilCompact,
    remainingTokens: status.remainingUntilAutoCompact || 0,
    warningLevel,
    willCompactSoon: percentageUntilCompact < 5,
    effectiveLimit: status.effectiveLimit,
    systemOverhead: status.systemOverhead,
    autoCompactThreshold: status.autoCompactThreshold,
  };
}
