// AutoCompact configuration
export const AUTO_COMPACT_CONFIG = {
  DEFAULT_THRESHOLD: 0.92, // Trigger at 92%
  
  SYSTEM_OVERHEAD: {
    BASE: 25_000,
    PER_MESSAGE: 15,
    CACHE_FACTOR: 0.015,
    MAX_RATIO: 0.2
  },
  
  MODEL_THRESHOLDS: {
    'claude-3-5-sonnet-20241022': 0.92,
    'claude-3-5-haiku-20241022': 0.92,
    'claude-3-opus-20241022': 0.92,
    'claude-opus-4-20250514': 0.92,
    'claude-opus-4-1-20250805': 0.92,
    'claude-sonnet-4-20250514': 0.92,
    'claude-3-haiku-20240307': 0.92,
    'claude-2.1': 0.92,
    'claude-2.0': 0.92,
    'claude-instant-1.2': 0.92
  },
  
  getThreshold(model) {
    return this.MODEL_THRESHOLDS[model] || this.DEFAULT_THRESHOLD;
  },
  
  getWarningLevel(remainingPercentage) {
    if (remainingPercentage <= 0) return 'active';
    if (remainingPercentage < 5) return 'critical';
    if (remainingPercentage < 10) return 'warning';
    if (remainingPercentage < 20) return 'notice';
    return 'normal';
  }
};