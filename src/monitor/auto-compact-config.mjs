// AutoCompact機能の設定
// Claude Codeの内部実装と完全に一致させるための設定
export const AUTO_COMPACT_CONFIG = {
  // デフォルトのAutoCompact発動閾値
  DEFAULT_THRESHOLD: 0.92, // 92%でAutoCompact発動（Claude Code実装解析より）
  
  // システムオーバーヘッド定数（Claude Code LkB関数の模倣）
  SYSTEM_OVERHEAD: {
    BASE: 25_000,              // 基本オーバーヘッド（約25kトークン）
    PER_MESSAGE: 15,           // メッセージあたりのオーバーヘッド
    CACHE_FACTOR: 0.015,       // キャッシュサイズに対する係数
    MAX_RATIO: 0.2             // 最大オーバーヘッド比率（20%）
  },
  
  // モデル別の閾値（公式仕様ではモデル差異なしのため統一）
  MODEL_THRESHOLDS: {
    'claude-3-5-sonnet-20241022': 0.92,
    'claude-3-5-haiku-20241022': 0.92,
    'claude-3-opus-20241022': 0.92,
    'claude-opus-4-20250514': 0.92,
    'claude-sonnet-4-20250514': 0.92,
    'claude-3-haiku-20240307': 0.92,
    'claude-2.1': 0.92,
    'claude-2.0': 0.92,
    'claude-instant-1.2': 0.92
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