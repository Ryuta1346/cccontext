import { EventEmitter } from "events";
import { ContextTracker } from "./context-tracker.js";
import { SessionCache } from "./session-cache.js";
import { SessionWatcher } from "./session-watcher.js";

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
  warningLevel: "normal" | "warning" | "severe" | "critical";
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
 * Event-driven session management system
 */
export class EnhancedSessionsManager extends EventEmitter {
  private watcher: SessionWatcher;
  private cache: SessionCache;
  private contextTracker: ContextTracker;
  private updateBatch: Set<string>; // For batch updates
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

    this.log("Initializing enhanced sessions manager...");

    try {
      // Setup file monitoring events
      this.setupFileWatchingEvents();

      // Start directory monitoring
      await this.watcher.startDirectoryWatch();

      // Initial session loading
      await this.loadAllSessions();

      this.isInitialized = true;
      this.log("Enhanced sessions manager initialized successfully");
    } catch (error) {
      this.log(`Initialization error: ${(error as Error).message}`);
      throw error;
    }
  }

  private setupFileWatchingEvents(): void {
    // When a new session file is added
    this.watcher.on("session-added", async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session added: ${sessionId}`);
      this.scheduleUpdate(filePath);
    });

    // When a session file is deleted
    this.watcher.on("session-removed", (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session removed: ${sessionId}`);
      this.cache.clearSession(filePath);
      this.emitSessionsUpdate();
    });

    // When a session file is updated (new messages, etc.)
    this.watcher.on("session-updated", async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session updated: ${sessionId}`);
      this.cache.clearSession(filePath); // Clear cache to force reload
      this.scheduleUpdate(filePath);
    });
  }

  /**
   * Initial loading of all sessions
   */
  async loadAllSessions(): Promise<void> {
    this.log("Loading all sessions...");

    try {
      const files = await this.watcher.getAllJsonlFiles();
      this.log(`Found ${files.length} session files`);

      // Load sessions in parallel for performance improvement
      const sessionPromises = files.map((file) => this.loadSingleSession(file));
      const sessions = await Promise.all(sessionPromises);
      const validSessions = sessions.filter((session): session is SessionInfo => session !== null);

      this.log(`Successfully loaded ${validSessions.length} sessions`);
      this.emit("sessions-loaded", validSessions);
    } catch (error) {
      this.log(`Error loading sessions: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Load a single session
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
        totalCost: sessionData.totalCost,
      });

      // Return all context info including autoCompact
      return {
        ...contextInfo,
        lastModified: sessionData.lastModified instanceof Date ? sessionData.lastModified : undefined,
        startTime: sessionData.firstTimestamp || undefined,
        latestPrompt: sessionData.latestPrompt,
        latestPromptTime: sessionData.lastTimestamp || undefined,
      };
    } catch (error) {
      this.log(`Error loading session ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Schedule batch updates
   */
  private scheduleUpdate(filePath: string): void {
    this.updateBatch.add(filePath);

    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // 100ms debounce - process multiple changes at once
    this.batchTimeout = setTimeout(async () => {
      await this.processBatchUpdate();
    }, 100);
  }

  /**
   * Process batch updates
   */
  private async processBatchUpdate(): Promise<void> {
    if (this.updateBatch.size === 0) return;

    const filePaths = Array.from(this.updateBatch);
    this.updateBatch.clear();

    this.log(`Processing batch update for ${filePaths.length} files`);

    try {
      // Load updated sessions in parallel
      const sessionPromises = filePaths.map((file) => this.loadSingleSession(file));
      await Promise.all(sessionPromises);

      // Get latest state of all sessions and notify
      this.emitSessionsUpdate();
    } catch (error) {
      this.log(`Error in batch update: ${(error as Error).message}`);
    }
  }

  /**
   * Emit session update events
   */
  private async emitSessionsUpdate(): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      this.emit("sessions-updated", sessions);
    } catch (error) {
      this.log(`Error emitting sessions update: ${(error as Error).message}`);
    }
  }

  /**
   * Get all current sessions
   */
  async getAllSessions(): Promise<SessionInfo[]> {
    const files = await this.watcher.getAllJsonlFiles();
    const sessionPromises = files.map((file) => this.loadSingleSession(file));
    const sessions = await Promise.all(sessionPromises);

    return sessions
      .filter((session): session is SessionInfo => session !== null)
      .sort((a, b) => {
        // Sort by last update time in descending order
        const aTime = a.lastModified?.getTime() || 0;
        const bTime = b.lastModified?.getTime() || 0;
        return bTime - aTime;
      });
  }

  /**
   * Get active session
   */
  async getActiveSession(): Promise<{ sessionId: string; filePath: string } | null> {
    return this.watcher.findActiveSession();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { cachedSessions: number; fileStats: number } {
    return this.cache.getCacheStats();
  }

  /**
   * Clear session cache
   */
  clearCache(): void {
    this.cache.clearAll();
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.log("Destroying enhanced sessions manager...");

    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    this.watcher.stopAll();
    this.cache.clearAll();
    this.updateBatch.clear();
    this.removeAllListeners();

    this.isInitialized = false;
    this.log("Enhanced sessions manager destroyed");
  }
}
