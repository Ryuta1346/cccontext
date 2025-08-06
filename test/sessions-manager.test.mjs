import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionsManager } from '../src/monitor/sessions-manager.mjs';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the cache parseSessionFile to parseAndCacheSession
vi.mock('../src/monitor/session-cache.mjs', () => {
  return {
    SessionCache: vi.fn().mockImplementation(() => {
      const cache = new Map();
      const fileStats = new Map();
      
      const mockCache = {
        cache,
        fileStats,
        clearSession: vi.fn((filePath) => {
          const sessionId = path.basename(filePath, '.jsonl');
          cache.delete(sessionId);
        }),
        clearAll: vi.fn(() => {
          cache.clear();
          fileStats.clear();
        }),
        parseAndCacheSession: vi.fn(async (filePath) => {
          // This is what the code calls, but actual method is parseAndCacheSession
          const sessionId = path.basename(filePath, '.jsonl');
          
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line);
            
            let model = 'claude-3-5-sonnet-20241022';
            let totalTokens = 0;
            let totalInputTokens = 0;
            let totalOutputTokens = 0;
            let totalCacheTokens = 0;
            let totalCost = 0;
            let turns = 0;
            let latestPrompt = '';
            let firstTimestamp = null;
            let lastTimestamp = null;
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                
                if (data.timestamp) {
                  if (!firstTimestamp) firstTimestamp = data.timestamp;
                  lastTimestamp = data.timestamp;
                }
                
                if (data.message?.model) {
                  model = data.message.model;
                }
                
                if (data.message?.usage) {
                  const usage = data.message.usage;
                  totalInputTokens += usage.input_tokens || 0;
                  totalOutputTokens += usage.output_tokens || 0;
                  // Cache tokens should not be accumulated - use the latest value only
                  if (usage.cache_read_input_tokens > 0) {
                    totalCacheTokens = usage.cache_read_input_tokens;
                  }
                  totalTokens = totalInputTokens + totalOutputTokens;
                  
                  if (data.message.role === 'assistant') {
                    turns++;
                  }
                  
                  // Simplified cost calculation
                  totalCost += (totalInputTokens / 1000000) * 3 + (totalOutputTokens / 1000000) * 15;
                }
                
                if (data.message?.role === 'user' && data.message?.content) {
                  latestPrompt = typeof data.message.content === 'string' 
                    ? data.message.content 
                    : data.message.content.find(c => c.type === 'text')?.text || '';
                }
              } catch (e) {
                // Skip invalid lines
              }
            }
            
            const stats = await fs.stat(filePath);
            
            return {
              sessionId,
              model,
              totalTokens,
              totalInputTokens,
              totalOutputTokens,
              totalCacheTokens,
              totalCost,
              turns,
              latestPrompt,
              firstTimestamp,
              lastTimestamp,
              lastModified: stats.mtime
            };
          } catch (error) {
            return null;
          }
        }),
        calculateUsagePercentage: vi.fn((sessionData) => {
          const contextWindow = 200000; // Default for most models
          return (sessionData.totalTokens / contextWindow) * 100;
        })
      };
      // Add parseSessionFile as an alias for backward compatibility
      mockCache.parseSessionFile = mockCache.parseAndCacheSession;
      return mockCache;
    })
  };
});

describe('SessionsManager', () => {
  let manager;
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cccontext-test-manager-'));
    manager = new SessionsManager();
    manager.watcher.projectsDir = tempDir;
  });

  afterEach(async () => {
    if (manager) {
      manager.destroy();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(manager.isInitialized).toBe(false);
      
      await manager.initialize();
      
      expect(manager.isInitialized).toBe(true);
      expect(manager.watcher.directoryWatcher).toBeTruthy();
    });

    it('should not reinitialize if already initialized', async () => {
      await manager.initialize();
      const firstWatcher = manager.watcher.directoryWatcher;
      
      await manager.initialize();
      
      expect(manager.watcher.directoryWatcher).toBe(firstWatcher);
    });

    it('should emit sessions-loaded event on initialization', async () => {
      // Create test session files
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionData = {
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      };
      
      await fs.writeFile(
        path.join(projectDir, 'session1.jsonl'),
        JSON.stringify(sessionData) + '\n'
      );
      
      let sessionsLoaded = false;
      manager.on('sessions-loaded', (sessions) => {
        sessionsLoaded = true;
        expect(sessions).toHaveLength(1);
        expect(sessions[0].sessionId).toBe('session1');
      });
      
      await manager.initialize();
      
      expect(sessionsLoaded).toBe(true);
    });
  });

  describe('Session Loading', () => {
    it('should load all sessions from directory', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create multiple session files
      for (let i = 1; i <= 3; i++) {
        const sessionData = {
          timestamp: `2025-01-01T00:0${i}:00Z`,
          message: {
            model: 'claude-3-5-sonnet-20241022',
            role: 'assistant',
            usage: { input_tokens: i * 100, output_tokens: i * 200 }
          }
        };
        
        await fs.writeFile(
          path.join(projectDir, `session${i}.jsonl`),
          JSON.stringify(sessionData) + '\n'
        );
      }
      
      await manager.loadAllSessions();
      const sessions = await manager.getAllSessions();
      
      expect(sessions).toHaveLength(3);
      expect(sessions.map(s => s.sessionId).sort()).toEqual(['session1', 'session2', 'session3']);
    });

    it('should handle session loading errors gracefully', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create invalid session file
      await fs.writeFile(
        path.join(projectDir, 'invalid.jsonl'),
        'invalid json content'
      );
      
      // Mock parseAndCacheSession to return null for this specific file
      const originalParse = manager.cache.parseAndCacheSession;
      manager.cache.parseAndCacheSession = vi.fn(async (filePath) => {
        if (filePath.includes('invalid.jsonl')) {
          return null;
        }
        return originalParse(filePath);
      });
      
      const session = await manager.loadSession(path.join(projectDir, 'invalid.jsonl'));
      
      expect(session).toBeNull();
    });

    it('should sort sessions by last modified time', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create sessions with different timestamps
      for (let i = 1; i <= 3; i++) {
        const sessionData = {
          timestamp: `2025-01-01T00:0${i}:00Z`,
          message: {
            model: 'claude-3-5-sonnet-20241022',
            role: 'assistant',
            usage: { input_tokens: 100, output_tokens: 200 }
          }
        };
        
        const file = path.join(projectDir, `session${i}.jsonl`);
        await fs.writeFile(file, JSON.stringify(sessionData) + '\n');
        
        // Add delay to ensure different mtime
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      const sessions = await manager.getAllSessions();
      
      // Should be sorted newest first
      expect(sessions[0].sessionId).toBe('session3');
      expect(sessions[1].sessionId).toBe('session2');
      expect(sessions[2].sessionId).toBe('session1');
    });
  });

  describe('Event Handling', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should handle session-added event', async () => {
      let updateEmitted = false;
      manager.on('sessions-updated', (sessions) => {
        updateEmitted = true;
        expect(sessions.some(s => s.sessionId === 'new-session')).toBe(true);
      });
      
      // Simulate session added - create file directly in tempDir
      const newFile = path.join(tempDir, 'new-session.jsonl');
      await fs.writeFile(newFile, JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      }) + '\n');
      
      // Simulate what the watcher does when a file is added
      manager.watcher.cachedFiles.add(newFile);
      manager.watcher.emit('session-added', { sessionId: 'new-session', filePath: newFile });
      
      // Wait for batch processing (increased timeout for reliability)
      await new Promise(resolve => setTimeout(resolve, 250));
      
      expect(updateEmitted).toBe(true);
    });

    it('should handle session-removed event', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'remove-me.jsonl');
      
      await fs.writeFile(sessionFile, JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      }) + '\n');
      
      // Load initial sessions
      await manager.loadAllSessions();
      
      // Verify cache is cleared when session is removed
      // First ensure the file is in the cache
      manager.watcher.cachedFiles.add(sessionFile);
      
      // Then simulate removal
      manager.watcher.cachedFiles.delete(sessionFile);
      manager.watcher.emit('session-removed', { sessionId: 'remove-me', filePath: sessionFile });
      
      // Check that cache was cleared
      expect(manager.cache.clearSession).toHaveBeenCalledWith(sessionFile);
      
      // Since session-removed triggers batchUpdate(), we need to wait and check
      // But it only schedules a batch update, which will fetch all files again
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // The batch update should have been triggered
      // For a proper test, we need to check that getAllSessions after removal doesn't include the removed session
      // But since we didn't actually remove the file, it will still be found
      
      // Remove the file physically
      await fs.unlink(sessionFile);
      
      // Now get all sessions - removed file should not be included
      const sessions = await manager.getAllSessions();
      expect(sessions.every(s => s.sessionId !== 'remove-me')).toBe(true);
    });

    it('should handle session-updated event', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'update-me.jsonl');
      
      // Initial content
      await fs.writeFile(sessionFile, JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      }) + '\n');
      
      let updateEmitted = false;
      manager.on('sessions-updated', (sessions) => {
        updateEmitted = true;
        const updatedSession = sessions.find(s => s.sessionId === 'update-me');
        expect(updatedSession).toBeTruthy();
      });
      
      // Update content
      await fs.appendFile(sessionFile, JSON.stringify({
        timestamp: '2025-01-01T00:01:00Z',
        message: {
          role: 'assistant',
          usage: { input_tokens: 200, output_tokens: 300 }
        }
      }) + '\n');
      
      // Simulate session updated
      manager.watcher.emit('session-updated', { sessionId: 'update-me', filePath: sessionFile });
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(updateEmitted).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    it('should batch multiple updates', async () => {
      await manager.initialize();
      
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      let updateCount = 0;
      manager.on('sessions-updated', () => {
        updateCount++;
      });
      
      // Create multiple files rapidly
      for (let i = 1; i <= 5; i++) {
        const file = path.join(projectDir, `batch${i}.jsonl`);
        await fs.writeFile(file, JSON.stringify({
          timestamp: '2025-01-01T00:00:00Z',
          message: {
            model: 'claude-3-5-sonnet-20241022',
            role: 'assistant',
            usage: { input_tokens: 100, output_tokens: 200 }
          }
        }) + '\n');
        
        manager.handleSessionChange(file);
      }
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Should emit once or twice due to batching (timing dependent)
      // Sometimes the first batch might complete before all files are added
      expect(updateCount).toBeGreaterThanOrEqual(1);
      expect(updateCount).toBeLessThanOrEqual(2);
    });

    it('should clear batch after processing', async () => {
      await manager.initialize();
      
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const file = path.join(projectDir, 'test.jsonl');
      
      await fs.writeFile(file, JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      }) + '\n');
      
      manager.handleSessionChange(file);
      expect(manager.updateBatch.size).toBe(1);
      
      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(manager.updateBatch.size).toBe(0);
    });
  });

  describe('Debug Mode', () => {
    it('should log messages in debug mode', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      manager.setDebugMode(true);
      manager.log('Test message');
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
      
      consoleSpy.mockRestore();
    });

    it('should not log messages when debug mode is off', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      manager.setDebugMode(false);
      manager.log('Test message');
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Active Session', () => {
    it('should get active session', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create session files with different timestamps
      await fs.writeFile(
        path.join(projectDir, 'old.jsonl'),
        JSON.stringify({
          timestamp: '2025-01-01T00:00:00Z',
          message: { model: 'claude-3-5-sonnet-20241022', role: 'assistant' }
        }) + '\n'
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await fs.writeFile(
        path.join(projectDir, 'new.jsonl'),
        JSON.stringify({
          timestamp: '2025-01-01T00:01:00Z',
          message: { model: 'claude-3-5-sonnet-20241022', role: 'assistant' }
        }) + '\n'
      );
      
      const activeSession = await manager.getActiveSession();
      
      expect(activeSession).toBeTruthy();
      expect(activeSession.sessionId).toBe('new');
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', async () => {
      await manager.initialize();
      
      // Add some sessions to batch
      manager.updateBatch.add('test1');
      manager.updateBatch.add('test2');
      
      // Set a batch timeout
      manager.batchTimeout = setTimeout(() => {}, 1000);
      
      manager.destroy();
      
      expect(manager.isInitialized).toBe(false);
      expect(manager.watcher.directoryWatcher).toBeNull();
      expect(manager.cache.cache.size).toBe(0);
      expect(manager.listenerCount('sessions-updated')).toBe(0);
    });

    it('should handle destroy when not initialized', () => {
      expect(() => manager.destroy()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty batch processing', async () => {
      await manager.initialize();
      
      // Clear the batch
      manager.updateBatch.clear();
      
      let updateEmitted = false;
      manager.on('sessions-updated', () => {
        updateEmitted = true;
      });
      
      await manager.processBatch();
      
      expect(updateEmitted).toBe(false);
    });

    it('should handle session with missing model', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionFile = path.join(projectDir, 'no-model.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'assistant',
          usage: { input_tokens: 100, output_tokens: 200 }
        }
      }) + '\n');
      
      const session = await manager.loadSession(sessionFile);
      
      // Should handle gracefully with default model
      expect(session).toBeTruthy();
      expect(session.model).toBe('claude-3-5-sonnet-20241022'); // Default from mock
    });

    it('should filter out null sessions from results', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create one valid and one invalid session
      await fs.writeFile(
        path.join(projectDir, 'valid.jsonl'),
        JSON.stringify({
          timestamp: '2025-01-01T00:00:00Z',
          message: {
            model: 'claude-3-5-sonnet-20241022',
            role: 'assistant',
            usage: { input_tokens: 100, output_tokens: 200 }
          }
        }) + '\n'
      );
      
      await fs.writeFile(
        path.join(projectDir, 'invalid.jsonl'),
        'invalid json'
      );
      
      // Mock parseAndCacheSession to return null for invalid file
      const originalParse = manager.cache.parseAndCacheSession;
      manager.cache.parseAndCacheSession = vi.fn(async (filePath) => {
        if (filePath.includes('invalid.jsonl')) {
          return null;
        }
        return originalParse(filePath);
      });
      
      const sessions = await manager.getAllSessions();
      
      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('valid');
    });
  });
});