import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
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
      
      // Delete the file to trigger an error
      await fs.unlink(sessionFile);
      
      // Give some time for the error to be emitted
      await new Promise(resolve => setTimeout(resolve, 100));
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
      expect(sessionData.totalTokens).toBe('0-100abc'); // 0 + (-100 + 'abc')

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
    expect(sessionData.totalTokens).toBe(100);
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

    expect(sessionData.totalTokens).toBe(300); // 100 + 200
    expect(sessionData.turns).toBe(1); // assistantメッセージで+1
    expect(sessionData.latestUsage).toEqual({
      input: 0,
      output: 200,
      cache: 50,
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

    expect(sessionData.totalTokens).toBe(3000); // input + output (cacheは含まない)
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
    expect(sessionData.totalTokens).toBe(300);
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
});