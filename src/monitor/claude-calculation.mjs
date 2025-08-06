/**
 * Claude Code Auto-compact残容量計算モジュール
 * 
 * このモジュールは ../research/tools/claude-context-calculator/src/calculator.js の
 * 計算ロジックを直接移植したものです。
 * 
 * claude-context-calculatorの解析結果に基づく正確な計算実装
 * Claude Codeの内部実装（Hd関数）を完全に再現
 * 
 * 基づくソースコード解析:
 * - cli.js:1972行目周辺の Hd関数
 * - 定数: UkB=200000, oH8=0.92, tH8=0.8, eH8=0.8
 * 
 * 移植元: ../research/tools/claude-context-calculator/src/calculator.js
 * 最終同期: 2025-08-05
 */

// Claude Code の定数 (解析結果より)
export const CLAUDE_CONSTANTS = {
  BASE_LIMIT: 200_000,          // UkB: 基本上限値
  AUTO_COMPACT_FACTOR: 0.92,    // oH8: 自動コンパクト閾値係数
  WARNING_FACTOR: 0.8,          // tH8: 警告閾値係数  
  ERROR_FACTOR: 0.8,            // eH8: エラー閾値係数
  
  // システムオーバーヘッド定数（Claude Codeとの差異を補正）
  // LkB()関数の内部処理を模倣するための推定値
  BASE_OVERHEAD: 25_000,        // 基本オーバーヘッド（約25kトークン）
  MESSAGE_OVERHEAD_FACTOR: 15,  // メッセージあたりのオーバーヘッド
  CACHE_OVERHEAD_FACTOR: 0.015  // キャッシュサイズに対する係数
};

/**
 * システムオーバーヘッドを計算（LkB関数のB値を模倣）
 * 
 * Claude Codeの内部処理では、LkB()関数が以下のように実装されている：
 * function LkB(){
 *     let A=DG(),B=lL0(A);
 *     return UkB-B
 * }
 * 
 * このB値がシステムオーバーヘッドに相当すると推定
 * 
 * @param {Object} options - オプションパラメータ
 * @param {number} options.messageCount - メッセージ数
 * @param {number} options.cacheSize - 現在のキャッシュサイズ
 * @param {number} options.sessionDuration - セッション継続時間（ミリ秒）
 * @returns {number} 推定オーバーヘッド
 */
export function calculateSystemOverhead(options = {}) {
  const {
    messageCount = 0,
    cacheSize = 0,
    sessionDuration = 0
  } = options;
  
  // 基本オーバーヘッド
  let overhead = CLAUDE_CONSTANTS.BASE_OVERHEAD;
  
  // メッセージ数に基づく追加オーバーヘッド
  if (messageCount > 0) {
    overhead += Math.min(messageCount * CLAUDE_CONSTANTS.MESSAGE_OVERHEAD_FACTOR, 5000);
  }
  
  // キャッシュサイズに基づく追加オーバーヘッド
  if (cacheSize > 0) {
    overhead += Math.floor(cacheSize * CLAUDE_CONSTANTS.CACHE_OVERHEAD_FACTOR);
  }
  
  // 最大オーバーヘッドの制限（基本上限の20%まで）
  const maxOverhead = CLAUDE_CONSTANTS.BASE_LIMIT * 0.2;
  return Math.min(overhead, maxOverhead);
}

/**
 * Claude Code Hd関数の完全再実装
 * 
 * 元の実装:
 * function Hd(A){
 *     let B=LkB()*oH8,
 *         Q=JF1()?B:LkB(),
 *         Z=Math.max(0,Math.round((Q-A)/Q*100)),
 *         D=Q*tH8,
 *         G=Q*eH8,
 *         F=A>=D,
 *         Y=A>=G,
 *         I=JF1()&&A>=B;
 *     return{
 *         percentLeft:Z,
 *         isAboveWarningThreshold:F,
 *         isAboveErrorThreshold:Y,
 *         isAboveAutoCompactThreshold:I
 *     }
 * }
 * 
 * @param {number} currentUsage - 現在のトークン使用量
 * @param {boolean} autoCompactEnabled - 自動コンパクト有効フラグ
 * @param {number} availableTokens - 利用可能なトークン数 (通常200000)
 * @param {Object} overheadOptions - オーバーヘッド計算用オプション
 * @returns {Object} 計算結果オブジェクト
 */
export function calculateClaudeContextStatus(currentUsage, autoCompactEnabled = false, availableTokens = CLAUDE_CONSTANTS.BASE_LIMIT, overheadOptions = {}) {
  // システムオーバーヘッドを計算
  const systemOverhead = calculateSystemOverhead(overheadOptions);
  
  // LkB() equivalent - 利用可能な残りトークン数（オーバーヘッドを引く）
  const LkB = availableTokens - systemOverhead;
  
  // B = LkB() * oH8 - 自動コンパクト閾値
  const autoCompactThreshold = LkB * CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR;
  
  // Q = JF1() ? B : LkB() - 有効上限値の決定
  const effectiveLimit = autoCompactEnabled ? autoCompactThreshold : LkB;
  
  // Z = Math.max(0, Math.round((Q-A)/Q*100)) - パーセンテージ計算
  const percentLeft = Math.max(0, Math.round((effectiveLimit - currentUsage) / effectiveLimit * 100));
  
  // 各種閾値の計算
  const warningThreshold = effectiveLimit * CLAUDE_CONSTANTS.WARNING_FACTOR;
  const errorThreshold = effectiveLimit * CLAUDE_CONSTANTS.ERROR_FACTOR;
  
  // 閾値判定
  const isAboveWarningThreshold = currentUsage >= warningThreshold;
  const isAboveErrorThreshold = currentUsage >= errorThreshold;
  const isAboveAutoCompactThreshold = autoCompactEnabled && currentUsage >= autoCompactThreshold;
  
  // 残り容量計算
  const remainingTokens = Math.max(0, effectiveLimit - currentUsage);
  const remainingUntilAutoCompact = autoCompactEnabled 
    ? Math.max(0, autoCompactThreshold - currentUsage) 
    : null;
  
  return {
    // 基本情報
    currentUsage,
    availableTokens: LkB,
    effectiveLimit,
    autoCompactEnabled,
    systemOverhead,
    
    // パーセンテージ情報
    percentLeft,
    percentUsed: Math.round((currentUsage / effectiveLimit) * 100),
    
    // 残容量情報
    remainingTokens,
    remainingUntilAutoCompact,
    
    // 閾値情報
    warningThreshold: Math.round(warningThreshold),
    errorThreshold: Math.round(errorThreshold),
    autoCompactThreshold: Math.round(autoCompactThreshold),
    
    // 状態フラグ
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    willAutoCompact: isAboveAutoCompactThreshold,
    
    // 表示メッセージ (Claude Code と同等)
    displayMessage: generateClaudeDisplayMessage(percentLeft, autoCompactEnabled, isAboveWarningThreshold)
  };
}

/**
 * Claude Code QnB関数に基づくメッセージ生成
 * 
 * @param {number} percentLeft - 残りパーセンテージ
 * @param {boolean} autoCompactEnabled - 自動コンパクト有効フラグ
 * @param {boolean} isAboveWarningThreshold - 警告閾値を超えているか
 * @returns {string|null} 表示メッセージ
 */
export function generateClaudeDisplayMessage(percentLeft, autoCompactEnabled, isAboveWarningThreshold) {
  // 警告閾値未満の場合は表示なし
  if (!isAboveWarningThreshold) {
    return null;
  }
  
  // 自動コンパクト有効時のメッセージ
  if (autoCompactEnabled) {
    return `Context left until auto-compact: ${percentLeft}%`;
  }
  
  // 自動コンパクト無効時のメッセージ
  return `Context low (${percentLeft}% remaining) · Run /compact to compact & continue`;
}

/**
 * Auto-compact残容量の詳細計算
 * cccontextの表示用に特化した計算
 * 
 * @param {number} currentUsage - 現在のトークン使用量（キャッシュ含む）
 * @param {number} contextWindow - コンテキストウィンドウサイズ
 * @param {Object} options - オプション
 * @returns {Object} Auto-compact情報
 */
export function calculateAutoCompactInfo(currentUsage, contextWindow = CLAUDE_CONSTANTS.BASE_LIMIT, options = {}) {
  const {
    messageCount = 0,
    cacheSize = 0,
    autoCompactEnabled = true
  } = options;
  
  // Claude Codeと同じ計算を実行
  const status = calculateClaudeContextStatus(
    currentUsage,
    autoCompactEnabled,
    contextWindow,
    { messageCount, cacheSize }
  );
  
  // 現在の使用率（システムオーバーヘッド考慮後）
  const usagePercentage = (currentUsage / status.availableTokens) * 100;
  
  // Auto-compact発動までの残りパーセンテージ
  // Claude Codeは残りトークン / effective limit で計算している
  const percentageUntilCompact = autoCompactEnabled && status.remainingUntilAutoCompact !== null
    ? Math.round((status.remainingUntilAutoCompact / status.effectiveLimit) * 100)
    : 0;
  
  // 警告レベルの判定
  let warningLevel = 'normal';
  if (percentageUntilCompact <= 0) {
    warningLevel = 'active';
  } else if (percentageUntilCompact < 5) {
    warningLevel = 'critical';
  } else if (percentageUntilCompact < 10) {
    warningLevel = 'warning';
  } else if (percentageUntilCompact < 20) {
    warningLevel = 'notice';
  }
  
  return {
    enabled: autoCompactEnabled,
    threshold: CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR,
    thresholdPercentage: CLAUDE_CONSTANTS.AUTO_COMPACT_FACTOR * 100,
    remainingPercentage: percentageUntilCompact,
    remainingTokens: status.remainingUntilAutoCompact || 0,
    warningLevel,
    willCompactSoon: percentageUntilCompact < 5,
    // Claude Codeとの互換性のための追加情報
    effectiveLimit: status.effectiveLimit,
    systemOverhead: status.systemOverhead,
    autoCompactThreshold: status.autoCompactThreshold
  };
}