import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * テスト用のユーティリティ関数とモックオブジェクト
 */

// ANSIエスケープコードを除去
export function stripAnsi(str) {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

// Create temporary directory with automatic cleanup
export async function withTempDir(callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cccontext-test-'));
  try {
    return await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

// Mock file system operations
export class MockFileSystem {
  constructor() {
    this.files = new Map();
    this.directories = new Set();
  }

  async writeFile(filePath, content) {
    const dir = path.dirname(filePath);
    this.directories.add(dir);
    this.files.set(filePath, {
      content,
      mtime: new Date(),
      size: Buffer.byteLength(content)
    });
  }

  async readFile(filePath) {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    }
    return file.content;
  }

  async stat(filePath) {
    const file = this.files.get(filePath);
    if (!file) {
      throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
    }
    return {
      mtime: file.mtime,
      size: file.size,
      isFile: () => true,
      isDirectory: () => false
    };
  }

  async readdir(dirPath) {
    const files = [];
    for (const [filePath] of this.files) {
      if (path.dirname(filePath) === dirPath) {
        files.push(path.basename(filePath));
      }
    }
    return files;
  }

  async mkdir(dirPath, options = {}) {
    this.directories.add(dirPath);
    if (options.recursive) {
      let currentPath = dirPath;
      while (currentPath !== path.dirname(currentPath)) {
        this.directories.add(currentPath);
        currentPath = path.dirname(currentPath);
      }
    }
  }

  async unlink(filePath) {
    if (!this.files.has(filePath)) {
      throw new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
    }
    this.files.delete(filePath);
  }

  clear() {
    this.files.clear();
    this.directories.clear();
  }
}

// タイマーモック
export class MockTimer {
  constructor() {
    this.timers = [];
    this.currentTime = Date.now();
  }

  setTimeout(callback, delay) {
    const id = Math.random();
    this.timers.push({
      id,
      callback,
      triggerTime: this.currentTime + delay,
      type: 'timeout'
    });
    return id;
  }

  setInterval(callback, interval) {
    const id = Math.random();
    this.timers.push({
      id,
      callback,
      triggerTime: this.currentTime + interval,
      interval,
      type: 'interval'
    });
    return id;
  }

  clearTimeout(id) {
    this.timers = this.timers.filter(timer => timer.id !== id);
  }

  clearInterval(id) {
    this.clearTimeout(id);
  }

  tick(ms) {
    this.currentTime += ms;
    const triggeredTimers = this.timers.filter(timer => timer.triggerTime <= this.currentTime);
    
    for (const timer of triggeredTimers) {
      timer.callback();
      
      if (timer.type === 'interval') {
        timer.triggerTime += timer.interval;
      } else {
        this.timers = this.timers.filter(t => t.id !== timer.id);
      }
    }
  }

  clear() {
    this.timers = [];
  }
}

// Session data factory
export function createMockSessionData(overrides = {}) {
  return {
    sessionId: 'test-session-' + Math.random().toString(36).substr(2, 9),
    model: 'claude-3-5-sonnet-20241022',
    messages: [],
    totalTokens: 0,
    totalCost: 0,
    turns: 0,
    startTime: new Date(),
    ...overrides
  };
}

// メッセージデータのファクトリー
export function createMockMessage(role, tokens = {}, overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    message: {
      role,
      model: 'claude-3-5-sonnet-20241022',
      usage: {
        input_tokens: tokens.input || 0,
        output_tokens: tokens.output || 0,
        cache_read_input_tokens: tokens.cache || 0
      },
      ...overrides
    }
  };
}

// コンテキスト情報のファクトリー
export function createMockContextInfo(overrides = {}) {
  return {
    sessionId: 'test-session',
    modelName: 'Claude 3.5 Sonnet',
    usagePercentage: 50,
    totalTokens: 100000,
    contextWindow: 200000,
    remainingTokens: 100000,
    remainingPercentage: 50,
    totalCost: 1.50,
    turns: 10,
    averageTokensPerTurn: 10000,
    estimatedRemainingTurns: 10,
    warningLevel: 'normal',
    duration: '1h 30m',
    latestTurn: {
      input: 1000,
      output: 2000,
      cache: 500,
      total: 3000,
      percentage: 1.5
    },
    latestPrompt: 'Test prompt',
    ...overrides
  };
}

// イベントエミッターのモック
export class MockEventEmitter {
  constructor() {
    this.events = new Map();
    this.emitHistory = [];
  }

  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(handler);
  }

  emit(event, ...args) {
    this.emitHistory.push({ event, args });
    const handlers = this.events.get(event) || [];
    for (const handler of handlers) {
      handler(...args);
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }

  getEmitHistory(event) {
    return this.emitHistory.filter(h => h.event === event);
  }

  clear() {
    this.events.clear();
    this.emitHistory = [];
  }
}

// プロセスのモック
export function mockProcess() {
  const originalExit = process.exit;
  const originalOn = process.on;
  
  const exitCalls = [];
  const eventHandlers = new Map();
  
  process.exit = (code) => {
    exitCalls.push(code);
  };
  
  process.on = (event, handler) => {
    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event).push(handler);
  };
  
  return {
    restore() {
      process.exit = originalExit;
      process.on = originalOn;
    },
    getExitCalls() {
      return exitCalls;
    },
    triggerEvent(event, ...args) {
      const handlers = eventHandlers.get(event) || [];
      for (const handler of handlers) {
        handler(...args);
      }
    }
  };
}