import { UsageCalculator } from './usage-calculator.mjs';

// モデル別のコンテキストウィンドウサイズ
export const CONTEXT_WINDOWS = {
  'claude-3-opus-20241022': 200_000,
  'claude-opus-4-20250514': 200_000,
  'claude-3-5-sonnet-20241022': 200_000,
  'claude-3-5-haiku-20241022': 200_000,
  'claude-3-haiku-20240307': 200_000,
  'claude-2.1': 200_000,
  'claude-2.0': 100_000,
  'claude-instant-1.2': 100_000
};

// デフォルトのコンテキストウィンドウサイズ
const DEFAULT_CONTEXT_WINDOW = 200_000;

export class ContextTracker {
  constructor() {
    this.calculator = new UsageCalculator();
    this.sessions = new Map();
  }

  getContextWindow(model) {
    return CONTEXT_WINDOWS[model] || DEFAULT_CONTEXT_WINDOW;
  }

  updateSession(sessionData) {
    // null/undefinedチェック
    if (!sessionData) {
      return {
        sessionId: 'unknown',
        totalTokens: 0,
        turns: 0,
        warningLevel: 'normal'
      };
    }
    
    const { sessionId, model, messages } = sessionData;
    
    // 必須フィールドの検証
    if (!sessionId || !model) {
      return {
        sessionId: sessionId || 'unknown',
        totalTokens: 0,
        turns: 0,
        warningLevel: 'normal'
      };
    }
    
    // messagesが配列でない場合の処理
    const validMessages = Array.isArray(messages) ? messages : [];
    
    // セッション統計を計算
    const stats = this.calculator.calculateSessionTotals(validMessages, model);
    const contextWindow = this.getContextWindow(model);
    
    // コンテキスト使用率を計算
    const usagePercentage = (stats.totalTokens / contextWindow) * 100;
    const remainingTokens = contextWindow - stats.totalTokens;
    const remainingPercentage = (remainingTokens / contextWindow) * 100;
    
    // 推定残りターン数
    const estimatedRemainingTurns = this.calculator.estimateRemainingTurns(
      stats.totalTokens,
      contextWindow,
      stats.averageTokensPerTurn
    );
    
    // 警告レベルの判定
    let warningLevel = 'normal';
    if (usagePercentage >= 95) {
      warningLevel = 'critical';
    } else if (usagePercentage >= 90) {
      warningLevel = 'severe';
    } else if (usagePercentage >= 80) {
      warningLevel = 'warning';
    }
    
    const contextInfo = {
      sessionId,
      model,
      modelName: this.calculator.getModelName(model),
      contextWindow,
      totalTokens: stats.totalTokens,
      inputTokens: stats.totalInputTokens,
      outputTokens: stats.totalOutputTokens,
      cacheTokens: stats.totalCacheTokens,
      usagePercentage,
      remainingTokens,
      remainingPercentage,
      totalCost: stats.totalCost,
      turns: stats.turns,
      averageTokensPerTurn: stats.averageTokensPerTurn,
      estimatedRemainingTurns,
      warningLevel,
      startTime: sessionData.startTime,
      lastUpdate: new Date(),
      latestPrompt: sessionData.latestPrompt,
      latestPromptTime: sessionData.latestPromptTime
    };
    
    // 最新の使用量情報を追加
    if (sessionData.latestUsage) {
      contextInfo.latestTurn = {
        input: sessionData.latestUsage.input,
        output: sessionData.latestUsage.output,
        cache: sessionData.latestUsage.cache,
        total: sessionData.latestUsage.input + sessionData.latestUsage.output,
        percentage: ((sessionData.latestUsage.input + sessionData.latestUsage.output) / contextWindow) * 100
      };
    }
    
    this.sessions.set(sessionId, contextInfo);
    return contextInfo;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(maxAge = 3600000) { // デフォルト: 1時間
    const now = Date.now();
    return this.getAllSessions().filter(session => {
      return (now - session.lastUpdate.getTime()) < maxAge;
    });
  }

  formatContextInfo(info) {
    const calc = this.calculator;
    
    return {
      session: info.sessionId.substring(0, 8),
      model: info.modelName,
      usage: `${info.usagePercentage.toFixed(1)}%`,
      tokens: `${calc.formatTokens(info.totalTokens)}/${calc.formatTokens(info.contextWindow)}`,
      remaining: calc.formatTokens(info.remainingTokens),
      cost: calc.formatCost(info.totalCost),
      turns: info.turns,
      avgTokensPerTurn: calc.formatTokens(info.averageTokensPerTurn),
      estRemainingTurns: info.estimatedRemainingTurns === Infinity ? '∞' : info.estimatedRemainingTurns.toString(),
      warningLevel: info.warningLevel,
      duration: this.formatDuration(info.startTime),
      latestPrompt: this.formatPrompt(info.latestPrompt)
    };
  }

  formatDuration(startTime) {
    if (!startTime) return 'Unknown';
    
    const duration = Date.now() - new Date(startTime).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  getWarningMessage(info) {
    switch (info.warningLevel) {
      case 'critical':
        return '⚠️  CRITICAL: Context limit nearly reached! (>95%)';
      case 'severe':
        return '⚠️  WARNING: Approaching context limit (>90%)';
      case 'warning':
        return '⚠️  Notice: High context usage (>80%)';
      default:
        return null;
    }
  }

  formatPrompt(prompt) {
    if (!prompt) return '';
    
    const maxLength = 50;
    const cleanPrompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // 日本語文字を考慮した文字数カウント
    let charCount = 0;
    let result = '';
    
    for (const char of cleanPrompt) {
      // 日本語文字は2文字分としてカウント
      const charWidth = char.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/) ? 2 : 1;
      
      if (charCount + charWidth > maxLength) {
        result += '...';
        break;
      }
      
      result += char;
      charCount += charWidth;
    }
    
    return result;
  }
}