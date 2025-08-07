import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import type { MessageContent, MessageData, SessionData } from "../types/index.js";

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
  // Memory management constants
  private static readonly MAX_SESSIONS = parseInt(process.env.CCCONTEXT_MAX_SESSIONS || "100", 10);
  private static readonly SESSION_TTL_MS = parseInt(process.env.CCCONTEXT_SESSION_TTL_MS || "3600000", 10); // 1時間
  private static readonly CLEANUP_INTERVAL_MS = parseInt(process.env.CCCONTEXT_CLEANUP_INTERVAL_MS || "600000", 10); // 10分

  private projectsDir: string;
  private sessions: Map<string, SessionData>;
  private watchers: Map<string, FSWatcher>;
  private filePositions: Map<string, number>;
  private directoryWatcher: FSWatcher | null;
  private cachedFiles: Set<string>;
  private fileMtimes?: Map<string, number>;

  // Additional properties for memory management
  private lastAccessTime: Map<string, number>;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor() {
    super();

    // Use environment variable or standard path (security improvement)
    const baseDir = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), ".claude/projects");

    // Resolve relative paths and ../ with path normalization
    this.projectsDir = path.resolve(baseDir);

    // Validate directory existence and permissions
    this.validateProjectsDir();

    this.sessions = new Map();
    this.watchers = new Map();
    this.filePositions = new Map();
    this.directoryWatcher = null;
    this.cachedFiles = new Set();
    this.lastAccessTime = new Map();
    this.cleanupTimer = null;

    // Start periodic cleanup timer
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
      return; // Timer already running
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

    // If session count exceeds maximum, delete oldest ones first
    if (this.sessions.size > SessionWatcher.MAX_SESSIONS) {
      // Sort by access time (oldest first)
      const sortedSessions = Array.from(this.lastAccessTime.entries()).sort((a, b) => a[1] - b[1]);

      const excessCount = this.sessions.size - SessionWatcher.MAX_SESSIONS + 1; // +1 for new session
      for (let i = 0; i < Math.min(excessCount, sortedSessions.length); i++) {
        const session = sortedSessions[i];
        if (session && !sessionsToRemove.includes(session[0])) {
          sessionsToRemove.push(session[0]);
        }
      }
    }

    // Delete session
    for (const sessionId of sessionsToRemove) {
      this.stopWatching(sessionId);

      // Debug log
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

      // Check read permissions
      fs.accessSync(this.projectsDir, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Only warn if directory doesn't exist
        console.warn(`Claude projects directory not found: ${this.projectsDir}`);
        console.warn("Sessions monitoring will not be available until the directory is created.");
      } else if ((error as NodeJS.ErrnoException).code === "EACCES") {
        console.error(`No read permission for directory: ${this.projectsDir}`);
      } else {
        console.error(`Error accessing projects directory: ${(error as Error).message}`);
      }
    }
  }

  async findActiveSession(): Promise<ActiveSession | null> {
    const files = await this.getAllJsonlFiles();
    if (files.length === 0) return null;

    // Find file with latest update time
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

    // Extract session ID
    const sessionId = path.basename(latestFile, ".jsonl");
    return { sessionId, filePath: latestFile };
  }

  async getAllJsonlFiles(): Promise<string[]> {
    // Return cache if it exists
    if (this.cachedFiles.size > 0) {
      return Array.from(this.cachedFiles);
    }

    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        // Normalize and validate directory path
        const normalizedDir = path.resolve(dir);

        // Prevent access outside project directory
        if (!normalizedDir.startsWith(this.projectsDir)) {
          console.warn(`Skipping directory outside projects path: ${normalizedDir}`);
          return;
        }

        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          // Check for symbolic links
          if (entry.isSymbolicLink()) {
            // Don't follow symbolic links (security measure)
            continue;
          }

          if (entry.isDirectory()) {
            await walkDir(fullPath);
          } else if (entry.isFile() && path.extname(entry.name) === ".jsonl") {
            // Normalize and validate file path as well
            const normalizedPath = path.resolve(fullPath);
            if (normalizedPath.startsWith(this.projectsDir)) {
              files.push(normalizedPath);
            }
          }
        }
      } catch (error) {
        // Log directory access errors in detail
        if (process.env.DEBUG) {
          console.debug(`Error accessing directory ${dir}: ${(error as Error).message}`);
        }
      }
    };

    await walkDir(this.projectsDir);

    // Update cache
    this.cachedFiles = new Set(files);

    return files;
  }

  // Invalidate cache to force full scan next time
  invalidateCache(): void {
    this.cachedFiles.clear();
  }

  async startDirectoryWatch(): Promise<void> {
    if (this.directoryWatcher) {
      return; // Already monitoring
    }

    // Create cache with initial scan
    await this.getAllJsonlFiles();

    // Monitor entire directory
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
        pollInterval: 50,
      },
    });

    // When new .jsonl files are added
    this.directoryWatcher.on("add", (filePath: string) => {
      if (path.extname(filePath) === ".jsonl") {
        this.cachedFiles.add(filePath);
        const sessionId = path.basename(filePath, ".jsonl");
        this.emit("session-added", { sessionId, filePath });
      }
    });

    // .jsonlファイルが削除された時
    this.directoryWatcher.on("unlink", (filePath: string) => {
      if (path.extname(filePath) === ".jsonl") {
        this.cachedFiles.delete(filePath);
        const sessionId = path.basename(filePath, ".jsonl");
        this.emit("session-removed", { sessionId, filePath });
      }
    });

    // .jsonlファイルが変更された時（/compactなど）
    this.directoryWatcher.on("change", (filePath: string) => {
      if (path.extname(filePath) === ".jsonl") {
        const sessionId = path.basename(filePath, ".jsonl");
        this.emit("session-updated", { sessionId, filePath });
      }
    });

    this.emit("directory-watch-started");
  }

  async watchSession(sessionId: string, filePath: string): Promise<void> {
    if (this.watchers.has(sessionId)) {
      this.updateAccessTime(sessionId);
      return;
    }

    // Check maximum session count
    if (this.sessions.size >= SessionWatcher.MAX_SESSIONS) {
      // Clean up old sessions
      await this.cleanupOldSessions();

      // If still exceeding maximum count, throw error
      if (this.sessions.size >= SessionWatcher.MAX_SESSIONS) {
        throw new Error(`Maximum number of sessions (${SessionWatcher.MAX_SESSIONS}) reached`);
      }
    }

    // Record access time
    this.updateAccessTime(sessionId);

    // Record current file position
    const stats = await fs.promises.stat(filePath);
    this.filePositions.set(sessionId, stats.size);

    // Initial read (not a compact operation, so false)
    await this.readExistingData(sessionId, filePath, false);

    // Start file monitoring
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 50,
      },
    });

    watcher.on("change", async () => {
      await this.handleFileChange(sessionId, filePath);
    });

    this.watchers.set(sessionId, watcher);
    this.emit("session-started", { sessionId, filePath });
  }

  async readExistingData(sessionId: string, filePath: string, isCompactOperation = false): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content
        .trim()
        .split("\n")
        .filter((line) => line);

      // Get session data or create new
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
          model: "unknown",
          startTime: null,
        };
      }

      // /compact操作の場合は既存データをクリア
      if (isCompactOperation && this.sessions.has(sessionId)) {
        sessionData.messages = [];
        sessionData.totalTokens = 0;
        sessionData.totalCacheTokens = 0;
        sessionData.totalCost = 0;
        sessionData.turns = 0;
        sessionData.model = "unknown";
        sessionData.startTime = null;
      }

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          this.processMessage(sessionData, data);
        } catch (_e) {
          // Skip invalid JSON lines
        }
      }

      this.sessions.set(sessionId, sessionData);
      this.emit("session-data", sessionData);
    } catch (error) {
      this.emit("error", { sessionId, error } as ErrorEvent);
    }
  }

  async handleFileChange(sessionId: string, filePath: string): Promise<void> {
    // Update access time
    this.updateAccessTime(sessionId);

    try {
      const stats = await fs.promises.stat(filePath);
      const lastPosition = Math.max(0, this.filePositions.get(sessionId) || 0);
      const lastMtime = this.fileMtimes?.get(sessionId) || 0;

      // If file size decreased or changed significantly
      // （/compactなどでファイルが置き換えられた可能性）
      // Or if last modified time changed significantly
      const isCompactOperation =
        stats.size < lastPosition ||
        Math.abs(stats.size - lastPosition) > 5000 ||
        (lastMtime && Math.abs(stats.mtimeMs - lastMtime) > 60000);

      if (isCompactOperation) {
        // Reload entire file
        // console.logは blessed UIと干渉するため、デバッグモードの場合のみ出力
        if (process.env.DEBUG || process.env.SESSION_WATCHER_DEBUG) {
          console.error(`[SessionWatcher] Compact operation detected for ${sessionId}`);
        }
        this.filePositions.set(sessionId, 0);
        await this.readExistingData(sessionId, filePath, true); // isCompactOperationフラグをtrueに
        // Record current file size and modification time
        this.filePositions.set(sessionId, stats.size);
        if (!this.fileMtimes) this.fileMtimes = new Map();
        this.fileMtimes.set(sessionId, stats.mtimeMs);

        // compact検出を通知
        this.emit("compact-detected", { sessionId, filePath });
      } else if (stats.size > lastPosition) {
        // Read new data (incremental reading)
        const stream = fs.createReadStream(filePath, {
          start: Math.max(0, lastPosition),
          encoding: "utf-8",
        });

        let buffer = "";
        stream.on("data", (chunk: string | Buffer) => {
          const chunkStr = chunk.toString();
          buffer += chunkStr;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                const sessionData = this.sessions.get(sessionId);
                if (sessionData) {
                  this.processMessage(sessionData, data);
                  this.emit("message", { sessionId, data, sessionData } as MessageEvent);
                }
              } catch (_e) {
                // Skip invalid JSON lines
              }
            }
          }
        });

        stream.on("end", () => {
          this.filePositions.set(sessionId, stats.size);
          if (!this.fileMtimes) this.fileMtimes = new Map();
          this.fileMtimes.set(sessionId, stats.mtimeMs);
        });
      }
      // stats.size === lastPosition の場合は何もしない（変更なし）
    } catch (error) {
      this.emit("error", { sessionId, error } as ErrorEvent);
    }
  }

  processMessage(sessionData: SessionData, data: MessageData): void {
    // Detect /compact
    const contentStr = typeof data.message?.content === "string" ? data.message.content : "";
    if (
      contentStr.includes("[Previous conversation summary") ||
      contentStr.includes("Previous conversation compacted")
    ) {
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

      if (data.message?.role === "assistant") {
        sessionData.turns++;
      }

      // Store latest usage
      sessionData.latestUsage = {
        input: inputTokens,
        output: outputTokens,
        cache: cacheReadTokens,
        cacheCreation: cacheCreationTokens,
        timestamp: data.timestamp ? String(data.timestamp) : undefined,
      };
    }

    // Store latest user prompt
    if (data.message?.role === "user" && data.message?.content) {
      const content = Array.isArray(data.message.content)
        ? data.message.content.find((c: MessageContent) => c.type === "text")?.text || ""
        : data.message.content;

      if (content) {
        sessionData.latestPrompt = content;
        sessionData.latestPromptTime = data.timestamp ? String(data.timestamp) : undefined;
      }
    }

    // MessageDataをMessage形式に変換して保存
    // contentがない場合も処理するため、空文字列をデフォルトとして使用
    if (data.message?.role) {
      if (!sessionData.messages) {
        sessionData.messages = [];
      }
      sessionData.messages.push({
        role: data.message.role,
        content: data.message.content ?? "",
        usage: data.message.usage,
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

      // Remove entries from all Maps
      this.watchers.delete(sessionId);
      this.filePositions.delete(sessionId);
      this.sessions.delete(sessionId);
      this.lastAccessTime.delete(sessionId);

      // Remove file modification time as well
      if (this.fileMtimes) {
        this.fileMtimes.delete(sessionId);
      }

      // Clean up event listeners (if needed)
      this.removeAllListeners(`session-${sessionId}`);

      this.emit("session-stopped", { sessionId });

      // Debug log
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

    // Calculate elapsed time for oldest session
    if (this.lastAccessTime.size > 0) {
      const oldestTime = Math.min(...Array.from(this.lastAccessTime.values()));
      oldestAge = now - oldestTime;
    }

    // Calculate estimated memory usage (approximate)
    // Assume each session data is 10KB average, each watcher is 1KB
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
      estimatedMemoryMB: estimatedMemoryKB / 1024,
    };
  }

  stopAll(): void {
    // Stop periodic cleanup timer
    this.stopCleanupTimer();

    for (const sessionId of this.watchers.keys()) {
      this.stopWatching(sessionId);
    }

    // Stop directory monitoring as well
    if (this.directoryWatcher) {
      this.directoryWatcher.close();
      this.directoryWatcher = null;
    }

    // Clear cache
    this.cachedFiles.clear();
  }
}
