// AutoCompact configuration

interface SystemOverhead {
  BASE: number;
  PER_MESSAGE: number;
  CACHE_FACTOR: number;
  MAX_RATIO: number;
}

interface ModelThresholds {
  [key: string]: number;
}

type WarningLevel = "active" | "critical" | "warning" | "notice" | "normal";

interface AutoCompactConfiguration {
  DEFAULT_THRESHOLD: number;
  SYSTEM_OVERHEAD: SystemOverhead;
  MODEL_THRESHOLDS: ModelThresholds;
  getThreshold(model: string): number;
  getWarningLevel(remainingPercentage: number): WarningLevel;
}

export const AUTO_COMPACT_CONFIG: AutoCompactConfiguration = {
  DEFAULT_THRESHOLD: 0.92, // Trigger at 92%

  SYSTEM_OVERHEAD: {
    BASE: 25_000,
    PER_MESSAGE: 15,
    CACHE_FACTOR: 0.015,
    MAX_RATIO: 0.2,
  },

  MODEL_THRESHOLDS: {
    // 200k context window models
    "claude-opus-4-6": 0.92,
    "claude-opus-4-5-20251101": 0.92,
    "claude-opus-4-1-20250805": 0.92,
    "claude-opus-4-20250514": 0.92,
    "claude-3-opus-20241022": 0.92,
    "claude-sonnet-4-5-20250929": 0.92,
    "claude-sonnet-4-20250514": 0.92,
    "claude-3-7-sonnet-20250219": 0.92,
    "claude-3-5-sonnet-20241022": 0.92,
    "claude-haiku-4-5-20251001": 0.92,
    "claude-3-5-haiku-20241022": 0.92,
    "claude-3-haiku-20240307": 0.92,
    "claude-2.1": 0.92,
    "claude-2.0": 0.92,
    "claude-instant-1.2": 0.92,

    // 1M context window models
    "claude-opus-4-6[1m]": 0.92,
    "claude-opus-4-5-20251101[1m]": 0.92,
    "claude-opus-4-1-20250805[1m]": 0.92,
    "claude-opus-4-20250514[1m]": 0.92,
    "claude-3-opus-20241022[1m]": 0.92,
    "claude-sonnet-4-5-20250929[1m]": 0.92,
    "claude-sonnet-4-20250514[1m]": 0.92,
    "claude-3-7-sonnet-20250219[1m]": 0.92,
    "claude-3-5-sonnet-20241022[1m]": 0.92,
    "claude-haiku-4-5-20251001[1m]": 0.92,
    "claude-3-5-haiku-20241022[1m]": 0.92,
    "claude-3-haiku-20240307[1m]": 0.92,
  },

  getThreshold(model: string): number {
    return this.MODEL_THRESHOLDS[model] || this.DEFAULT_THRESHOLD;
  },

  getWarningLevel(remainingPercentage: number): WarningLevel {
    if (remainingPercentage <= 0) return "active";
    if (remainingPercentage < 5) return "critical";
    if (remainingPercentage < 10) return "warning";
    if (remainingPercentage < 20) return "notice";
    return "normal";
  },
};
