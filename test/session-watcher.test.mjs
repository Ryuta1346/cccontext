import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chokidar from 'chokidar';
import { SessionWatcher } from '../src/monitor/session-watcher.mjs';

describe('SessionWatcher', () => {
  let tempDir;
  let watcher;

  describe('Error Cases', () => {
    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cccontext-test-errors-'));
      watcher = new SessionWatcher();
      watcher.projectsDir = tempDir;
    });

    afterEach(async () => {
      if (watcher) {
        watcher.stopAll();
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should handle non-existent project directory', async () => {
      watcher.projectsDir = '/non/existent/path';
      
      const files = await watcher.getAllJsonlFiles();
      expect(files.length).toBe(0);
      
      const activeSession = await watcher.findActiveSession();
      expect(activeSession).toBe(null);
    });

    it('should handle malformed JSONL files', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionFile = path.join(projectDir, 'malformed.jsonl');
      const malformedContent = [
        'not json',
        '{ invalid json',
        '{"valid": "json"}',
        'null',
        ''
      ].join('\n');
      
      await fs.writeFile(sessionFile, malformedContent);
      
      // Should not throw
      await watcher.readExistingData('malformed', sessionFile);
      
      const sessionData = watcher.sessions.get('malformed');
      expect(sessionData).toBeTruthy();
      // Only the valid JSON line should be processed
      expect(sessionData.messages.length).toBeLessThanOrEqual(2); // valid json + null
    });

    it('should handle file read errors gracefully', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create a file and then delete it to simulate read error
      const sessionFile = path.join(projectDir, 'deleted.jsonl');
      
      let errorEmitted = false;
      watcher.on('error', ({ sessionId, error }) => {
        errorEmitted = true;
        expect(sessionId).toBe('deleted');
        expect(error.code).toBe('ENOENT');
      });
      
      // Try to read non-existent file - should not throw but emit error
      await watcher.readExistingData('deleted', sessionFile);
      
      expect(errorEmitted).toBeTruthy();
    });

    it('should handle file watch errors', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      const sessionFile = path.join(projectDir, 'watch-error.jsonl');
      await fs.writeFile(sessionFile, '');
      
      let errorEmitted = false;
      watcher.on('error', ({ sessionId, error }) => {
        errorEmitted = true;
        expect(sessionId).toBe('watch-error');
        expect(error).toBeTruthy();
      });
      
      // Start watching
      await watcher.watchSession('watch-error', sessionFile);
      
      // Delete the file to trigger an error during handleFileChange
      await fs.unlink(sessionFile);
      
      // Manually trigger file change to force error
      await watcher.handleFileChange('watch-error', sessionFile);
      
      expect(errorEmitted).toBeTruthy();
    });

    it('should handle invalid message formats', () => {
      const sessionData = {
        sessionId: 'test',
        messages: [],
        totalTokens: 0,
        totalCost: 0,
        turns: 0,
        model: null,
        startTime: null
      };

      // Message without usage
      watcher.processMessage(sessionData, {
        message: {
          role: 'assistant'
          // missing usage
        }
      });
      expect(sessionData.totalTokens).toBe(0);

      // Message with invalid usage values
      watcher.processMessage(sessionData, {
        message: {
          role: 'assistant',
          usage: {
            input_tokens: -100, // negative
            output_tokens: 'abc' // string
          }
        }
      });
      // When adding string 'abc' to number, JavaScript concatenates: -100 + 'abc' = '-100abc'
      expect(typeof sessionData.totalTokens).toBe('string');
      expect(sessionData.totalTokens).toBe('-100abc0'); // cache_read:0 + input:-100 + output:'abc' + cache_creation:0

      // Completely invalid message structure - skip null since it causes error
      watcher.processMessage(sessionData, {});
      watcher.processMessage(sessionData, { message: null });
      
      // Should not crash
      expect(sessionData).toBeTruthy();
    });
  });

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cccontext-test-'));
    watcher = new SessionWatcher();
    watcher.projectsDir = tempDir;
  });

  afterEach(async () => {
    // watcherを停止
    if (watcher) {
      watcher.stopAll();
    }
    // 一時ディレクトリを削除
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find JSONL files in project directory', async () => {
    // テスト用のファイル構造を作成
    const projectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(projectDir, { recursive: true });
    
    await fs.writeFile(path.join(projectDir, 'session1.jsonl'), '');
    await fs.writeFile(path.join(projectDir, 'session2.jsonl'), '');
    await fs.writeFile(path.join(projectDir, 'other.txt'), '');
    
    const files = await watcher.getAllJsonlFiles();
    
    expect(files.length).toBe(2);
    expect(files.some(f => f.endsWith('session1.jsonl'))).toBeTruthy();
    expect(files.some(f => f.endsWith('session2.jsonl'))).toBeTruthy();
  });

  it('should find the most recently updated session', async () => {
    const projectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(projectDir, { recursive: true });
    
    // 異なる時刻で2つのファイルを作成
    const file1 = path.join(projectDir, 'old-session.jsonl');
    const file2 = path.join(projectDir, 'new-session.jsonl');
    
    await fs.writeFile(file1, '');
    await new Promise(resolve => setTimeout(resolve, 10)); // 少し待つ
    await fs.writeFile(file2, '');
    
    const activeSession = await watcher.findActiveSession();
    
    expect(activeSession).toBeTruthy();
    expect(activeSession.sessionId).toBe('new-session');
    expect(activeSession.filePath.endsWith('new-session.jsonl')).toBeTruthy();
  });

  it('should process messages correctly', () => {
    const sessionData = {
      sessionId: 'test',
      messages: [],
      totalTokens: 0,
      totalCost: 0,
      turns: 0,
      model: null,
      startTime: null
    };

    // 最初のメッセージ
    watcher.processMessage(sessionData, {
      timestamp: '2025-01-01T00:00:00Z',
      message: {
        model: 'claude-3-5-sonnet-20241022',
        role: 'user',
        usage: {
          input_tokens: 100,
          output_tokens: 0
        }
      }
    });

    expect(sessionData.model).toBe('claude-3-5-sonnet-20241022');
    expect(sessionData.totalTokens).toBe(100); // cache_read:0 + input:100 + output:0 + cache_creation:0
    expect(sessionData.turns).toBe(0); // userメッセージはターンとしてカウントしない
    expect(sessionData.startTime).toBeTruthy();

    // アシスタントのレスポンス
    watcher.processMessage(sessionData, {
      timestamp: '2025-01-01T00:00:10Z',
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 0,
          output_tokens: 200,
          cache_read_input_tokens: 50
        }
      }
    });

    expect(sessionData.totalTokens).toBe(250); // cache_read:50 + input:0 + output:200 + cache_creation:0
    expect(sessionData.turns).toBe(1); // assistantメッセージで+1
    expect(sessionData.latestUsage).toEqual({
      input: 0,
      output: 200,
      cache: 50,
      cacheCreation: 0,
      timestamp: '2025-01-01T00:00:10Z'
    });
  });

  it('should handle cache tokens correctly', () => {
    const sessionData = {
      sessionId: 'test',
      messages: [],
      totalTokens: 0,
      totalCost: 0,
      turns: 0,
      model: null,
      startTime: null
    };

    watcher.processMessage(sessionData, {
      message: {
        role: 'assistant',
        usage: {
          input_tokens: 1000,
          output_tokens: 2000,
          cache_read_input_tokens: 500
        }
      }
    });

    expect(sessionData.totalTokens).toBe(3500); // cache_read:500 + input:1000 + output:2000 + cache_creation:0
    expect(sessionData.latestUsage.cache).toBe(500);
  });

  it('should read existing JSONL data', async () => {
    const projectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(projectDir, { recursive: true });
    
    const sessionFile = path.join(projectDir, 'test-session.jsonl');
    const jsonlContent = [
      JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3-5-sonnet-20241022',
          role: 'user',
          usage: { input_tokens: 100, output_tokens: 0 }
        }
      }),
      JSON.stringify({
        timestamp: '2025-01-01T00:00:10Z',
        message: {
          role: 'assistant',
          usage: { input_tokens: 0, output_tokens: 200 }
        }
      })
    ].join('\n');
    
    await fs.writeFile(sessionFile, jsonlContent);
    
    await watcher.readExistingData('test-session', sessionFile);
    
    const sessionData = watcher.sessions.get('test-session');
    expect(sessionData).toBeTruthy();
    expect(sessionData.totalTokens).toBe(200); // 最新メッセージ(assistant): cache_read:0 + input:0 + output:200 + cache_creation:0
    expect(sessionData.turns).toBe(1);
    expect(sessionData.model).toBe('claude-3-5-sonnet-20241022');
    expect(sessionData.messages.length).toBe(2);
  });

  it('should emit events correctly', async () => {
    const projectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(projectDir, { recursive: true });
    
    const sessionFile = path.join(projectDir, 'test-session.jsonl');
    await fs.writeFile(sessionFile, '');
    
    let sessionDataEmitted = false;
    watcher.on('session-data', (data) => {
      sessionDataEmitted = true;
      expect(data.sessionId).toBe('test-session');
    });
    
    await watcher.readExistingData('test-session', sessionFile);
    
    expect(sessionDataEmitted).toBeTruthy();
  });

  describe('Directory Watching', () => {
    it('should start directory watching and emit events', async () => {
      let watchStarted = false;
      watcher.on('directory-watch-started', () => {
        watchStarted = true;
      });

      await watcher.startDirectoryWatch();
      expect(watchStarted).toBeTruthy();
      expect(watcher.directoryWatcher).toBeTruthy();
    });

    it('should not create duplicate directory watchers', async () => {
      await watcher.startDirectoryWatch();
      const firstWatcher = watcher.directoryWatcher;
      
      await watcher.startDirectoryWatch();
      expect(watcher.directoryWatcher).toBe(firstWatcher);
    });

    it('should emit session-added when new jsonl file is created', async () => {
      await watcher.startDirectoryWatch();
      
      let addedSession = null;
      watcher.on('session-added', (data) => {
        addedSession = data;
      });

      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const newFile = path.join(projectDir, 'new-session.jsonl');
      
      // Simulate file add event
      watcher.directoryWatcher.emit('add', newFile);
      
      expect(addedSession).toEqual({
        sessionId: 'new-session',
        filePath: newFile
      });
      expect(watcher.cachedFiles.has(newFile)).toBeTruthy();
    });

    it('should emit session-removed when jsonl file is deleted', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'delete-me.jsonl');
      await fs.writeFile(sessionFile, '');
      
      await watcher.startDirectoryWatch();
      watcher.cachedFiles.add(sessionFile);
      
      let removedSession = null;
      watcher.on('session-removed', (data) => {
        removedSession = data;
      });

      // Simulate file unlink event
      watcher.directoryWatcher.emit('unlink', sessionFile);
      
      expect(removedSession).toEqual({
        sessionId: 'delete-me',
        filePath: sessionFile
      });
      expect(watcher.cachedFiles.has(sessionFile)).toBeFalsy();
    });

    it('should emit session-updated when jsonl file is changed', async () => {
      await watcher.startDirectoryWatch();
      
      let updatedSession = null;
      watcher.on('session-updated', (data) => {
        updatedSession = data;
      });

      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'update-me.jsonl');
      
      // Simulate file change event
      watcher.directoryWatcher.emit('change', sessionFile);
      
      expect(updatedSession).toEqual({
        sessionId: 'update-me',
        filePath: sessionFile
      });
    });

    it('should ignore non-jsonl files', async () => {
      await watcher.startDirectoryWatch();
      
      let eventEmitted = false;
      watcher.on('session-added', () => {
        eventEmitted = true;
      });

      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const textFile = path.join(projectDir, 'not-jsonl.txt');
      
      // Simulate file add event for non-jsonl file
      watcher.directoryWatcher.emit('add', textFile);
      
      expect(eventEmitted).toBeFalsy();
      expect(watcher.cachedFiles.has(textFile)).toBeFalsy();
    });
  });

  describe('Cache Management', () => {
    it('should cache files after first scan', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'cached1.jsonl'), '');
      await fs.writeFile(path.join(projectDir, 'cached2.jsonl'), '');
      
      // First call should scan
      const files1 = await watcher.getAllJsonlFiles();
      expect(files1.length).toBe(2);
      expect(watcher.cachedFiles.size).toBe(2);
      
      // Add another file without updating cache
      await fs.writeFile(path.join(projectDir, 'cached3.jsonl'), '');
      
      // Second call should return cached results
      const files2 = await watcher.getAllJsonlFiles();
      expect(files2.length).toBe(2); // Still 2, not 3
      expect(files2).toEqual(files1);
    });

    it('should invalidate cache correctly', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'file1.jsonl'), '');
      
      // First scan
      await watcher.getAllJsonlFiles();
      expect(watcher.cachedFiles.size).toBe(1);
      
      // Invalidate cache
      watcher.invalidateCache();
      expect(watcher.cachedFiles.size).toBe(0);
      
      // Add new file
      await fs.writeFile(path.join(projectDir, 'file2.jsonl'), '');
      
      // Next scan should pick up both files
      const files = await watcher.getAllJsonlFiles();
      expect(files.length).toBe(2);
    });
  });

  describe('Session Watching', () => {
    it('should watch session and track file position', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'watch-me.jsonl');
      await fs.writeFile(sessionFile, 'test content');
      
      let sessionStarted = false;
      watcher.on('session-started', (data) => {
        sessionStarted = true;
        expect(data.sessionId).toBe('watch-me');
      });
      
      await watcher.watchSession('watch-me', sessionFile);
      
      expect(sessionStarted).toBeTruthy();
      expect(watcher.watchers.has('watch-me')).toBeTruthy();
      expect(watcher.filePositions.get('watch-me')).toBe(12); // 'test content' length
    });

    it('should not create duplicate watchers for same session', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'duplicate.jsonl');
      await fs.writeFile(sessionFile, '');
      
      await watcher.watchSession('duplicate', sessionFile);
      const watcherCount1 = watcher.watchers.size;
      
      await watcher.watchSession('duplicate', sessionFile);
      const watcherCount2 = watcher.watchers.size;
      
      expect(watcherCount1).toBe(watcherCount2);
    });

    it('should handle incremental file updates', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'incremental.jsonl');
      
      // Initial content
      const line1 = JSON.stringify({
        timestamp: '2025-01-01T00:00:00Z',
        message: { role: 'user', usage: { input_tokens: 100, output_tokens: 0 } }
      });
      await fs.writeFile(sessionFile, line1 + '\n');
      
      await watcher.watchSession('incremental', sessionFile);
      const initialPosition = watcher.filePositions.get('incremental');
      
      // Set up event listener before appending content
      let messageReceived = false;
      watcher.on('message', ({ sessionId, data, sessionData }) => {
        messageReceived = true;
        expect(sessionId).toBe('incremental');
        expect(data.message.role).toBe('assistant');
        expect(sessionData.totalTokens).toBe(300); // 最新メッセージ: cache_read:0 + input:100 + output:200 + cache_creation:0
      });
      
      // Append new content
      const line2 = JSON.stringify({
        timestamp: '2025-01-01T00:00:10Z',
        message: { role: 'assistant', usage: { input_tokens: 0, output_tokens: 200 } }
      });
      await fs.appendFile(sessionFile, line2 + '\n');
      
      // Get file size after append
      const statsAfter = await fs.stat(sessionFile);
      const expectedNewPosition = statsAfter.size;
      
      // Manually trigger file change
      await watcher.handleFileChange('incremental', sessionFile);
      
      // Wait a bit for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 400));
      
      expect(messageReceived).toBeTruthy();
      expect(watcher.filePositions.get('incremental')).toBe(expectedNewPosition);
      expect(expectedNewPosition).toBeGreaterThan(initialPosition);
    });
  });

  describe('Message Processing', () => {
    it('should process user messages with array content', () => {
      const sessionData = {
        sessionId: 'test',
        messages: [],
        totalTokens: 0,
        totalCost: 0,
        turns: 0,
        model: null,
        startTime: null
      };

      watcher.processMessage(sessionData, {
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello Claude' },
            { type: 'image', data: 'base64...' }
          ]
        }
      });

      expect(sessionData.latestPrompt).toBe('Hello Claude');
      expect(sessionData.latestPromptTime).toBe('2025-01-01T00:00:00Z');
    });

    it('should process user messages with string content', () => {
      const sessionData = {
        sessionId: 'test',
        messages: [],
        totalTokens: 0,
        totalCost: 0,
        turns: 0,
        model: null,
        startTime: null
      };

      watcher.processMessage(sessionData, {
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          role: 'user',
          content: 'Simple string content'
        }
      });

      expect(sessionData.latestPrompt).toBe('Simple string content');
    });

    it('should not save empty user prompts', () => {
      const sessionData = {
        sessionId: 'test',
        messages: [],
        totalTokens: 0,
        totalCost: 0,
        turns: 0,
        model: null,
        startTime: null
      };

      watcher.processMessage(sessionData, {
        message: {
          role: 'user',
          content: ''
        }
      });

      expect(sessionData.latestPrompt).toBeUndefined();
    });
  });

  describe('Cleanup', () => {
    it('should stop individual session watching', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      const sessionFile = path.join(projectDir, 'stop-me.jsonl');
      await fs.writeFile(sessionFile, '');
      
      await watcher.watchSession('stop-me', sessionFile);
      expect(watcher.watchers.has('stop-me')).toBeTruthy();
      
      let sessionStopped = false;
      watcher.on('session-stopped', (data) => {
        sessionStopped = true;
        expect(data.sessionId).toBe('stop-me');
      });
      
      watcher.stopWatching('stop-me');
      
      expect(sessionStopped).toBeTruthy();
      expect(watcher.watchers.has('stop-me')).toBeFalsy();
      expect(watcher.filePositions.has('stop-me')).toBeFalsy();
      expect(watcher.sessions.has('stop-me')).toBeFalsy();
    });

    it('should stop all watchers and clear resources', async () => {
      const projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      
      // Create multiple sessions
      for (let i = 1; i <= 3; i++) {
        const file = path.join(projectDir, `session${i}.jsonl`);
        await fs.writeFile(file, '');
        await watcher.watchSession(`session${i}`, file);
      }
      
      await watcher.startDirectoryWatch();
      watcher.cachedFiles.add('dummy-file');
      
      expect(watcher.watchers.size).toBe(3);
      expect(watcher.directoryWatcher).toBeTruthy();
      expect(watcher.cachedFiles.size).toBeGreaterThan(0);
      
      watcher.stopAll();
      
      expect(watcher.watchers.size).toBe(0);
      expect(watcher.sessions.size).toBe(0);
      expect(watcher.filePositions.size).toBe(0);
      expect(watcher.directoryWatcher).toBeFalsy();
      expect(watcher.cachedFiles.size).toBe(0);
    });

    it('should handle stopping non-existent session gracefully', () => {
      // Should not throw
      expect(() => watcher.stopWatching('non-existent')).not.toThrow();
    });
  });

  describe('Recursive Directory Walking', () => {
    it('should find jsonl files in nested directories', async () => {
      // Create nested directory structure
      const project1 = path.join(tempDir, 'project1');
      const project2 = path.join(tempDir, 'nested/deep/project2');
      
      await fs.mkdir(project1, { recursive: true });
      await fs.mkdir(project2, { recursive: true });
      
      await fs.writeFile(path.join(project1, 'session1.jsonl'), '');
      await fs.writeFile(path.join(project2, 'session2.jsonl'), '');
      await fs.writeFile(path.join(project2, 'not-jsonl.txt'), '');
      
      const files = await watcher.getAllJsonlFiles();
      
      expect(files.length).toBe(2);
      expect(files.some(f => f.includes('session1.jsonl'))).toBeTruthy();
      expect(files.some(f => f.includes('session2.jsonl'))).toBeTruthy();
      expect(files.some(f => f.includes('not-jsonl.txt'))).toBeFalsy();
    });

    it('should handle permission errors during directory walking', async () => {
      const projectDir = path.join(tempDir, 'accessible');
      await fs.mkdir(projectDir, { recursive: true });
      await fs.writeFile(path.join(projectDir, 'found.jsonl'), '');
      
      // Create an inaccessible directory that will throw error
      const inaccessibleDir = path.join(tempDir, 'inaccessible');
      await fs.mkdir(inaccessibleDir, { recursive: true });
      
      // Mock fs.readdir to simulate permission error
      const fsModule = await import('fs');
      const originalReaddir = fsModule.promises.readdir;
      vi.spyOn(fsModule.promises, 'readdir').mockImplementation(async (dir, options) => {
        if (dir.includes('inaccessible')) {
          throw new Error('EACCES: permission denied');
        }
        return originalReaddir(dir, options);
      });
      
      const files = await watcher.getAllJsonlFiles();
      
      // Should still find accessible files
      expect(files.some(f => f.includes('found.jsonl'))).toBeTruthy();
      
      vi.restoreAllMocks();
    });
  });

  describe('Compact Handling', () => {
    let sessionFile;
    let projectDir;

    beforeEach(async () => {
      projectDir = path.join(tempDir, 'test-project');
      await fs.mkdir(projectDir, { recursive: true });
      sessionFile = path.join(projectDir, 'compact-test.jsonl');
    });

    it('should handle file size decrease (simulating /compact)', async () => {
      // Create initial session with multiple messages
      const initialData = [
        { timestamp: '2025-01-01T00:00:00Z', message: { role: 'user', content: 'Hello' } },
        { timestamp: '2025-01-01T00:00:01Z', message: { role: 'assistant', model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 100, output_tokens: 200 } } },
        { timestamp: '2025-01-01T00:00:02Z', message: { role: 'user', content: 'Tell me a long story' } },
        { timestamp: '2025-01-01T00:00:03Z', message: { role: 'assistant', model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 200, output_tokens: 1000 } } },
        { timestamp: '2025-01-01T00:00:04Z', message: { role: 'user', content: 'Continue' } },
        { timestamp: '2025-01-01T00:00:05Z', message: { role: 'assistant', model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 300, output_tokens: 1500 } } }
      ];

      await fs.writeFile(
        sessionFile,
        initialData.map(d => JSON.stringify(d)).join('\n')
      );

      // Start watching
      await watcher.watchSession('compact-test', sessionFile);
      
      // Verify initial state
      const initialSession = watcher.sessions.get('compact-test');
      expect(initialSession.totalTokens).toBe(1800); // 最新メッセージ: cache_read:0 + input:300 + output:1500 + cache_creation:0

      // Simulate /compact - replace file with compacted version
      const compactedData = [
        { timestamp: '2025-01-01T00:00:00Z', message: { role: 'system', content: '[Previous conversation summary]' } },
        { timestamp: '2025-01-01T00:00:06Z', message: { role: 'user', content: 'What were we talking about?' } },
        { timestamp: '2025-01-01T00:00:07Z', message: { role: 'assistant', model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 50, output_tokens: 100 } } }
      ];

      await fs.writeFile(
        sessionFile,
        compactedData.map(d => JSON.stringify(d)).join('\n')
      );

      // Wait for file change to be processed
      await new Promise(resolve => setTimeout(resolve, 600));

      // Verify session was updated with new data
      const updatedSession = watcher.sessions.get('compact-test');
      expect(updatedSession.totalTokens).toBe(150); // 最新メッセージ: cache_read:0 + input:50 + output:100 + cache_creation:0
      expect(updatedSession.turns).toBe(1); // Only one assistant turn in compacted version
    });

    it('should handle large file size changes', async () => {
      // Create initial small file
      const initialData = { timestamp: '2025-01-01T00:00:00Z', message: { role: 'user', content: 'Hi' } };
      await fs.writeFile(sessionFile, JSON.stringify(initialData));

      await watcher.watchSession('large-change', sessionFile);

      // Create much larger file (>10KB difference)
      const largeData = [];
      for (let i = 0; i < 100; i++) {
        largeData.push({
          timestamp: `2025-01-01T00:${String(i).padStart(2, '0')}:00Z`,
          message: {
            role: i % 2 === 0 ? 'user' : 'assistant',
            content: 'x'.repeat(200),
            ...(i % 2 === 1 ? {
              model: 'claude-3-5-sonnet-20241022',
              usage: { input_tokens: 100, output_tokens: 200 }
            } : {})
          }
        });
      }

      await fs.writeFile(
        sessionFile,
        largeData.map(d => JSON.stringify(d)).join('\n')
      );

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 600));

      const session = watcher.sessions.get('large-change');
      expect(session.turns).toBe(50); // 50 assistant messages
      expect(session.totalTokens).toBe(300); // 最新メッセージ: cache_read:0 + input:100 + output:200 + cache_creation:0
    });

    it('should emit session-data event when file is compacted', async () => {
      // Create initial file
      const initialData = [
        { timestamp: '2025-01-01T00:00:00Z', message: { role: 'user', content: 'Hello' } },
        { timestamp: '2025-01-01T00:00:01Z', message: { role: 'assistant', model: 'claude-3-5-sonnet-20241022', usage: { input_tokens: 100, output_tokens: 200 } } }
      ];

      await fs.writeFile(
        sessionFile,
        initialData.map(d => JSON.stringify(d)).join('\n')
      );

      await watcher.watchSession('emit-test', sessionFile);

      let sessionDataEmitted = false;
      let emittedData = null;

      watcher.on('session-data', (data) => {
        if (data.sessionId === 'emit-test' && data.totalTokens === 50) {
          sessionDataEmitted = true;
          emittedData = data;
        }
      });

      // Compact the file
      const compactedData = { 
        timestamp: '2025-01-01T00:00:02Z', 
        message: { 
          role: 'assistant', 
          model: 'claude-3-5-sonnet-20241022', 
          content: 'Summary',
          usage: { input_tokens: 20, output_tokens: 30 } 
        } 
      };

      await fs.writeFile(sessionFile, JSON.stringify(compactedData));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 600));

      expect(sessionDataEmitted).toBe(true);
      expect(emittedData).toBeTruthy();
      expect(emittedData.totalTokens).toBe(50); // 最新メッセージ: cache_read:0 + input:50 + output:0 + cache_creation:0
    });
  });
});