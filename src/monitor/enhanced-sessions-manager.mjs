import { EventEmitter } from 'events';
import { SessionWatcher } from './session-watcher.mjs';
import { SessionCache } from './session-cache.mjs';

/**
 * イベント駆動のセッション管理システム
 * setIntervalによるポーリングを廃止し、chokidarイベントのみで更新
 */
export class EnhancedSessionsManager extends EventEmitter {
  constructor() {
    super();
    this.watcher = new SessionWatcher();
    this.cache = new SessionCache();
    this.updateBatch = new Set(); // バッチ更新用
    this.batchTimeout = null;
    this.isInitialized = false;
    this.debugMode = false;
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.cache.setDebugMode(enabled);
  }

  log(message) {
    if (this.debugMode) {
      console.error(`[EnhancedSessionsManager] ${new Date().toISOString()}: ${message}`);
    }
  }

  async initialize() {
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
      this.log(`Initialization error: ${error.message}`);
      throw error;
    }
  }

  setupFileWatchingEvents() {
    // 新しいセッションファイルが追加された時
    this.watcher.on('session-added', async ({ sessionId, filePath }) => {
      this.log(`Session added: ${sessionId}`);
      this.scheduleUpdate(filePath);
    });

    // セッションファイルが削除された時
    this.watcher.on('session-removed', ({ sessionId, filePath }) => {
      this.log(`Session removed: ${sessionId}`);
      this.cache.clearSession(filePath);
      this.emitSessionsUpdate();
    });

    // セッションファイルが更新された時（新しいメッセージなど）
    this.watcher.on('session-updated', async ({ sessionId, filePath }) => {
      this.log(`Session updated: ${sessionId}`);
      this.cache.clearSession(filePath); // キャッシュをクリアして再読み込みを強制
      this.scheduleUpdate(filePath);
    });
  }

  /**
   * 初回の全セッション読み込み
   */
  async loadAllSessions() {
    this.log('Loading all sessions...');
    
    try {
      const files = await this.watcher.getAllJsonlFiles();
      this.log(`Found ${files.length} session files`);
      
      // 並列でセッションを読み込み（パフォーマンス向上）
      const sessionPromises = files.map(file => this.loadSingleSession(file));
      const sessions = await Promise.all(sessionPromises);
      const validSessions = sessions.filter(Boolean);
      
      this.log(`Successfully loaded ${validSessions.length} sessions`);
      this.emit('sessions-loaded', validSessions);
      
    } catch (error) {
      this.log(`Error loading sessions: ${error.message}`);
      throw error;
    }
  }

  /**
   * 単一セッションの読み込み
   */
  async loadSingleSession(filePath) {
    try {
      return await this.cache.parseAndCacheSession(filePath);
    } catch (error) {
      this.log(`Error loading session ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * バッチ更新のスケジューリング
   */
  scheduleUpdate(filePath) {
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
  async processBatchUpdate() {
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
      this.log(`Error in batch update: ${error.message}`);
    }
  }

  /**
   * セッション更新イベントの発行
   */
  async emitSessionsUpdate() {
    try {
      const sessions = await this.getAllSessions();
      this.emit('sessions-updated', sessions);
    } catch (error) {
      this.log(`Error emitting sessions update: ${error.message}`);
    }
  }

  /**
   * 現在の全セッションを取得
   */
  async getAllSessions() {
    const files = await this.watcher.getAllJsonlFiles();
    const sessionPromises = files.map(file => this.loadSingleSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    return sessions
      .filter(Boolean)
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
  async getActiveSession() {
    return this.watcher.findActiveSession();
  }

  /**
   * キャッシュ統計を取得
   */
  getCacheStats() {
    return this.cache.getCacheStats();
  }

  /**
   * リソースのクリーンアップ
   */
  destroy() {
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