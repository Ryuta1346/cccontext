// AutoCompact機能の設定
export const AUTO_COMPACT_CONFIG = {
  // デフォルトのAutoCompact発動閾値
  DEFAULT_THRESHOLD: 0.95, // 95%でAutoCompact発動（Claude Code CLI公式仕様）
  
  // モデル別の閾値（公式仕様ではモデル差異なしのため統一）
  MODEL_THRESHOLDS: {
    'claude-3-5-sonnet-20241022': 0.95,
    'claude-3-5-haiku-20241022': 0.95,
    'claude-3-opus-20241022': 0.95,
    'claude-opus-4-20250514': 0.95,
    'claude-sonnet-4-20250514': 0.95,
    'claude-3-haiku-20240307': 0.95,
    'claude-2.1': 0.95,
    'claude-2.0': 0.95,
    'claude-instant-1.2': 0.95
  },
  
  // モデルに応じた閾値を取得
  getThreshold(model) {
    return this.MODEL_THRESHOLDS[model] || this.DEFAULT_THRESHOLD;
  },
  
  // 警告レベルを判定
  getWarningLevel(remainingPercentage) {
    if (remainingPercentage <= 0) return 'active';
    if (remainingPercentage < 5) return 'critical';
    if (remainingPercentage < 10) return 'warning';
    if (remainingPercentage < 20) return 'notice';
    return 'normal';
  }
};