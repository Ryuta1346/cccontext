// Session and Message Types
export interface Message {
  message: {
    role: 'user' | 'assistant' | 'system';
    content?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

export interface SessionData {
  sessionId: string;
  model: string;
  messages: Message[];
  totalTokens?: number;
  totalCacheTokens?: number;
  timestamp?: number;
  active?: boolean;
}

export interface SessionInfo extends SessionData {
  usagePercentage: number;
  remainingPercentage: number;
  autoCompact: {
    willTrigger: boolean;
    threshold: number;
    remainingPercentage: number;
  };
  warningLevel?: 'normal' | 'warning' | 'critical';
  displayUsagePercentage: number;
  displayRemainingPercentage: number;
  calculatedTotalTokens: number;
  cachePercentage: number;
  inputTokens: number;
  outputTokens: number;
}

// Model Configuration Types
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachingPerMillion?: number;
}

export interface ModelConfig {
  contextWindow: number;
  pricing: ModelPricing;
}

export interface ModelConfigs {
  [key: string]: ModelConfig;
}

// Auto-Compact Configuration Types
export interface AutoCompactConfig {
  threshold: number;
  bufferZone: number;
  checkInterval: number;
  compactBatchSize: number;
  maxRetries: number;
  retryDelay: number;
  preserveSystemMessages: boolean;
  preserveRecentMessages: number;
  minMessagesToKeep: number;
  targetUsageAfterCompact: number;
  enabled: boolean;
}

// Cache Configuration Types
export interface CacheOptions {
  maxCacheSize?: number;
  minTokensForCaching?: number;
  cacheDuration?: number;
  cachePercentage?: number;
}

// Display Component Types
export interface DisplayOptions {
  debug?: boolean;
  showDetails?: boolean;
  refreshInterval?: number;
}

export interface LiveViewOptions extends DisplayOptions {
  sessionsDir: string;
  onError?: (error: Error) => void;
  onUpdate?: (sessions: SessionInfo[]) => void;
}

// Manager Types
export interface SessionsManagerOptions {
  sessionsDir: string;
  debug?: boolean;
  batchSize?: number;
  batchDelay?: number;
}

export interface SessionWatcherOptions {
  sessionsDir: string;
  pollInterval?: number;
  debug?: boolean;
}

// CLI Types
export interface CLIOptions {
  live?: boolean;
  debug?: boolean;
  limit?: number;
  clearCache?: boolean;
  json?: boolean;
  watch?: boolean;
  details?: boolean;
}

// Utility Types
export interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelName: string;
}

export interface ContextWindow {
  model: string;
  window: number;
}

export interface FormattedContext {
  percentage: number;
  remaining: number;
  total: number;
  formatted: string;
}