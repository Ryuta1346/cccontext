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
    return files;
  }

  async watchSession(sessionId, filePath) {
    if (this.watchers.has(sessionId)) {
      return;
    }

    // ファイルの現在位置を記録
    const stats = await fs.promises.stat(filePath);
    this.filePositions.set(sessionId, stats.size);

    // 初回読み込み
    await this.readExistingData(sessionId, filePath);

    // ファイル監視開始
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    });

    watcher.on('change', async () => {
      await this.handleFileChange(sessionId, filePath);
    });

    this.watchers.set(sessionId, watcher);
    this.emit('session-started', { sessionId, filePath });
  }

  async readExistingData(sessionId, filePath) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      
      const sessionData = {
        sessionId,
        messages: [],
        totalTokens: 0,
        totalCost: 0,
        turns: 0,
        model: null,
        startTime: null
      };

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
      const lastPosition = this.filePositions.get(sessionId) || 0;
      
      if (stats.size > lastPosition) {
        // 新しいデータを読み込む
        const stream = fs.createReadStream(filePath, {
          start: lastPosition,
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
        });
      }
    } catch (error) {
      this.emit('error', { sessionId, error });
    }
  }

  processMessage(sessionData, data) {
    // タイムスタンプの記録
    if (!sessionData.startTime && data.timestamp) {
      sessionData.startTime = new Date(data.timestamp);
    }

    // モデル情報の抽出
    if (data.message?.model && !sessionData.model) {
      sessionData.model = data.message.model;
    }

    // usage情報の抽出と集計
    if (data.message?.usage) {
      const usage = data.message.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheTokens = usage.cache_read_input_tokens || 0;
      
      sessionData.totalTokens += inputTokens + outputTokens;
      
      // ターン数のカウント（assistantメッセージでカウント）
      if (data.message?.role === 'assistant') {
        sessionData.turns++;
      }

      // 最新のusage情報を保存
      sessionData.latestUsage = {
        input: inputTokens,
        output: outputTokens,
        cache: cacheTokens,
        timestamp: data.timestamp
      };
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
  }
}