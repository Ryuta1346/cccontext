// Core Session and Message Types
export interface MessageContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: string;
    media_type?: string;
    data?: string;
  };
}

export interface MessageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: MessageContent[] | string;
  usage?: MessageUsage;
}

export interface LatestUsage {
  input: number;
  output: number;
  cache: number;
  cacheCreation?: number;
  timestamp?: string;
}

export interface SessionData {
  sessionId: string;
  model: string;
  messages?: Message[];  // Optional for display-only sessions
  totalTokens: number;
  totalCacheTokens?: number;
  totalCost?: number;
  turns: number;
  startTime?: Date | string | null;
  isCompacted?: boolean;
  latestUsage?: LatestUsage;
  latestPrompt?: string;
  latestPromptTime?: string | number;
  timestamp?: number;
  active?: boolean;
  // Additional fields for different use cases
  file?: string;
  size?: number;
  modelName?: string;
  usagePercentage?: number;
  lastModified?: Date | number;
  firstTimestamp?: string | null;
  lastTimestamp?: string | null;
  filePath?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  autoCompact?: {
    willTrigger: boolean;
    threshold: number;
    remainingPercentage: number;
  };
}

// Model Configuration Types - only keeping actually used types
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cachingPerMillion?: number;
}