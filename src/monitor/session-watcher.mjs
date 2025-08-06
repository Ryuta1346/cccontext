import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import chokidar from 'chokidar';

export class SessionWatcher extends EventEmitter {
  constructor() {
    super();
    this.projectsDir = path.join(os.homedir(), '.claude/projects');
    this.sessions = new Map();
    this.watchers = new Map();
    this.filePositions = new Map();
    this.directoryWatcher = null;
    this.cachedFiles = new Set();
  }

  async findActiveSession() {
    const files = await this.getAllJsonlFiles();
    if (files.length === 0) return null;

    // 最新の更新時刻を持つファイルを検索
    let latestFile = null;
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

  async getAllJsonlFiles() {
    // キャッシュが存在する場合はキャッシュを返す
    if (this.cachedFiles.size > 0) {
      return Array.from(this.cachedFiles);
    }

    const files = [];
    
    async function walkDir(dir) {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile() && path.extname(entry.name) === '.jsonl') {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // ディレクトリアクセスエラーは無視
      }
    }

    await walkDir(this.projectsDir);
    
    // キャッシュを更新
    this.cachedFiles = new Set(files);
    
    return files;
  }

  // キャッシュを無効化して次回フルスキャンを強制
  invalidateCache() {
    this.cachedFiles.clear();
  }

  async startDirectoryWatch() {
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
    this.directoryWatcher.on('add', (filePath) => {
      if (path.extname(filePath) === '.jsonl') {
        this.cachedFiles.add(filePath);
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-added', { sessionId, filePath });
      }
    });

    // .jsonlファイルが削除された時
    this.directoryWatcher.on('unlink', (filePath) => {
      if (path.extname(filePath) === '.jsonl') {
        this.cachedFiles.delete(filePath);
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-removed', { sessionId, filePath });
      }
    });
    
    // .jsonlファイルが変更された時（/compactなど）
    this.directoryWatcher.on('change', (filePath) => {
      if (path.extname(filePath) === '.jsonl') {
        const sessionId = path.basename(filePath, '.jsonl');
        this.emit('session-updated', { sessionId, filePath });
      }
    });

    this.emit('directory-watch-started');
  }

  async watchSession(sessionId, filePath) {
    if (this.watchers.has(sessionId)) {
      return;
    }

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

  async readExistingData(sessionId, filePath, isCompactOperation = false) {
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
          model: null,
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
        sessionData.model = null;
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
      this.emit('error', { sessionId, error });
    }
  }

  async handleFileChange(sessionId, filePath) {
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
        stream.on('data', chunk => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                const sessionData = this.sessions.get(sessionId);
                this.processMessage(sessionData, data);
                this.emit('message', { sessionId, data, sessionData });
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
      this.emit('error', { sessionId, error });
    }
  }

  processMessage(sessionData, data) {
    // /compact検出
    if (data.message?.content?.includes('[Previous conversation summary') || 
        data.message?.content?.includes('Previous conversation compacted')) {
      sessionData.isCompacted = true;
    }
    
    // タイムスタンプの記録
    if (!sessionData.startTime && data.timestamp) {
      sessionData.startTime = new Date(data.timestamp);
    }

    // モデル情報の抽出（最新のものを優先、ただし既存の情報を保持）
    if (data.message?.model) {
      sessionData.model = data.message.model;
    }

    // usage情報の抽出と集計
    if (data.message?.usage) {
      const usage = data.message.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheReadTokens = usage.cache_read_input_tokens || 0;
      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
      
      // claude-context-calculator方式: 最新メッセージの全トークンが現在のコンテキスト使用量
      // ../research/tools/claude-context-calculator/src/calculator.js:84行目と同じ計算式
      // totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens
      sessionData.totalTokens = cacheReadTokens + inputTokens + outputTokens + cacheCreationTokens;
      
      // キャッシュトークンは個別に保存（互換性のため）
      sessionData.totalCacheTokens = cacheReadTokens;
      
      // ターン数のカウント（assistantメッセージでカウント）
      if (data.message?.role === 'assistant') {
        sessionData.turns++;
      }

      // 最新のusage情報を保存
      sessionData.latestUsage = {
        input: inputTokens,
        output: outputTokens,
        cache: cacheReadTokens,
        cacheCreation: cacheCreationTokens,
        timestamp: data.timestamp
      };
    }

    // 最新のユーザープロンプトを保存
    if (data.message?.role === 'user' && data.message?.content) {
      const content = Array.isArray(data.message.content) 
        ? data.message.content.find(c => c.type === 'text')?.text || ''
        : data.message.content;
      
      if (content) {
        sessionData.latestPrompt = content;
        sessionData.latestPromptTime = data.timestamp;
      }
    }

    sessionData.messages.push(data);
  }

  stopWatching(sessionId) {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
      this.filePositions.delete(sessionId);
      this.sessions.delete(sessionId);
      this.emit('session-stopped', { sessionId });
    }
  }

  stopAll() {
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