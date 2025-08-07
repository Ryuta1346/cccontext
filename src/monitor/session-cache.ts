import fs from 'fs';
import path from 'path';
import { getModelName, calculateMessageCost, calculateUsagePercentage } from './model-config.js';

interface FileStats {
  mtimeMs: number;
  size: number;
}

interface SessionData {
  sessionId: string;
  model: string;
  modelName: string;
  turns: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCost: number;
  latestPrompt: string;
  lastModified: Date;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  filePath: string;
  usagePercentage: number;
}

interface MessageData {
  message?: {
    model?: string;
    role?: 'user' | 'assistant' | 'system';
    content?: string | Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
  timestamp?: string;
}

/**
 * セッションファイルのスマートキャッシュシステム
 * ファイルのmtimeとsizeを使って変更検出し、必要な場合のみ再解析
 */
export class SessionCache {
  private cache: Map<string, SessionData>; // sessionId -> sessionData
  private fileStats: Map<string, FileStats>; // filePath -> { mtimeMs, size }
  private debugMode: boolean;

  constructor() {
    this.cache = new Map();
    this.fileStats = new Map();
    this.debugMode = false;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.error(`[SessionCache] ${new Date().toISOString()}: ${message}`);
    }
  }

  /**
   * ファイルが変更されているかチェック
   */
  async hasFileChanged(filePath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(filePath);
      const cached = this.fileStats.get(filePath);
      
      if (!cached) {
        return true; // 初回は必ず変更ありとする
      }
      
      return cached.mtimeMs !== stats.mtimeMs || cached.size !== stats.size;
    } catch (error) {
      this.log(`Error checking file stats for ${filePath}: ${(error as Error).message}`);
      return true; // エラーの場合は変更ありとして処理
    }
  }

  /**
   * キャッシュされたセッションデータを取得（変更がない場合のみ）
   */
  async getCachedSession(filePath: string): Promise<SessionData | null> {
    const sessionId = path.basename(filePath, '.jsonl');
    
    if (!(await this.hasFileChanged(filePath))) {
      const cached = this.cache.get(sessionId);
      if (cached) {
        this.log(`Cache hit for session ${sessionId}`);
        return cached;
      }
    }
    
    return null;
  }

  /**
   * セッションファイルを解析してキャッシュに保存
   */
  async parseAndCacheSession(filePath: string): Promise<SessionData | null> {
    const sessionId = path.basename(filePath, '.jsonl');
    
    // Try to get from cache
    const cached = await this.getCachedSession(filePath);
    if (cached) {
      return cached;
    }

    this.log(`Parsing session file: ${sessionId}`);
    
    try {
      // Record file stats
      const stats = await fs.promises.stat(filePath);
      this.fileStats.set(filePath, {
        mtimeMs: stats.mtimeMs,
        size: stats.size
      });

      // Parse file content
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      
      let model = 'Unknown';
      let modelName = 'Unknown';
      let turns = 0;
      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheTokens = 0;
      let latestPrompt = '';
      let totalCost = 0;
      let firstTimestamp: string | null = null;
      let lastTimestamp: string | null = null;

      // Get latest model info (reverse order)
      for (let i = lines.length - 1; i >= 0 && model === 'Unknown'; i--) {
        try {
          const line = lines[i];
          if (!line) continue;
          const data: MessageData = JSON.parse(line);
          if (data.message?.model) {
            model = data.message.model!;
            modelName = getModelName(model);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      // Process in reverse order for efficiency
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const line = lines[i];
          if (!line) continue;
          const data: MessageData = JSON.parse(line);
          
          // Record timestamps (reverse order)
          if (data.timestamp) {
            if (!lastTimestamp) lastTimestamp = data.timestamp;
            firstTimestamp = data.timestamp;
          }

          if (data.message?.usage) {
            const usage = data.message.usage;
            totalInputTokens += usage.input_tokens || 0;
            totalOutputTokens += usage.output_tokens || 0;
            // Cache read tokens: use latest value only
            if ((usage.cache_read_input_tokens || 0) > 0) {
              totalCacheTokens = usage.cache_read_input_tokens || 0;
            }
            
            if (data.message.role === 'assistant') {
              turns++;
            }

            totalCost += calculateMessageCost(model, usage);
          }

          // Get latest user prompt (first found in reverse order)
          if (!latestPrompt && data.message?.role === 'user' && data.message?.content) {
            const content = Array.isArray(data.message.content) 
              ? data.message.content.find(c => c.type === 'text')?.text || ''
              : data.message.content;
            if (content) {
              latestPrompt = content;
            }
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }

      totalTokens = totalInputTokens + totalOutputTokens;

      // Validate cache tokens
      if (totalCacheTokens > totalTokens) {
        this.log(`Warning: Cache tokens (${totalCacheTokens}) exceed total tokens (${totalTokens}) for session ${sessionId}. Resetting to 0.`);
        totalCacheTokens = 0;
      }

      const sessionData: SessionData = {
        sessionId,
        model,
        modelName,
        turns,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheTokens,
        totalCost,
        latestPrompt,
        lastModified: lastTimestamp ? new Date(lastTimestamp) : stats.mtime,
        firstTimestamp,
        lastTimestamp,
        filePath,
        usagePercentage: calculateUsagePercentage(model, totalTokens)
      };

      // Save to cache
      this.cache.set(sessionId, sessionData);
      this.log(`Cached session ${sessionId} - ${turns} turns, ${totalTokens} tokens`);
      
      return sessionData;
    } catch (error) {
      this.log(`Error parsing session ${sessionId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * セッションをキャッシュから削除
   */
  clearSession(filePath: string): void {
    const sessionId = path.basename(filePath, '.jsonl');
    this.cache.delete(sessionId);
    this.fileStats.delete(filePath);
    this.log(`Cleared cache for session ${sessionId}`);
  }

  /**
   * 全キャッシュをクリア
   */
  clearAll(): void {
    this.cache.clear();
    this.fileStats.clear();
    this.log('Cleared all cache');
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats(): { cachedSessions: number; fileStats: number } {
    return {
      cachedSessions: this.cache.size,
      fileStats: this.fileStats.size
    };
  }
}