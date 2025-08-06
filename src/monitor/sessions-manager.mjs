import { EventEmitter } from 'events';
import { SessionWatcher } from './session-watcher.mjs';
import { SessionCache } from './session-cache.mjs';
import { ContextTracker } from './context-tracker.mjs';

export class SessionsManager extends EventEmitter {
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

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  log(message) {
    if (this.debugMode) {
      console.error(`[SessionsManager] ${new Date().toISOString()}: ${message}`);
    }
  }

  async initialize() {
    if (this.isInitialized) return;

    this.log('Initializing sessions manager...');

    // Set up event handlers before starting directory watch
    this.watcher.on('session-added', async ({ sessionId, filePath }) => {
      this.log(`Session added: ${sessionId}`);
      await this.handleSessionChange(filePath);
    });

    this.watcher.on('session-removed', ({ sessionId, filePath }) => {
      this.log(`Session removed: ${sessionId}`);
      this.cache.clearSession(filePath);
      this.batchUpdate();
    });

    this.watcher.on('session-updated', async ({ sessionId, filePath }) => {
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

  async loadAllSessions() {
    this.log('Loading all sessions...');
    const files = await this.watcher.getAllJsonlFiles();
    
    // Load sessions in parallel for better performance
    const sessionPromises = files.map(file => this.loadSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    this.log(`Loaded ${sessions.length} sessions`);
    this.emit('sessions-loaded', sessions.filter(Boolean));
  }

  async loadSession(filePath) {
    try {
      const sessionData = await this.cache.parseAndCacheSession(filePath);
      const contextInfo = this.contextTracker.updateSession({
        sessionId: sessionData.sessionId,
        model: sessionData.model,
        messages: [], // We're using parsed data, not raw messages
        startTime: sessionData.firstTimestamp,
        latestPrompt: sessionData.latestPrompt,
        latestPromptTime: sessionData.lastTimestamp,
        // Pass through pre-calculated values
        totalTokens: sessionData.totalTokens,
        totalInputTokens: sessionData.totalInputTokens,
        totalOutputTokens: sessionData.totalOutputTokens,
        totalCacheTokens: sessionData.totalCacheTokens,
        totalCost: sessionData.totalCost,
        turns: sessionData.turns
      });

      // Return all context info including autoCompact
      return {
        ...contextInfo,
        lastModified: sessionData.lastModified
      };
    } catch (error) {
      this.log(`Error loading session ${filePath}: ${error.message}`);
      return null;
    }
  }

  async handleSessionChange(filePath) {
    // Add to batch and schedule update
    this.updateBatch.add(filePath);
    this.batchUpdate();
  }

  batchUpdate() {
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    // Schedule batched update
    this.batchTimeout = setTimeout(async () => {
      await this.processBatch();
    }, 100); // 100ms debounce
  }

  async processBatch() {
    if (this.updateBatch.size === 0) return;

    this.log(`Processing batch update for ${this.updateBatch.size} sessions`);
    const filePaths = Array.from(this.updateBatch);
    this.updateBatch.clear();

    // Load updated sessions
    const sessionPromises = filePaths.map(file => this.loadSession(file));
    const updatedSessions = await Promise.all(sessionPromises);
    
    // Get all current sessions
    const allSessions = await this.getAllSessions();
    
    this.emit('sessions-updated', allSessions);
    this.log(`Batch update completed - ${allSessions.length} total sessions`);
  }

  async getAllSessions() {
    const files = await this.watcher.getAllJsonlFiles();
    const sessionPromises = files.map(file => this.loadSession(file));
    const sessions = await Promise.all(sessionPromises);
    
    return sessions
      .filter(Boolean)
      .sort((a, b) => {
        // Sort by last modified, newest first
        const aTime = a.lastModified?.getTime() || 0;
        const bTime = b.lastModified?.getTime() || 0;
        return bTime - aTime;
      });
  }

  async getActiveSession() {
    return this.watcher.findActiveSession();
  }

  destroy() {
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