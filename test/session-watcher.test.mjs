import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SessionWatcher } from '../src/monitor/session-watcher.mjs';

describe('SessionWatcher', () => {
  let tempDir;
  let watcher;

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
    
    assert.equal(files.length, 2);
    assert.ok(files.some(f => f.endsWith('session1.jsonl')));
    assert.ok(files.some(f => f.endsWith('session2.jsonl')));
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
    
    assert.ok(activeSession);
    assert.equal(activeSession.sessionId, 'new-session');
    assert.ok(activeSession.filePath.endsWith('new-session.jsonl'));
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

    assert.equal(sessionData.model, 'claude-3-5-sonnet-20241022');
    assert.equal(sessionData.totalTokens, 100);
    assert.equal(sessionData.turns, 0); // userメッセージはターンとしてカウントしない
    assert.ok(sessionData.startTime);

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

    assert.equal(sessionData.totalTokens, 300); // 100 + 200
    assert.equal(sessionData.turns, 1); // assistantメッセージで+1
    assert.deepEqual(sessionData.latestUsage, {
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

    assert.equal(sessionData.totalTokens, 3000); // input + output (cacheは含まない)
    assert.equal(sessionData.latestUsage.cache, 500);
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
    assert.ok(sessionData);
    assert.equal(sessionData.totalTokens, 300);
    assert.equal(sessionData.turns, 1);
    assert.equal(sessionData.model, 'claude-3-5-sonnet-20241022');
    assert.equal(sessionData.messages.length, 2);
  });

  it('should emit events correctly', async (t) => {
    const projectDir = path.join(tempDir, 'test-project');
    await fs.mkdir(projectDir, { recursive: true });
    
    const sessionFile = path.join(projectDir, 'test-session.jsonl');
    await fs.writeFile(sessionFile, '');
    
    let sessionDataEmitted = false;
    watcher.on('session-data', (data) => {
      sessionDataEmitted = true;
      assert.equal(data.sessionId, 'test-session');
    });
    
    await watcher.readExistingData('test-session', sessionFile);
    
    assert.ok(sessionDataEmitted);
  });
});