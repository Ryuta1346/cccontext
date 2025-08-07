import { EventEmitter } from 'events';
import { SessionWatcher } from './session-watcher.js';
import { SessionCache } from './session-cache.js';
import { ContextTracker } from './context-tracker.js';

interface SessionInfo {
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
    willTrigger: boolean;
    threshold: number;
    remainingPercentage: number;
  };
  lastModified?: Date;
}

interface SessionChangeEvent {
  sessionId: string;
  filePath: string;
}

/**
 * イベント駆動のセッション管理システム
 */
export class EnhancedSessionsManager extends EventEmitter {
  private watcher: SessionWatcher;
  private cache: SessionCache;
  private contextTracker: ContextTracker;
  private updateBatch: Set<string>; // バッチ更新用
  private batchTimeout: NodeJS.Timeout | null;
  private isInitialized: boolean;
  private debugMode: boolean;

  constructor() {
    super();
    this.watcher = new SessionWatcher();
    this.cache = new SessionCache();
    this.contextTracker = new ContextTracker();
    this.updateBatch = new Set();
    this.batchTimeout = null;
    this.isInitialized = false;
    this.debugMode = false;
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
    this.cache.setDebugMode(enabled);
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.error(`[EnhancedSessionsManager] ${new Date().toISOString()}: ${message}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.log('Initializing enhanced sessions manager...');

    try {
      // ファイル監視イベントのセットアップ
      this.setupFileWatchingEvents();

      // ディレクトリ監視を開始
      await this.watcher.startDirectoryWatch();
      
      // 初回セッション読み込み
      await this.loadAllSessions();
      
      this.isInitialized = true;
      this.log('Enhanced sessions manager initialized successfully');
      
    } catch (error) {
      this.log(`Initialization error: ${(error as Error).message}`);
      throw error;
    }
  }

  private setupFileWatchingEvents(): void {
    // 新しいセッションファイルが追加された時
    this.watcher.on('session-added', async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session added: ${sessionId}`);
      this.scheduleUpdate(filePath);
    });

    // セッションファイルが削除された時
    this.watcher.on('session-removed', (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session removed: ${sessionId}`);
      this.cache.clearSession(filePath);
      this.emitSessionsUpdate();
    });

    // セッションファイルが更新された時（新しいメッセージなど）
    this.watcher.on('session-updated', async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session updated: ${sessionId}`);
      this.cache.clearSession(filePath); // キャッシュをクリアして再読み込みを強制
      this.scheduleUpdate(filePath);
    });
  }

  /**
   * 初回の全セッション読み込み
   */
  async loadAllSessions(): Promise<void> {
    this.log('Loading all sessions...');
    
    try {
      const files = await this.watcher.getAllJsonlFiles();
      this.log(`Found ${files.length} session files`);
      
      // 並列でセッションを読み込み（パフォーマンス向上）
      const sessionPromises = files.map(file => this.loadSingleSession(file));
      const sessions = await Promise.all(sessionPromises);
      const validSessions = sessions.filter((session): session is SessionInfo => session !== null);
      
      this.log(`Successfully loaded ${validSessions.length} sessions`);
      this.emit('sessions-loaded', validSessions);
      
    } catch (error) {
      this.log(`Error loading sessions: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 単一セッションの読み込み
   */
  async loadSingleSession(filePath: string): Promise<SessionInfo | null> {
    try {
      const sessionData = await this.cache.parseAndCacheSession(filePath);
      if (!sessionData) return null;

      // ContextTrackerで追加情報（autoCompactを含む）を生成
      const contextInfo = this.contextTracker.updateSession({
        sessionId: sessionData.sessionId,
        model: sessionData.model,
        messages: [], // We're using parsed data, not raw messages
        totalTokens: sessionData.totalTokens,
        totalCacheTokens: sessionData.totalCacheTokens,
        turns: sessionData.turns,
        totalCost: sessionData.totalCost
      });

      // Return all context info including autoCompact
      return {
        ...contextInfo,
        lastModified: sessionData.lastModified,
        startTime: sessionData.firstTimestamp || undefined,
        latestPrompt: sessionData.latestPrompt,
        latestPromptTime: sessionData.lastTimestamp || undefined
      };
    } catch (error) {
      this.log(`Error loading session ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * バッチ更新のスケジューリング
   */
  private scheduleUpdate(filePath: string): void {
    this.updateBatch.add(filePath);
    
    // 既存のタイムアウトをクリア
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // 100msのデバウンス - 複数の変更を一度に処理
    this.batchTimeout = setTimeout(async () => {
      await this.processBatchUpdate();
    }, 100);
  }

  /**
   * バッチ更新の処理
   */
  private async processBatchUpdate(): Promise<void> {
    if (this.updateBatch.size === 0) return;

    const filePaths = Array.from(this.updateBatch);
    this.updateBatch.clear();
    
    this.log(`Processing batch update for ${filePaths.length} files`);

    try {
      // 更新されたセッションを並列で読み込み
      const sessionPromises = filePaths.map(file => this.loadSingleSession(file));
      await Promise.all(sessionPromises);
      
      // 全セッションの最新状態を取得して通知
      this.emitSessionsUpdate();
      
    } catch (error) {
      this.log(`Error in batch update: ${(error as Error).message}`);
    }
  }

  /**
   * セッション更新イベントの発行
   */
  private async emitSessionsUpdate(): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      this.emit('sessions-updated', sessions);
    } catch (error) {
      this.log(`Error emitting sessions update: ${(error as Error).message}`);
    }
  }

  /**
   * 現在の全セッションを取得
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    const files = await this.watcher.getAllJsonlFiles();
    const sessionPromises = files.map(file => this.loadSingleSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    return sessions
      .filter((session): session is SessionInfo => session !== null)
      .sort((a, b) => {
        // 最終更新時刻で降順ソート
        const aTime = a.lastModified?.getTime() || 0;
        const bTime = b.lastModified?.getTime() || 0;
        return bTime - aTime;
      });
  }

  /**
   * アクティブなセッションを取得
   */
  async getActiveSession(): Promise<any> {
    return this.watcher.findActiveSession();
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats(): { cachedSessions: number; fileStats: number } {
    return this.cache.getCacheStats();
  }

  /**
   * リソースのクリーンアップ
   */
  destroy(): void {
    this.log('Destroying enhanced sessions manager...');
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    this.watcher.stopAll();
    this.cache.clearAll();
    this.updateBatch.clear();
    this.removeAllListeners();
    
    this.isInitialized = false;
    this.log('Enhanced sessions manager destroyed');
  }
}