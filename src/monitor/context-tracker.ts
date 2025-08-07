import { UsageCalculator } from './usage-calculator.js';
import { calculateAutoCompactInfo } from './claude-calculation.js';
import { CONTEXT_WINDOWS, getContextWindow as getContextWindowFromConfig } from './model-config.js';
import type { SessionData, Message } from '../types/index.js';

// Type for handling nested message structures from tests
interface NestedMessage {
  message: Message;
}

// Union type for flexible message handling
type FlexibleMessage = Message | NestedMessage;

// Type guard for nested message
function isNestedMessage(msg: FlexibleMessage): msg is NestedMessage {
  return msg != null && typeof msg === 'object' && 'message' in msg && 
         (msg as NestedMessage).message != null && 
         typeof (msg as NestedMessage).message === 'object';
}

// Re-export CONTEXT_WINDOWS for backward compatibility
export { CONTEXT_WINDOWS };


interface LatestTurn {
  input: number;
  output: number;
  cache: number;
  total: number;
  percentage: number;
}

interface ContextInfo {
  sessionId: string;
  model: string;
  modelName: string;
  contextWindow: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  usagePercentage: number;
  remainingTokens: number;
  remainingPercentage: number;
  totalCost: number;
  turns: number;
  averageTokensPerTurn: number;
  estimatedRemainingTurns: number;
  warningLevel: 'normal' | 'warning' | 'severe' | 'critical';
  startTime?: number | string | Date;
  lastUpdate: Date;
  latestPrompt?: string;
  latestPromptTime?: number | string | Date;
  autoCompact: {
    enabled: boolean;
    willTrigger: boolean;
    threshold: number;
    thresholdPercentage?: number;
    remainingPercentage: number;
    remainingTokens?: number;
    warningLevel: string;
    willCompactSoon?: boolean;
    effectiveLimit?: number;
    systemOverhead?: number;
    autoCompactThreshold?: number;
  };
  latestTurn?: LatestTurn;
}

interface FormattedContextInfo {
  session: string;
  model: string;
  usage: string;
  tokens: string;
  remaining: string;
  cost: string;
  turns: number;
  avgTokensPerTurn: string;
  estRemainingTurns: string;
  warningLevel: string;
  duration: string;
  latestPrompt: string;
}

export class ContextTracker {
  private calculator: UsageCalculator;
  private sessions: Map<string, ContextInfo>;

  constructor() {
    this.calculator = new UsageCalculator();
    this.sessions = new Map();
  }

  getContextWindow(model: string): number {
    return getContextWindowFromConfig(model);
  }

  updateSession(sessionData: SessionData | null | undefined): ContextInfo {
    if (!sessionData) {
      return {
        sessionId: 'unknown',
        model: '',
        modelName: '',
        contextWindow: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        usagePercentage: 0,
        remainingTokens: 0,
        remainingPercentage: 0,
        totalCost: 0,
        turns: 0,
        averageTokensPerTurn: 0,
        estimatedRemainingTurns: 0,
        warningLevel: 'normal',
        lastUpdate: new Date(),
        autoCompact: {
          enabled: false,
          willTrigger: false,
          threshold: 0,
          thresholdPercentage: 0,
          remainingPercentage: 100,
          remainingTokens: 0,
          warningLevel: 'normal',
          willCompactSoon: false,
          effectiveLimit: 0,
          systemOverhead: 0,
          autoCompactThreshold: 0
        }
      };
    }
    
    const { sessionId, model, messages } = sessionData;
    
    if (!sessionId || !model) {
      return {
        sessionId: sessionId || 'unknown',
        model: model || '',
        modelName: '',
        contextWindow: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        usagePercentage: 0,
        remainingTokens: 0,
        remainingPercentage: 0,
        totalCost: 0,
        turns: 0,
        averageTokensPerTurn: 0,
        estimatedRemainingTurns: 0,
        warningLevel: 'normal',
        lastUpdate: new Date(),
        autoCompact: {
          enabled: false,
          willTrigger: false,
          threshold: 0,
          thresholdPercentage: 0,
          remainingPercentage: 100,
          remainingTokens: 0,
          warningLevel: 'normal',
          willCompactSoon: false,
          effectiveLimit: 0,
          systemOverhead: 0,
          autoCompactThreshold: 0
        }
      };
    }
    
    // Normalize messages structure to handle different test formats
    const validMessages: Message[] = Array.isArray(messages) 
      ? messages.map(msg => {
          // Handle nested message structure from tests
          if (isNestedMessage(msg)) {
            const nestedMsg = msg.message;
            return {
              role: nestedMsg.role,
              content: nestedMsg.content,
              usage: nestedMsg.usage
            };
          }
          // Handle direct message structure
          return msg;
        }).filter(msg => msg && msg.role) 
      : [];
    
    const stats = this.calculator.calculateSessionTotals(validMessages, model);
    const contextWindow = this.getContextWindow(model);
    
    // Use pre-calculated totalTokens if available, otherwise use calculated stats
    const totalTokens = sessionData.totalTokens !== undefined ? sessionData.totalTokens : stats.totalTokens;
    const totalCacheTokens = sessionData.totalCacheTokens !== undefined ? sessionData.totalCacheTokens : stats.totalCacheTokens;
    
    const actualTotalTokens = totalTokens;
    
    const usagePercentage = contextWindow > 0 ? (actualTotalTokens / contextWindow) * 100 : 0;
    const remainingTokens = Math.max(0, contextWindow - actualTotalTokens);
    const remainingPercentage = contextWindow > 0 ? (remainingTokens / contextWindow) * 100 : 100;
    
    const estimatedRemainingTurns = this.calculator.estimateRemainingTurns(
      actualTotalTokens,
      contextWindow,
      stats.averageTokensPerTurn
    );
    
    // Calculate auto-compact info
    const autoCompactInfo = calculateAutoCompactInfo(actualTotalTokens, contextWindow, {
      messageCount: sessionData.messages?.length || validMessages.length || stats.turns,
      cacheSize: totalCacheTokens,
      autoCompactEnabled: true
    });
    
    let warningLevel: 'normal' | 'warning' | 'severe' | 'critical' = 'normal';
    if (usagePercentage >= 95) {
      warningLevel = 'critical';
    } else if (usagePercentage >= 90) {
      warningLevel = 'severe';
    } else if (usagePercentage >= 80) {
      warningLevel = 'warning';
    }
    
    const contextInfo: ContextInfo = {
      sessionId,
      model,
      modelName: this.calculator.getModelName(model),
      contextWindow,
      totalTokens: actualTotalTokens,
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
      startTime: sessionData.startTime || undefined,
      lastUpdate: new Date(),
      latestPrompt: sessionData.latestPrompt,
      latestPromptTime: sessionData.latestPromptTime,
      autoCompact: {
        enabled: autoCompactInfo.enabled,
        willTrigger: autoCompactInfo.willCompactSoon,
        threshold: autoCompactInfo.threshold,
        thresholdPercentage: autoCompactInfo.thresholdPercentage,
        remainingPercentage: autoCompactInfo.remainingPercentage,
        remainingTokens: autoCompactInfo.remainingTokens,
        warningLevel: autoCompactInfo.warningLevel,
        willCompactSoon: autoCompactInfo.willCompactSoon,
        effectiveLimit: autoCompactInfo.effectiveLimit,
        systemOverhead: autoCompactInfo.systemOverhead,
        autoCompactThreshold: autoCompactInfo.autoCompactThreshold
      }
    };
    
    if (sessionData.latestUsage) {
      const latestUsage = sessionData.latestUsage;
      contextInfo.latestTurn = {
        input: latestUsage.input,
        output: latestUsage.output,
        cache: latestUsage.cache,
        total: latestUsage.input + latestUsage.output,
        percentage: contextWindow > 0 ? ((latestUsage.input + latestUsage.output) / contextWindow) * 100 : 0
      };
    }
    
    this.sessions.set(sessionId, contextInfo);
    return contextInfo;
  }

  getSession(sessionId: string): ContextInfo | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): ContextInfo[] {
    return Array.from(this.sessions.values());
  }

  getActiveSessions(maxAge: number = 3600000): ContextInfo[] { // Default: 1 hour
    const now = Date.now();
    return this.getAllSessions().filter(session => {
      return (now - session.lastUpdate.getTime()) < maxAge;
    });
  }

  formatContextInfo(info: ContextInfo): FormattedContextInfo {
    const calc = this.calculator;
    
    return {
      session: info.sessionId,
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

  formatDuration(startTime: number | string | Date | undefined): string {
    if (!startTime) return 'Unknown';
    
    const duration = Date.now() - new Date(startTime).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  getWarningMessage(info: ContextInfo): string | null {
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

  formatPrompt(prompt: string | undefined): string {
    if (!prompt) return '';
    
    const maxLength = 50;
    const cleanPrompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Character counting considering Japanese characters
    let charCount = 0;
    let result = '';
    
    for (const char of cleanPrompt) {
      // Japanese characters are counted as 2 characters width
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