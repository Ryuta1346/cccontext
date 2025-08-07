import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { SessionData, MessageData, MessageContent } from '../types/index.js';


interface ActiveSession {
  sessionId: string;
  filePath: string;
}

// interface SessionEvent {
//   sessionId: string;
//   filePath: string;
// }

interface MessageEvent {
  sessionId: string;
  data: MessageData;
  sessionData: SessionData;
}

interface ErrorEvent {
  sessionId: string;
  error: Error;
}

export class SessionWatcher extends EventEmitter {
  // メモリ管理用の定数
  private static readonly MAX_SESSIONS = parseInt(process.env.CCCONTEXT_MAX_SESSIONS || '100', 10);
  private static readonly SESSION_TTL_MS = parseInt(process.env.CCCONTEXT_SESSION_TTL_MS || '3600000', 10); // 1時間
  private static readonly CLEANUP_INTERVAL_MS = parseInt(process.env.CCCONTEXT_CLEANUP_INTERVAL_MS || '600000', 10); // 10分

  private projectsDir: string;
  private sessions: Map<string, SessionData>;
  private watchers: Map<string, FSWatcher>;
  private filePositions: Map<string, number>;
  private directoryWatcher: FSWatcher | null;
  private cachedFiles: Set<string>;
  private fileMtimes?: Map<string, number>;
  
  // メモリ管理用の追加プロパティ
  private lastAccessTime: Map<string, number>;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor() {
    super();
    
    // 環境変数または標準パスを使用（セキュリティ改善）
    const baseDir = process.env.CLAUDE_PROJECTS_DIR || 
                   path.join(os.homedir(), '.claude/projects');
    
    // パス正規化で相対パスや ../ を解決
    this.projectsDir = path.resolve(baseDir);
    
    // ディレクトリの存在と権限を検証
    this.validateProjectsDir();
    
    this.sessions = new Map();
    this.watchers = new Map();
    this.filePositions = new Map();
    this.directoryWatcher = null;
    this.cachedFiles = new Set();
    this.lastAccessTime = new Map();
    this.cleanupTimer = null;
    
    // 定期クリーンアップタイマーの開始
    this.startCleanupTimer();
  }

  /**
   * セッションのアクセス時刻を更新
   */
  private updateAccessTime(sessionId: string): void {
    this.lastAccessTime.set(sessionId, Date.now());
  }

  /**
   * 定期クリーンアップタイマーを開始
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return; // 既にタイマーが動作中
    }
    
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldSessions();
      } catch (error) {
        if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
          console.error(`[SessionWatcher] Cleanup error: ${(error as Error).message}`);
        }
      }
    }, SessionWatcher.CLEANUP_INTERVAL_MS);
  }

  /**
   * 定期クリーンアップタイマーを停止
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 古いセッションをクリーンアップ（LRUとTTLベース）
   */
  private async cleanupOldSessions(): Promise<void> {
    const now = Date.now();
    const sessionsToRemove: string[] = [];
    
    // TTLを超えたセッションを特定
    for (const [sessionId, lastAccess] of this.lastAccessTime.entries()) {
      if (now - lastAccess > SessionWatcher.SESSION_TTL_MS) {
        sessionsToRemove.push(sessionId);
      }
    }
    
    // セッション数が最大値を超えている場合、最も古いものから削除
    if (this.sessions.size > SessionWatcher.MAX_SESSIONS) {
      // アクセス時刻でソート（古い順）
      const sortedSessions = Array.from(this.lastAccessTime.entries())
        .sort((a, b) => a[1] - b[1]);
      
      const excessCount = this.sessions.size - SessionWatcher.MAX_SESSIONS + 1; // +1 for new session
      for (let i = 0; i < Math.min(excessCount, sortedSessions.length); i++) {
        const session = sortedSessions[i];
        if (session && !sessionsToRemove.includes(session[0])) {
          sessionsToRemove.push(session[0]);
        }
      }
    }
    
    // セッションを削除
    for (const sessionId of sessionsToRemove) {
      this.stopWatching(sessionId);
      
      // デバッグログ
      if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
        console.error(`[SessionWatcher] Cleaned up session ${sessionId} (TTL or LRU)`);
      }
    }
  }

  /**
   * プロジェクトディレクトリの検証
   * ディレクトリが存在し、読み取り可能であることを確認
   */
  private validateProjectsDir(): void {
    try {
      const stats = fs.statSync(this.projectsDir);
      if (!stats.isDirectory()) {
        throw new Error(`${this.projectsDir} is not a directory`);
      }
      
      // 読み取り権限のチェック
      fs.accessSync(this.projectsDir, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // ディレクトリが存在しない場合は警告のみ
        console.warn(`Claude projects directory not found: ${this.projectsDir}`);
        console.warn('Sessions monitoring will not be available until the directory is created.');
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        console.error(`No read permission for directory: ${this.projectsDir}`);
      } else {
        console.error(`Error accessing projects directory: ${(error as Error).message}`);
      }
    }
  }

  async findActiveSession(): Promise<ActiveSession | null> {
    const files = await this.getAllJsonlFiles();
    if (files.length === 0) return null;

    // 最新の更新時刻を持つファイルを検索
    let latestFile: string | null = null;
    let latestTime = 0;

    for (const file of files) {
      const stats = await fs.promises.stat(file);
      if (stats.mtimeMs > latestTime) {
        latestTime = stats.mtimeMs;
        latestFile = file;
      }
    }

    if (!latestFile) return null;

    // セッションIDを抽出
    const sessionId = path.basename(latestFile, '.jsonl');
    return { sessionId, filePath: latestFile };
  }

  async getAllJsonlFiles(): Promise<string[]> {
    // キャッシュが存在する場合はキャッシュを返す
    if (this.cachedFiles.size > 0) {
      return Array.from(this.cachedFiles);
    }

    const files: string[] = [];
    
    const walkDir = async (dir: string): Promise<void> => {
      try {
        // ディレクトリパスの正規化と検証
        const normalizedDir = path.resolve(dir);
        
        // プロジェクトディレクトリ外へのアクセスを防ぐ
        if (!normalizedDir.startsWith(this.projectsDir)) {
          console.warn(`Skipping directory outside projects path: ${normalizedDir}`);
          return;
        }
        
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // シンボリックリンクのチェック
          if (entry.isSymbolicLink()) {
            // シンボリックリンクは追跡しない（セキュリティ対策）
            continue;
          }
          
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile() && path.extname(entry.name) === '.jsonl') {
            // ファイルパスも正規化して検証
            const normalizedPath = path.resolve(fullPath);
            if (normalizedPath.startsWith(this.projectsDir)) {
              files.push(normalizedPath);
            }
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは詳細にログ
        if (process.env.DEBUG) {
          console.debug(`Error accessing directory ${dir}: ${(error as Error).message}`);
        }
      }
    };

    await walkDir(this.projectsDir);
    
    // キャッシュを更新
    this.cachedFiles = new Set(files);
    
    return files;
  }

  // キャッシュを無効化して次回フルスキャンを強制
  invalidateCache(): void {
    this.cachedFiles.clear();
  }

  async startDirectoryWatch(): Promise<void> {
    if (this.directoryWatcher) {
      return; // 既に監視中
    }

    // 初回スキャンでキャッシュを作成
    await this.getAllJsonlFiles();

    // ディレクトリ全体を監視
    this.directoryWatcher = chokidar.watch(this.projectsDir, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 10,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 50
      }
    });

    // 新しい.jsonlファイルが追加された時
    this.directoryWatcher.on('add', (filePath: string) => {
      if (path.extname(filePath) === '.jsonl') {
        this.cachedFiles.add(filePath);
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-added', { sessionId, filePath });
      }
    });

    // .jsonlファイルが削除された時
    this.directoryWatcher.on('unlink', (filePath: string) => {
      if (path.extname(filePath) === '.jsonl') {
        this.cachedFiles.delete(filePath);
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-removed', { sessionId, filePath });
      }
    });
    
    // .jsonlファイルが変更された時（/compactなど）
    this.directoryWatcher.on('change', (filePath: string) => {
      if (path.extname(filePath) === '.jsonl') {
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-updated', { sessionId, filePath });
      }
    });

    this.emit('directory-watch-started');
  }

  async watchSession(sessionId: string, filePath: string): Promise<void> {
    if (this.watchers.has(sessionId)) {
      this.updateAccessTime(sessionId);
      return;
    }

    // 最大セッション数のチェック
    if (this.sessions.size >= SessionWatcher.MAX_SESSIONS) {
      // 古いセッションをクリーンアップ
      await this.cleanupOldSessions();
      
      // それでもまだ最大数を超えている場合はエラー
      if (this.sessions.size >= SessionWatcher.MAX_SESSIONS) {
        throw new Error(`Maximum number of sessions (${SessionWatcher.MAX_SESSIONS}) reached`);
      }
    }

    // アクセス時刻を記録
    this.updateAccessTime(sessionId);

    // ファイルの現在位置を記録
    const stats = await fs.promises.stat(filePath);
    this.filePositions.set(sessionId, stats.size);

    // 初回読み込み（compact操作ではないので false）
    await this.readExistingData(sessionId, filePath, false);

    // ファイル監視開始
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 50
      }
    });

    watcher.on('change', async () => {
      await this.handleFileChange(sessionId, filePath);
    });

    this.watchers.set(sessionId, watcher);
    this.emit('session-started', { sessionId, filePath });
  }

  async readExistingData(sessionId: string, filePath: string, isCompactOperation = false): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      
      // セッションデータを取得または新規作成
      let sessionData = this.sessions.get(sessionId);
      
      // /compact操作の場合、または新規セッションの場合はデータを初期化
      if (isCompactOperation || !sessionData) {
        sessionData = {
          sessionId,
          messages: [],
          totalTokens: 0,
          totalCacheTokens: 0,
          totalCost: 0,
          turns: 0,
          model: 'unknown',
          startTime: null
        };
      }

      // /compact操作の場合は既存データをクリア
      if (isCompactOperation && this.sessions.has(sessionId)) {
        sessionData.messages = [];
        sessionData.totalTokens = 0;
        sessionData.totalCacheTokens = 0;
        sessionData.totalCost = 0;
        sessionData.turns = 0;
        sessionData.model = 'unknown';
        sessionData.startTime = null;
      }

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          this.processMessage(sessionData, data);
        } catch (e) {
          // 無効なJSON行はスキップ
        }
      }

      this.sessions.set(sessionId, sessionData);
      this.emit('session-data', sessionData);
    } catch (error) {
      this.emit('error', { sessionId, error } as ErrorEvent);
    }
  }

  async handleFileChange(sessionId: string, filePath: string): Promise<void> {
    // アクセス時刻を更新
    this.updateAccessTime(sessionId);
    
    try {
      const stats = await fs.promises.stat(filePath);
      const lastPosition = Math.max(0, this.filePositions.get(sessionId) || 0);
      const lastMtime = this.fileMtimes?.get(sessionId) || 0;
      
      // ファイルサイズが減少した場合、または大幅に変化した場合
      // （/compactなどでファイルが置き換えられた可能性）
      // または最終更新時刻が大きく変わった場合
      const isCompactOperation = stats.size < lastPosition || 
                                Math.abs(stats.size - lastPosition) > 5000 ||
                                (lastMtime && Math.abs(stats.mtimeMs - lastMtime) > 60000);
      
      if (isCompactOperation) {
        // ファイル全体を再読み込み
        // console.logは blessed UIと干渉するため、デバッグモードの場合のみ出力
        if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
          console.error(`[SessionWatcher] Compact operation detected for ${sessionId}`);
        }
        this.filePositions.set(sessionId, 0);
        await this.readExistingData(sessionId, filePath, true);  // isCompactOperationフラグをtrueに
        // 現在のファイルサイズと更新時刻を記録
        this.filePositions.set(sessionId, stats.size);
        if (!this.fileMtimes) this.fileMtimes = new Map();
        this.fileMtimes.set(sessionId, stats.mtimeMs);
        
        // compact検出を通知
        this.emit('compact-detected', { sessionId, filePath });
      } else if (stats.size > lastPosition) {
        // 新しいデータを読み込む（増分読み込み）
        const stream = fs.createReadStream(filePath, {
          start: Math.max(0, lastPosition),
          encoding: 'utf-8'
        });

        let buffer = '';
        stream.on('data', (chunk: string | Buffer) => {
          const chunkStr = chunk.toString();
          buffer += chunkStr;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                const sessionData = this.sessions.get(sessionId);
                if (sessionData) {
                  this.processMessage(sessionData, data);
                  this.emit('message', { sessionId, data, sessionData } as MessageEvent);
                }
              } catch (e) {
                // 無効なJSON行はスキップ
              }
            }
          }
        });

        stream.on('end', () => {
          this.filePositions.set(sessionId, stats.size);
          if (!this.fileMtimes) this.fileMtimes = new Map();
          this.fileMtimes.set(sessionId, stats.mtimeMs);
        });
      }
      // stats.size === lastPosition の場合は何もしない（変更なし）
    } catch (error) {
      this.emit('error', { sessionId, error } as ErrorEvent);
    }
  }

  processMessage(sessionData: SessionData, data: MessageData): void {
    // Detect /compact
    const contentStr = typeof data.message?.content === 'string' 
      ? data.message.content 
      : '';
    if (contentStr.includes('[Previous conversation summary') || 
        contentStr.includes('Previous conversation compacted')) {
      sessionData.isCompacted = true;
    }
    
    if (!sessionData.startTime && data.timestamp) {
      sessionData.startTime = new Date(data.timestamp);
    }

    if (data.message?.model) {
      sessionData.model = data.message.model;
    }

    if (data.message?.usage) {
      const usage = data.message.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
      
      // Total tokens include all token types for context window calculation
      sessionData.totalTokens = cacheReadTokens + inputTokens + outputTokens + cacheCreationTokens;
      
      // Store cache tokens separately
      sessionData.totalCacheTokens = cacheReadTokens;
      
      if (data.message?.role === 'assistant') {
        sessionData.turns++;
      }

      // Store latest usage
      sessionData.latestUsage = {
        input: inputTokens,
        output: outputTokens,
        cache: cacheReadTokens,
        cacheCreation: cacheCreationTokens,
        timestamp: data.timestamp ? String(data.timestamp) : undefined
      };
    }

    // Store latest user prompt
    if (data.message?.role === 'user' && data.message?.content) {
      const content = Array.isArray(data.message.content) 
        ? data.message.content.find((c: MessageContent) => c.type === 'text')?.text || ''
        : data.message.content;
      
      if (content) {
        sessionData.latestPrompt = content;
        sessionData.latestPromptTime = data.timestamp ? String(data.timestamp) : undefined;
      }
    }

    // MessageDataをMessage形式に変換して保存
    // contentがない場合も処理するため、空文字列をデフォルトとして使用
    if (data.message && data.message.role) {
      if (!sessionData.messages) {
        sessionData.messages = [];
      }
      sessionData.messages.push({
        role: data.message.role,
        content: data.message.content ?? '',
        usage: data.message.usage
      });
    }
  }

  stopWatching(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      // FSWatcherをクローズ
      try {
        watcher.close();
      } catch (error) {
        if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
          console.error(`[SessionWatcher] Error closing watcher for ${sessionId}: ${(error as Error).message}`);
        }
      }
      
      // すべてのMapからエントリを削除
      this.watchers.delete(sessionId);
      this.filePositions.delete(sessionId);
      this.sessions.delete(sessionId);
      this.lastAccessTime.delete(sessionId);
      
      // ファイル更新時刻も削除
      if (this.fileMtimes) {
        this.fileMtimes.delete(sessionId);
      }
      
      // イベントリスナーをクリーンアップ（必要に応じて）
      this.removeAllListeners(`session-${sessionId}`);
      
      this.emit('session-stopped', { sessionId });
      
      // デバッグログ
      if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
        console.error(`[SessionWatcher] Completely stopped watching session ${sessionId}`);
      }
    }
  }

  getSessionData(sessionId: string): SessionData | null {
    if (this.sessions.has(sessionId)) {
      this.updateAccessTime(sessionId);
    }
    return this.sessions.get(sessionId) || null;
  }

  /**
   * メモリ使用状況の統計を取得
   */
  getMemoryStats(): {
    activeSessions: number;
    maxSessions: number;
    watchedFiles: number;
    cachedFiles: number;
    oldestSessionAge: number | null;
    estimatedMemoryMB: number;
  } {
    const now = Date.now();
    let oldestAge: number | null = null;
    
    // 最も古いセッションの経過時間を計算
    if (this.lastAccessTime.size > 0) {
      const oldestTime = Math.min(...Array.from(this.lastAccessTime.values()));
      oldestAge = now - oldestTime;
    }
    
    // 推定メモリ使用量の計算（概算）
    // 各セッションデータは平均10KB、各ウォッチャーは1KBと仮定
    const sessionMemory = this.sessions.size * 10; // KB
    const watcherMemory = this.watchers.size * 1; // KB
    const cacheMemory = this.cachedFiles.size * 0.1; // KB (ファイルパスのみ)
    const estimatedMemoryKB = sessionMemory + watcherMemory + cacheMemory;
    
    return {
      activeSessions: this.sessions.size,
      maxSessions: SessionWatcher.MAX_SESSIONS,
      watchedFiles: this.watchers.size,
      cachedFiles: this.cachedFiles.size,
      oldestSessionAge: oldestAge,
      estimatedMemoryMB: estimatedMemoryKB / 1024
    };
  }

  stopAll(): void {
    // 定期クリーンアップタイマーを停止
    this.stopCleanupTimer();
    
    for (const sessionId of this.watchers.keys()) {
      this.stopWatching(sessionId);
    }
    
    // ディレクトリ監視も停止
    if (this.directoryWatcher) {
      this.directoryWatcher.close();
      this.directoryWatcher = null;
    }
    
    // キャッシュをクリア
    this.cachedFiles.clear();
  }
}