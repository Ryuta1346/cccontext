#!/usr/bin/env node

import { program } from 'commander';
import { SessionWatcher } from './monitor/session-watcher.mjs';
import { ContextTracker } from './monitor/context-tracker.mjs';
import { LiveView } from './display/live-view.mjs';
import { SessionsLiveView } from './display/sessions-live-view.mjs';
import { UsageCalculator } from './monitor/usage-calculator.mjs';
import { EnhancedSessionsManager } from './monitor/enhanced-sessions-manager.mjs';
import chalk from 'chalk';
import stringWidth from 'string-width';
import fs from 'fs';
import path from 'path';
import os from 'os';

class CCContextCLI {
  constructor() {
    this.watcher = new SessionWatcher();
    this.tracker = new ContextTracker();
    this.sessionsManager = new EnhancedSessionsManager();
    this.view = null;
    this.sessionsView = null;
    this.calculator = new UsageCalculator();
    this.watchedSessions = new Map();
  }

  async monitorLive(options) {
    console.log(chalk.cyan('🔍 Starting Claude Code Context Monitor...'));
    
    // ライブビューの初期化
    this.view = new LiveView();
    this.view.init();

    try {
      // アクティブセッションを検索
      const activeSession = await this.watcher.findActiveSession();
      
      if (!activeSession) {
        this.view.showError('No active Claude Code sessions found.');
        setTimeout(() => process.exit(1), 3000);
        return;
      }

      console.log(chalk.green(`✓ Found active session: ${activeSession.sessionId}`));
      this.view.showMessage(`Monitoring session: ${activeSession.sessionId.substring(0, 8)}...`);

      // イベントハンドラーの設定
      this.watcher.on('session-data', (sessionData) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        this.view.updateContextInfo(contextInfo);
      });

      this.watcher.on('message', ({ sessionData }) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        this.view.updateContextInfo(contextInfo);
      });

      this.watcher.on('error', ({ sessionId, error }) => {
        this.view.showError(`Error in session ${sessionId}: ${error.message}`);
      });

      // セッション監視開始
      await this.watcher.watchSession(activeSession.sessionId, activeSession.filePath);

      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessions(options) {
    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions = [];

      // 各セッションファイルの情報を収集
      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // monitor --liveと同じ方法でセッションデータを読み込む
        const tempWatcher = new SessionWatcher();
        
        let sessionData = null;
        tempWatcher.once('session-data', (data) => {
          sessionData = data;
        });
        
        await tempWatcher.readExistingData(sessionId, file, false);
        
        if (sessionData) {
          const contextInfo = this.tracker.updateSession(sessionData);
          
          sessions.push({
            sessionId,
            file,
            lastModified: stats.mtime,
            size: stats.size,
            model: sessionData.model,
            turns: sessionData.turns,
            totalTokens: sessionData.totalTokens,
            latestPrompt: this.formatPromptForList(sessionData.latestPrompt)
          });
        }
      }

      // 最終更新時刻でソート
      sessions.sort((a, b) => b.lastModified - a.lastModified);

      // 表示数を制限
      const limit = options.limit || 10;
      const displaySessions = sessions.slice(0, limit);

      console.log(chalk.cyan('\nActive Sessions (Last 24h)'));
      console.log(chalk.gray('━'.repeat(80)));

      displaySessions.forEach((session, index) => {
        const age = this.formatAge(session.lastModified);
        const contextWindow = this.tracker.getContextWindow(session.model);
        const usage = (session.totalTokens / contextWindow) * 100;
        const modelName = this.calculator.getModelName(session.model);
        
        console.log(
          `${chalk.yellow((index + 1).toString().padStart(2))}. ` +
          `${chalk.white(session.sessionId.substring(0, 8))} ` +
          `[${this.createMiniProgressBar(usage)}] ` +
          `${chalk.cyan(usage.toFixed(1) + '%')} ` +
          `${chalk.gray('|')} ${chalk.blue(modelName)} ` +
          `${chalk.gray('|')} ${chalk.green(session.turns + ' turns')} ` +
          `${chalk.gray('|')} ${chalk.magenta(age)}`
        );
        
        // プロンプトの表示（インデント付き）
        if (session.latestPrompt) {
          console.log(`    ${chalk.gray('└→')} ${chalk.dim(session.latestPrompt)}`);
        }
      });

      console.log(chalk.gray('━'.repeat(80)));
      console.log(chalk.gray(`Total sessions: ${sessions.length}`));

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  }

  createMiniProgressBar(percentage) {
    const width = 10;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    const color = percentage >= 80 ? 'red' : percentage >= 60 ? 'yellow' : 'green';
    return chalk[color]('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  formatAge(date) {
    const now = Date.now();
    const age = now - date.getTime();
    const minutes = Math.floor(age / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  }

  formatPromptForList(prompt) {
    if (!prompt) return '';
    
    const maxLength = 60;
    const cleanPrompt = prompt.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    
    // string-widthを使用して正確な表示幅を計算
    let result = '';
    let currentWidth = 0;
    
    // UTF-16サロゲートペアを適切に処理するためにArray.fromを使用
    const chars = Array.from(cleanPrompt);
    
    for (const char of chars) {
      const charWidth = stringWidth(char);
      
      if (currentWidth + charWidth > maxLength - 3) { // '...'の分を考慮
        result += '...';
        break;
      }
      
      result += char;
      currentWidth += charWidth;
    }
    
    return result;
  }

  async showSessionsLive(options) {
    console.log(chalk.cyan('🔍 Starting Claude Code Sessions Monitor...'));
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      // 全セッションファイルを取得
      const files = await this.watcher.getAllJsonlFiles();
      const limit = parseInt(options.limit || 20);
      
      // 最新のファイルから順に処理
      const sortedFiles = await this.getSortedFilesByMtime(files);
      const filesToWatch = sortedFiles.slice(0, limit);
      
      // 初期セッションリスト
      const sessions = [];
      
      // 各セッションに対してwatchSessionを開始
      for (const file of filesToWatch) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // 個別のSessionWatcherインスタンスを作成
        const sessionWatcher = new SessionWatcher();
        
        // イベントハンドラー設定
        sessionWatcher.on('session-data', (sessionData) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, stats.mtime);
        });
        
        sessionWatcher.on('message', ({ sessionData }) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
        });
        
        sessionWatcher.on('error', ({ error }) => {
          if (options.debug) {
            console.error(`[DEBUG] Error in session ${sessionId}: ${error.message}`);
          }
        });
        
        // watchSessionを開始
        await sessionWatcher.watchSession(sessionId, file);
        this.watchedSessions.set(sessionId, sessionWatcher);
        
        // 初期データを取得してセッションリストに追加
        const sessionData = sessionWatcher.sessions.get(sessionId);
        if (sessionData) {
          const contextInfo = this.tracker.updateSession(sessionData);
          sessions.push({
            sessionId,
            lastModified: stats.mtime,
            model: sessionData.model,
            modelName: contextInfo.modelName,
            turns: sessionData.turns,
            totalTokens: sessionData.totalTokens,
            totalCost: contextInfo.totalCost,
            usagePercentage: contextInfo.usagePercentage,
            latestPrompt: sessionData.latestPrompt
          });
        }
      }
      
      // 初期表示
      this.sessionsView.updateSessions(sessions);
      
      // ディレクトリ監視（新規セッション追加/削除用）
      await this.watcher.startDirectoryWatch();
      
      this.watcher.on('session-added', async ({ sessionId, filePath }) => {
        await this.addSessionWatch(sessionId, filePath, options);
      });
      
      this.watcher.on('session-removed', ({ sessionId }) => {
        this.removeSessionWatch(sessionId);
      });
      
      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessionsLiveEnhanced(options) {
    console.log(chalk.cyan('🔍 Starting Enhanced Claude Code Sessions Monitor...'));
    
    // デバッグモードの設定
    const debugMode = process.env.DEBUG === '1' || options.debug;
    this.sessionsManager.setDebugMode(debugMode);
    
    if (debugMode) {
      console.log(chalk.yellow('🐛 Debug mode enabled'));
    }
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();
    
    try {
      // イベントリスナーを先に設定
      // セッション読み込み完了イベント
      this.sessionsManager.on('sessions-loaded', (sessions) => {
        if (debugMode) {
          console.error(`[CLI] Sessions loaded event received: ${sessions.length} sessions`);
        }
        
        const limit = parseInt(options.limit || 20);
        const displaySessions = sessions.slice(0, limit);
        
        if (debugMode) {
          console.error(`[CLI] Updating view with ${displaySessions.length} sessions`);
          if (displaySessions.length > 0) {
            console.error(`[CLI] First session sample:`, JSON.stringify(displaySessions[0], null, 2));
          }
        }
        
        this.sessionsView.updateSessions(displaySessions);
        this.sessionsView.render();
      });
      
      // セッション更新イベント（リアルタイム）
      this.sessionsManager.on('sessions-updated', (sessions) => {
        const limit = parseInt(options.limit || 20);
        const displaySessions = sessions.slice(0, limit);
        this.sessionsView.updateSessions(displaySessions);
        
        if (debugMode) {
          const stats = this.sessionsManager.getCacheStats();
          console.error(`[CLI] Update: ${sessions.length} sessions, cache: ${stats.cachedSessions}`);
        }
      });
      
      // 拡張セッションマネージャーを初期化（イベントリスナー設定後）
      await this.sessionsManager.initialize();
      
      // プロセス終了時のクリーンアップ
      const cleanup = () => {
        console.log(chalk.cyan('\n🔄 Shutting down sessions monitor...'));
        this.cleanup();
      };
      
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      
      // ステータスバーを更新してイベント駆動を表示
      this.updateStatusBarForEventDriven();
      
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  updateStatusBarForEventDriven() {
    if (this.sessionsView && this.sessionsView.boxes && this.sessionsView.boxes.statusBar) {
      this.sessionsView.boxes.statusBar.setContent(
        '[Live] Event-driven updates (↑↓: navigate, q: exit, r: refresh)'
      );
    }
  }

  async getSortedFilesByMtime(files) {
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const stats = await fs.promises.stat(file);
        return { file, mtime: stats.mtime };
      })
    );
    
    filesWithStats.sort((a, b) => b.mtime - a.mtime);
    return filesWithStats.map(f => f.file);
  }

  updateSessionInView(sessionId, sessionData, contextInfo, lastModified) {
    // 現在の表示セッションリストを取得
    const currentSessions = this.sessionsView.sessions || [];
    
    // 該当セッションを更新
    const updatedSessions = currentSessions.map(session => {
      if (session.sessionId === sessionId) {
        return {
          ...session,
          model: sessionData.model,
          modelName: contextInfo.modelName,
          turns: sessionData.turns,
          totalTokens: sessionData.totalTokens,
          totalCost: contextInfo.totalCost,
          usagePercentage: contextInfo.usagePercentage,
          latestPrompt: sessionData.latestPrompt,
          lastModified: lastModified
        };
      }
      return session;
    });
    
    // セッションが存在しない場合は追加
    if (!updatedSessions.find(s => s.sessionId === sessionId)) {
      updatedSessions.push({
        sessionId,
        model: sessionData.model,
        modelName: contextInfo.modelName,
        turns: sessionData.turns,
        totalTokens: sessionData.totalTokens,
        totalCost: contextInfo.totalCost,
        usagePercentage: contextInfo.usagePercentage,
        latestPrompt: sessionData.latestPrompt,
        lastModified: lastModified
      });
    }
    
    // ソートして表示更新
    updatedSessions.sort((a, b) => b.lastModified - a.lastModified);
    this.sessionsView.updateSessions(updatedSessions);
  }

  async addSessionWatch(sessionId, filePath, options) {
    if (this.watchedSessions.has(sessionId)) return;
    
    const sessionWatcher = new SessionWatcher();
    
    sessionWatcher.on('session-data', (sessionData) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });
    
    sessionWatcher.on('message', ({ sessionData }) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });
    
    sessionWatcher.on('error', ({ error }) => {
      if (options.debug) {
        console.error(`[DEBUG] Error in session ${sessionId}: ${error.message}`);
      }
    });
    
    await sessionWatcher.watchSession(sessionId, filePath);
    this.watchedSessions.set(sessionId, sessionWatcher);
  }

  removeSessionWatch(sessionId) {
    const watcher = this.watchedSessions.get(sessionId);
    if (watcher) {
      watcher.stopWatching(sessionId);
      this.watchedSessions.delete(sessionId);
      
      // ビューからも削除
      const currentSessions = this.sessionsView.sessions || [];
      const updatedSessions = currentSessions.filter(s => s.sessionId !== sessionId);
      this.sessionsView.updateSessions(updatedSessions);
    }
  }

  cleanup() {
    // 全ての個別セッション監視を停止
    for (const [sessionId, watcher] of this.watchedSessions) {
      watcher.stopWatching(sessionId);
    }
    this.watchedSessions.clear();
    
    if (this.view) {
      this.view.destroy();
    }
    if (this.sessionsView) {
      this.sessionsView.destroy();
    }
    if (this.sessionsManager) {
      this.sessionsManager.destroy();
    }
    this.watcher.stopAll();
    process.exit(0);
  }
}

// CLIコマンドの設定
const cli = new CCContextCLI();

program
  .name('cccontext')
  .description('Real-time context usage monitor for Claude Code')
  .version('0.1.0')
  .exitOverride()
  .configureOutput({
    writeOut: (str) => { process.stdout.write(str); },
    writeErr: (str) => { process.stderr.write(str); }
  })
  .allowUnknownOption(false);

program
  .command('monitor')
  .description('Monitor Claude Code context usage')
  .option('-l, --live', 'Live monitoring mode (default)', true)
  .option('-s, --session <id>', 'Monitor specific session')
  .action((options) => {
    cli.monitorLive(options);
  });

program
  .command('sessions')
  .description('List recent Claude Code sessions')
  .option('-l, --limit <number>', 'Number of sessions to show', '10')
  .option('--live', 'Live monitoring mode')
  .option('--debug', 'Enable debug mode for detailed logging')
  .action((options) => {
    if (options.live) {
      // 一時的に元の実装を使用
      cli.showSessionsLive(options);
    } else {
      cli.showSessions(options);
    }
  });

// 未知のコマンドのハンドリング
program.on('command:*', function (operands) {
  console.error(`error: unknown command '${operands[0]}'`);
  process.exit(1);
});

// デフォルトコマンド（引数なしで実行された場合）
if (process.argv.length <= 2) {
  // コマンドが指定されていない場合のみデフォルトアクションを設定
  program.action(() => {
    cli.monitorLive({ live: true });
  });
}

try {
  program.parse(process.argv);
} catch (err) {
  // CommanderのexitOverrideでhelp/version時に例外が発生
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(0);
  } else if (err.code && err.code.startsWith('commander.')) {
    process.exit(1);
  } else {
    throw err;
  }
}