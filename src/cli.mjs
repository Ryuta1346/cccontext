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
      let sessionToMonitor;
      
      // セッションの選択処理
      if (options.session) {
        // 指定されたセッションIDまたは順番号を解決
        const resolvedSessionId = await this.resolveSessionIdentifier(options.session);
        
        // セッションファイルを検索
        const files = await this.watcher.getAllJsonlFiles();
        const sessionFile = files.find(f => path.basename(f, '.jsonl') === resolvedSessionId);
        
        if (!sessionFile) {
          this.view.showError(`Session not found: ${options.session}`);
          setTimeout(() => process.exit(1), 3000);
          return;
        }
        
        sessionToMonitor = {
          sessionId: resolvedSessionId,
          filePath: sessionFile
        };
      } else {
        // アクティブセッションを検索
        sessionToMonitor = await this.watcher.findActiveSession();
        
        if (!sessionToMonitor) {
          this.view.showError('No active Claude Code sessions found.');
          setTimeout(() => process.exit(1), 3000);
          return;
        }
      }

      console.log(chalk.green(`✓ Found session: ${sessionToMonitor.sessionId}`));
      this.view.showMessage(`Monitoring session: ${sessionToMonitor.sessionId.substring(0, 8)}...`);

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
      await this.watcher.watchSession(sessionToMonitor.sessionId, sessionToMonitor.filePath);

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
    console.log(chalk.cyan('🔍 Loading Claude Code Sessions...'));
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

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
            modelName: contextInfo.modelName,
            turns: sessionData.turns,
            totalTokens: sessionData.totalTokens,
            totalCost: contextInfo.totalCost,
            usagePercentage: contextInfo.usagePercentage,
            latestPrompt: sessionData.latestPrompt,
            autoCompact: contextInfo.autoCompact
          });
        }
      }

      // 最終更新時刻でソート
      sessions.sort((a, b) => b.lastModified - a.lastModified);

      // 表示数を制限
      const limit = options.limit || 10;
      const displaySessions = sessions.slice(0, limit);

      // SessionsLiveViewで表示
      this.sessionsView.updateSessions(displaySessions);
      
      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => {
        this.sessionsView.destroy();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        this.sessionsView.destroy();
        process.exit(0);
      });

      // キーイベントの待機
      await new Promise(() => {
        // プロミスは解決されない（ユーザーがqまたはCtrl+Cで終了するまで待機）
      });

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (this.sessionsView) {
        this.sessionsView.destroy();
      }
      process.exit(1);
    }
  }

  createMiniProgressBar(percentage) {
    const width = 10;
    const safePercentage = Math.max(0, Math.min(100, percentage || 0));
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);
    
    const color = safePercentage >= 80 ? 'red' : safePercentage >= 60 ? 'yellow' : 'green';
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

  formatUsage(percentage) {
    // percentageがundefinedまたはnullの場合のデフォルト値
    const safePercentage = Math.max(0, Math.min(100, percentage ?? 0));
    
    const bar = this.createMiniProgressBar(safePercentage);
    const percentStr = safePercentage.toFixed(1) + '%';
    return `[${bar}] ${chalk.cyan(percentStr.padStart(5))}`;
  }

  formatAutoCompact(autoCompact) {
    if (!autoCompact?.enabled) {
      return chalk.gray('N/A');
    }

    const { remainingPercentage, thresholdPercentage, warningLevel } = autoCompact;
    
    if (remainingPercentage <= 0) {
      return chalk.red('ACTIVE!');
    }
    
    // 残り容量を % で表示
    const percentStr = remainingPercentage.toFixed(1) + '%';
    
    // 警告レベルに応じた表示
    switch (warningLevel) {
      case 'critical':
        return chalk.red(`!${percentStr}`);
      case 'warning':
        return chalk.yellow(`⚠ ${percentStr}`);
      case 'notice':
        return chalk.cyan(percentStr);
      default:
        return chalk.gray(percentStr);
    }
  }

  formatCost(cost) {
    const safeCost = cost ?? 0;
    return `$${safeCost.toFixed(2)}`;
  }

  async resolveSessionIdentifier(identifier) {
    // 数値のみ受け付ける
    if (!/^\d+$/.test(identifier)) {
      throw new Error(`Invalid session number: ${identifier}. Please specify a number from the list.`);
    }
    
    const position = parseInt(identifier);
    const files = await this.watcher.getAllJsonlFiles();
    
    // ファイルを最終更新時刻でソート
    const sortedFiles = await this.getSortedFilesByMtime(files);
    
    if (position > 0 && position <= sortedFiles.length) {
      const selectedFile = sortedFiles[position - 1];
      return path.basename(selectedFile, '.jsonl');
    } else {
      throw new Error(`Invalid session number: ${position}. Valid range is 1-${sortedFiles.length}`);
    }
  }

  async listSessionsForSelection(options = {}) {
    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions = [];
      const limit = parseInt(options.limit || 20);

      // 各セッションファイルの情報を収集
      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // セッションデータを読み込む
        const tempWatcher = new SessionWatcher();
        
        let sessionData = null;
        tempWatcher.once('session-data', (data) => {
          sessionData = data;
        });
        
        await tempWatcher.readExistingData(sessionId, file, false);
        
        if (sessionData) {
          sessions.push({
            sessionId,
            file,
            lastModified: stats.mtime,
            model: sessionData.model,
            turns: sessionData.turns,
            totalTokens: sessionData.totalTokens,
            latestPrompt: sessionData.latestPrompt
          });
        }
      }

      // 最終更新時刻でソート（降順）
      sessions.sort((a, b) => b.lastModified - a.lastModified);

      if (sessions.length === 0) {
        console.log(chalk.yellow('No sessions found.'));
        process.exit(0);
      }

      console.log(chalk.cyan('\nActive Sessions'));
      console.log(chalk.gray('━'.repeat(100)));
      
      // ヘッダー行
      console.log(
        chalk.gray('No.') + '  ' +
        chalk.gray('Session ID') + '  ' +
        chalk.gray('Usage') + '           ' +
        chalk.gray('Model') + '            ' +
        chalk.gray('Turns') + '   ' +
        chalk.gray('Age') + '      ' +
        chalk.gray('Latest Prompt')
      );
      console.log(chalk.gray('━'.repeat(100)));

      // 表示数を制限
      const displaySessions = sessions.slice(0, limit);

      displaySessions.forEach((session, index) => {
        const age = this.formatAge(session.lastModified);
        const modelName = this.calculator.getModelName(session.model);
        const contextWindow = this.tracker.getContextWindow(session.model);
        const usage = (session.totalTokens / contextWindow) * 100;
        const formattedPrompt = session.latestPrompt ? this.formatPromptForList(session.latestPrompt) : '';
        
        // 番号（3文字）
        const num = chalk.yellow((index + 1).toString().padEnd(3));
        
        // セッションID（10文字）
        const sessionId = chalk.white(session.sessionId.substring(0, 8).padEnd(10));
        
        // 使用率とプログレスバー（15文字）
        const progressBar = this.createMiniProgressBar(usage);
        const usageStr = `[${progressBar}] ${chalk.cyan(usage.toFixed(1).padStart(5) + '%')}`;
        
        // モデル名（15文字）
        const model = chalk.blue(modelName.padEnd(15));
        
        // ターン数（7文字）
        const turns = chalk.green((session.turns + ' turns').padEnd(7));
        
        // 経過時間（8文字）
        const ageStr = chalk.magenta(age.padEnd(8));
        
        // 最新プロンプト
        const prompt = chalk.dim(formattedPrompt);
        
        console.log(`${num} ${sessionId} ${usageStr} ${model} ${turns} ${ageStr} ${prompt}`);
      });

      console.log(chalk.gray('━'.repeat(100)));
      if (sessions.length > limit) {
        console.log(chalk.gray(`Total sessions: ${sessions.length} (showing ${limit})`));
      } else {
        console.log(chalk.gray(`Total sessions: ${sessions.length}`));
      }
      console.log(chalk.gray('\nUsage: cccontext -s <number>'))

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  }

  async clearCache() {
    try {
      console.log(chalk.yellow('🗑️  Clearing session cache...'));
      
      // SessionsManagerからSessionCacheインスタンスを取得
      const { SessionsManager } = await import('./monitor/sessions-manager.mjs');
      const manager = new SessionsManager();
      
      if (manager.cache) {
        manager.cache.clearAll();
        console.log(chalk.green('✅ Session cache cleared successfully'));
      } else {
        console.log(chalk.yellow('⚠️  No session cache found'));
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`Error clearing cache: ${error.message}`));
      process.exit(1);
    }
  }

  async showSessionsLive(options) {
    console.log(chalk.cyan('🔍 Starting Claude Code Sessions Monitor...'));
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      // 全セッションファイルを取得
      const files = await this.watcher.getAllJsonlFiles();
      const limit = parseInt(options.limit);
      
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
            latestPrompt: sessionData.latestPrompt,
            autoCompact: contextInfo.autoCompact
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
          lastModified: lastModified,
          autoCompact: contextInfo.autoCompact
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
        lastModified: lastModified,
        autoCompact: contextInfo.autoCompact
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
  .version('1.0.0')
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
  .option('-s, --session <number>', 'Monitor specific session by number from list')
  .action((options) => {
    cli.monitorLive(options);
  });

program
  .command('sessions')
  .description('List recent Claude Code sessions')
  .option('--limit <number>', 'Number of sessions to show', '10')
  .option('--live', 'Live monitoring mode')
  .option('--debug', 'Enable debug mode for detailed logging')
  .option('--clear-cache', 'Clear session cache and exit')
  .action((options) => {
    if (options.clearCache) {
      cli.clearCache();
    } else if (options.live) {
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
program
  .option('--list', 'List all sessions for selection')
  .option('--session <number>', 'Monitor specific session by number from list')
  .action((options) => {
    // コマンドラインの引数をチェック
    const args = process.argv.slice(2);
    // 未知のコマンドが指定されている場合はエラー
    if (args.length > 0 && !args[0].startsWith('-') && 
        !['monitor', 'sessions'].includes(args[0])) {
      console.error(`error: unknown command '${args[0]}'`);
      process.exit(1);
    }
    
    if (options.list) {
      cli.listSessionsForSelection({ limit: options.listLimit || 20 });
    } else {
      cli.monitorLive({ live: true, session: options.session });
    }
  });

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
