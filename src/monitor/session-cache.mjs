import fs from 'fs';
import path from 'path';

/**
 * セッションファイルのスマートキャッシュシステム
 * ファイルのmtimeとsizeを使って変更検出し、必要な場合のみ再解析
 */
export class SessionCache {
  constructor() {
    this.cache = new Map(); // sessionId -> sessionData
    this.fileStats = new Map(); // filePath -> { mtimeMs, size }
    this.debugMode = false;
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  log(message) {
    if (this.debugMode) {
      console.error(`[SessionCache] ${new Date().toISOString()}: ${message}`);
    }
  }

  /**
   * ファイルが変更されているかチェック
   */
  async hasFileChanged(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      const cached = this.fileStats.get(filePath);
      
      if (!cached) {
        return true; // 初回は必ず変更ありとする
      }
      
      return cached.mtimeMs !== stats.mtimeMs || cached.size !== stats.size;
    } catch (error) {
      this.log(`Error checking file stats for ${filePath}: ${error.message}`);
      return true; // エラーの場合は変更ありとして処理
    }
  }

  /**
   * キャッシュされたセッションデータを取得（変更がない場合のみ）
   */
  async getCachedSession(filePath) {
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
  async parseAndCacheSession(filePath) {
    const sessionId = path.basename(filePath, '.jsonl');
    
    // キャッシュから取得を試行
    const cached = await this.getCachedSession(filePath);
    if (cached) {
      return cached;
    }

    this.log(`Parsing session file: ${sessionId}`);
    
    try {
      // ファイル統計を記録
      const stats = await fs.promises.stat(filePath);
      this.fileStats.set(filePath, {
        mtimeMs: stats.mtimeMs,
        size: stats.size
      });

      // ファイル内容を解析
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
      let firstTimestamp = null;
      let lastTimestamp = null;

      // 効率的な処理：逆順で最新プロンプトを先に見つける
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const data = JSON.parse(lines[i]);
          
          // タイムスタンプの記録（逆順なので）
          if (data.timestamp) {
            if (!lastTimestamp) lastTimestamp = data.timestamp; // 最初に見つかるのが最新
            firstTimestamp = data.timestamp; // 継続的に更新されて最古になる
          }

          // モデル情報（最初に見つかったもの）
          if (data.message?.model && model === 'Unknown') {
            model = data.message.model;
            modelName = this.getModelName(model);
          }

          // 使用量とコストの計算
          if (data.message?.usage) {
            const usage = data.message.usage;
            totalInputTokens += usage.input_tokens || 0;
            totalOutputTokens += usage.output_tokens || 0;
            totalCacheTokens += usage.cache_read_input_tokens || 0;
            
            if (data.message.role === 'assistant') {
              turns++;
            }

            totalCost += this.calculateMessageCost(model, usage);
          }

          // 最新のユーザープロンプト（逆順なので最初に見つかったもの）
          if (!latestPrompt && data.message?.role === 'user' && data.message?.content) {
            const content = Array.isArray(data.message.content) 
              ? data.message.content.find(c => c.type === 'text')?.text || ''
              : data.message.content;
            if (content) {
              latestPrompt = content;
            }
          }
        } catch (e) {
          // 無効なJSON行はスキップ
        }
      }

      totalTokens = totalInputTokens + totalOutputTokens;

      const sessionData = {
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
        usagePercentage: this.calculateUsagePercentage(model, totalTokens)
      };

      // キャッシュに保存
      this.cache.set(sessionId, sessionData);
      this.log(`Cached session ${sessionId} - ${turns} turns, ${totalTokens} tokens`);
      
      return sessionData;
    } catch (error) {
      this.log(`Error parsing session ${sessionId}: ${error.message}`);
      return null;
    }
  }

  getModelName(model) {
    const modelNames = {
      'claude-3-opus-20241022': 'Opus 3',
      'claude-opus-4-20250514': 'Opus 4', 
      'claude-sonnet-4-20250514': 'Sonnet 4',
      'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
      'claude-3-5-haiku-20241022': 'Haiku 3.5',
      'claude-3-haiku-20240307': 'Haiku 3',
      'claude-2.1': 'Claude 2.1',
      'claude-2.0': 'Claude 2.0',
      'claude-instant-1.2': 'Instant 1.2'
    };
    
    return modelNames[model] || model;
  }

  calculateMessageCost(model, usage) {
    const pricing = {
      'claude-3-opus-20241022': { input: 0.00375, output: 0.01875 },
      'claude-opus-4-20250514': { input: 0.00375, output: 0.01875 },
      'claude-sonnet-4-20250514': { input: 0.00225, output: 0.01125 },
      'claude-3-5-sonnet-20241022': { input: 0.00225, output: 0.01125 },
      'claude-3-5-haiku-20241022': { input: 0.00075, output: 0.00375 },
      'claude-3-haiku-20240307': { input: 0.00075, output: 0.00375 },
      'claude-2.1': { input: 0.002, output: 0.006 },
      'claude-2.0': { input: 0.002, output: 0.006 },
      'claude-instant-1.2': { input: 0.0002, output: 0.0006 }
    };

    const modelPricing = pricing[model] || { input: 0, output: 0 };
    const inputCost = ((usage.input_tokens || 0) / 1000) * modelPricing.input;
    const outputCost = ((usage.output_tokens || 0) / 1000) * modelPricing.output;
    
    return inputCost + outputCost;
  }

  getContextWindow(model) {
    const contextWindows = {
      'claude-3-opus-20241022': 200_000,
      'claude-opus-4-20250514': 200_000,
      'claude-sonnet-4-20250514': 200_000,
      'claude-3-5-sonnet-20241022': 200_000,
      'claude-3-5-haiku-20241022': 200_000,
      'claude-3-haiku-20240307': 200_000,
      'claude-2.1': 200_000,
      'claude-2.0': 100_000,
      'claude-instant-1.2': 100_000
    };
    
    return contextWindows[model] || 200_000;
  }

  calculateUsagePercentage(model, totalTokens) {
    const contextWindow = this.getContextWindow(model);
    return (totalTokens / contextWindow) * 100;
  }

  /**
   * セッションをキャッシュから削除
   */
  clearSession(filePath) {
    const sessionId = path.basename(filePath, '.jsonl');
    this.cache.delete(sessionId);
    this.fileStats.delete(filePath);
    this.log(`Cleared cache for session ${sessionId}`);
  }

  /**
   * 全キャッシュをクリア
   */
  clearAll() {
    this.cache.clear();
    this.fileStats.clear();
    this.log('Cleared all cache');
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats() {
    return {
      cachedSessions: this.cache.size,
      fileStats: this.fileStats.size
    };
  }
}