import { EventEmitter } from 'events';
import { SessionWatcher } from './session-watcher.js';
import { SessionCache } from './session-cache.js';
import { ContextTracker } from './context-tracker.js';
// import type { SessionData } from '../types/index.js';

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

export class SessionsManager extends EventEmitter {
  private watcher: SessionWatcher;
  private cache: SessionCache;
  private contextTracker: ContextTracker;
  private updateBatch: Set<string>;
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
  }

  private log(message: string): void {
    if (this.debugMode) {
      console.error(`[SessionsManager] ${new Date().toISOString()}: ${message}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.log('Initializing sessions manager...');

    // Set up event handlers before starting directory watch
    this.watcher.on('session-added', async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session added: ${sessionId}`);
      await this.handleSessionChange(filePath);
    });

    this.watcher.on('session-removed', (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session removed: ${sessionId}`);
      this.cache.clearSession(filePath);
      this.batchUpdate();
    });

    this.watcher.on('session-updated', async (data: SessionChangeEvent) => {
      const { sessionId, filePath } = data;
      this.log(`Session updated: ${sessionId}`);
      this.cache.clearSession(filePath); // Clear cache to force re-parse
      await this.handleSessionChange(filePath);
    });

    // Start watching
    await this.watcher.startDirectoryWatch();
    
    // Initial load of all sessions
    await this.loadAllSessions();
    
    this.isInitialized = true;
    this.log('Sessions manager initialized');
  }

  async loadAllSessions(): Promise<void> {
    this.log('Loading all sessions...');
    const files = await this.watcher.getAllJsonlFiles();
    
    // Load sessions in parallel for better performance
    const sessionPromises = files.map(file => this.loadSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    this.log(`Loaded ${sessions.length} sessions`);
    this.emit('sessions-loaded', sessions.filter(Boolean));
  }

  async loadSession(filePath: string): Promise<SessionInfo | null> {
    try {
      const sessionData = await this.cache.parseAndCacheSession(filePath);
      if (!sessionData) {
        return null;
      }

      const contextInfo = this.contextTracker.updateSession({
        sessionId: sessionData.sessionId,
        model: sessionData.model,
        messages: [], // We're using parsed data, not raw messages
        totalTokens: sessionData.totalTokens,
        totalCacheTokens: sessionData.totalCacheTokens
      } as any);

      // Extend context info with session-specific data
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

  async handleSessionChange(filePath: string): Promise<void> {
    // Add to batch and schedule update
    this.updateBatch.add(filePath);
    this.batchUpdate();
  }

  private batchUpdate(): void {
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Schedule batched update
    this.batchTimeout = setTimeout(async () => {
      await this.processBatch();
    }, 100); // 100ms debounce
  }

  private async processBatch(): Promise<void> {
    if (this.updateBatch.size === 0) return;

    this.log(`Processing batch update for ${this.updateBatch.size} sessions`);
    // const filePaths = Array.from(this.updateBatch);
    this.updateBatch.clear();

    // Load updated sessions
    // const sessionPromises = filePaths.map(file => this.loadSession(file));
    
    // Get all current sessions
    const allSessions = await this.getAllSessions();
    
    this.emit('sessions-updated', allSessions);
    this.log(`Batch update completed - ${allSessions.length} total sessions`);
  }

  async getAllSessions(): Promise<SessionInfo[]> {
    const files = await this.watcher.getAllJsonlFiles();
    const sessionPromises = files.map(file => this.loadSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    return sessions
      .filter((session): session is SessionInfo => session !== null)
      .sort((a, b) => {
        // Sort by last modified, newest first
        const aTime = a.lastModified?.getTime() || 0;
        const bTime = b.lastModified?.getTime() || 0;
        return bTime - aTime;
      });
  }

  async getActiveSession(): Promise<any> {
    return this.watcher.findActiveSession();
  }

  destroy(): void {
    this.log('Destroying sessions manager...');
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    this.watcher.stopAll();
    this.cache.clearAll();
    this.removeAllListeners();
    
    this.isInitialized = false;
    this.log('Sessions manager destroyed');
  }
}