#!/usr/bin/env node

import { program } from 'commander';
import { SessionWatcher } from './monitor/session-watcher.js';
import { ContextTracker } from './monitor/context-tracker.js';
import { LiveView } from './display/live-view.js';
import { SessionsLiveView } from './display/sessions-live-view.js';
import { UsageCalculator } from './monitor/usage-calculator.js';
import { EnhancedSessionsManager } from './monitor/enhanced-sessions-manager.js';
import type { SessionData } from './types/index.js';

// ContextInfo型を定義（monitor/context-tracker.tsから参照）
interface ContextInfo {
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
    enabled: boolean;
    willTrigger: boolean;
    threshold: number;
    thresholdPercentage?: number;
    remainingPercentage: number;
    remainingTokens?: number;
    warningLevel: string;
    willCompactSoon?: boolean;
    effectiveLimit?: number;
    systemOverhead?: number;
    autoCompactThreshold?: number;
  };
}
import chalk from 'chalk';
import stringWidth from 'string-width';
import fs from 'fs';
import path from 'path';

interface CLIOptions {
  live?: boolean;
  session?: string;
  limit?: string | number;
  debug?: boolean;
  clearCache?: boolean;
  list?: boolean;
  listLimit?: number;
}

interface SessionForList {
  sessionId: string;
  file: string;
  lastModified: Date;
  model: string;
  turns: number;
  totalTokens: number;
  latestPrompt?: string;
}

interface SessionWithContext {
  sessionId: string;
  file: string;
  lastModified: Date | number;
  size: number;
  model: string;
  modelName: string;
  turns: number;
  totalTokens: number;
  totalCost: number;
  usagePercentage: number;
  latestPrompt?: string;
  autoCompact: {
    willTrigger: boolean;
    threshold: number;
    remainingPercentage: number;
  };
}

interface ActiveSession {
  sessionId: string;
  filePath: string;
}


class CCContextCLI {
  private watcher: SessionWatcher;
  private tracker: ContextTracker;
  private sessionsManager: EnhancedSessionsManager;
  private view: LiveView | null;
  private sessionsView: SessionsLiveView | null;
  private calculator: UsageCalculator;
  private watchedSessions: Map<string, SessionWatcher>;

  constructor() {
    this.watcher = new SessionWatcher();
    this.tracker = new ContextTracker();
    this.sessionsManager = new EnhancedSessionsManager();
    this.view = null;
    this.sessionsView = null;
    this.calculator = new UsageCalculator();
    this.watchedSessions = new Map();
  }

  async monitorLive(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🔍 Starting Claude Code Context Monitor...'));
    
    // ライブビューの初期化
    this.view = new LiveView();
    this.view.init();

    try {
      let sessionToMonitor: ActiveSession | null;
      
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
      this.watcher.on('session-data', (sessionData: SessionData) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        if (this.view) {
          this.view.updateContextInfo(contextInfo);
        }
      });

      this.watcher.on('message', ({ sessionData }: { sessionData: SessionData }) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        if (this.view) {
          this.view.updateContextInfo(contextInfo);
        }
      });

      this.watcher.on('error', ({ sessionId, error }: { sessionId: string; error: Error }) => {
        if (this.view) {
          this.view.showError(`Error in session ${sessionId}: ${error.message}`);
        }
      });

      // セッション監視開始
      await this.watcher.watchSession(sessionToMonitor.sessionId, sessionToMonitor.filePath);

      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());

    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessions(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🔍 Loading Claude Code Sessions...'));
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions: SessionWithContext[] = [];

      // 各セッションファイルの情報を収集
      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // monitor --liveと同じ方法でセッションデータを読み込む
        const tempWatcher = new SessionWatcher();
        
        let sessionData: SessionData | null = null;
        tempWatcher.once('session-data', (data: SessionData) => {
          sessionData = data;
        });
        
        await tempWatcher.readExistingData(sessionId, file, false);
        
        if (sessionData) {
          const contextInfo = this.tracker.updateSession(sessionData);
          const safeSessionData = sessionData as SessionData; // TypeScript 非同期パターン対応
          
          sessions.push({
            sessionId,
            file,
            lastModified: stats.mtime,
            size: stats.size,
            model: safeSessionData.model || 'unknown',
            modelName: contextInfo.modelName,
            turns: safeSessionData.turns || 0,
            totalTokens: safeSessionData.totalTokens || 0,
            totalCost: contextInfo.totalCost,
            usagePercentage: contextInfo.usagePercentage,
            latestPrompt: safeSessionData.latestPrompt,
            autoCompact: contextInfo.autoCompact
          });
        }
      }

      // 最終更新時刻でソート
      sessions.sort((a, b) => {
        const aTime = a.lastModified instanceof Date ? a.lastModified.getTime() : a.lastModified;
        const bTime = b.lastModified instanceof Date ? b.lastModified.getTime() : b.lastModified;
        return bTime - aTime;
      });

      // 表示数を制限
      const limit = parseInt(String(options.limit || 10));
      const displaySessions = sessions.slice(0, limit);

      // SessionsLiveViewで表示
      this.sessionsView.updateSessions(displaySessions);
      
      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => {
        if (this.sessionsView) {
          this.sessionsView.destroy();
        }
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        if (this.sessionsView) {
          this.sessionsView.destroy();
        }
        process.exit(0);
      });

      // キーイベントの待機
      await new Promise<void>(() => {
        // プロミスは解決されない（ユーザーがqまたはCtrl+Cで終了するまで待機）
      });

    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      if (this.sessionsView) {
        this.sessionsView.destroy();
      }
      process.exit(1);
    }
  }

  private createMiniProgressBar(percentage: number): string {
    const width = 10;
    const safePercentage = Math.max(0, Math.min(100, percentage || 0));
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);
    
    const color: 'red' | 'yellow' | 'green' = safePercentage >= 80 ? 'red' : safePercentage >= 60 ? 'yellow' : 'green';
    return chalk[color]('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  private formatAge(date: Date): string {
    const now = Date.now();
    const age = now - date.getTime();
    const minutes = Math.floor(age / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
  }

  private formatPromptForList(prompt?: string): string {
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

  // private formatUsage(percentage: number): string {
  //   // percentageがundefinedまたはnullの場合のデフォルト値
  //   const safePercentage = Math.max(0, Math.min(100, percentage ?? 0));
  //   
  //   const bar = this.createMiniProgressBar(safePercentage);
  //   const percentStr = safePercentage.toFixed(1) + '%';
  //   return `[${bar}] ${chalk.cyan(percentStr.padStart(5))}`;
  // }

  // private formatAutoCompact(autoCompact?: { enabled?: boolean; remainingPercentage: number; thresholdPercentage?: number; warningLevel?: string }): string {
  //   if (!autoCompact?.enabled) {
  //     return chalk.gray('N/A');
  //   }
  // 
  //   const { remainingPercentage, thresholdPercentage, warningLevel } = autoCompact;
  //   
  //   if (remainingPercentage <= 0) {
  //     return chalk.red('ACTIVE!');
  //   }
  //   
  //   // 残り容量を % で表示
  //   const percentStr = remainingPercentage.toFixed(1) + '%';
  //   
  //   // 警告レベルに応じた表示
  //   switch (warningLevel) {
  //     case 'critical':
  //       return chalk.red(`!${percentStr}`);
  //     case 'warning':
  //       return chalk.yellow(`⚠ ${percentStr}`);
  //     case 'notice':
  //       return chalk.cyan(percentStr);
  //     default:
  //       return chalk.gray(percentStr);
  //   }
  // }

  // private formatCost(cost: number): string {
  //   const safeCost = cost ?? 0;
  //   return `$${safeCost.toFixed(2)}`;
  // }

  async resolveSessionIdentifier(identifier: string): Promise<string> {
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
      return path.basename(selectedFile!, '.jsonl');
    } else {
      throw new Error(`Invalid session number: ${position}. Valid range is 1-${sortedFiles.length}`);
    }
  }

  async listSessionsForSelection(options: { limit?: number } = {}): Promise<void> {
    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions: SessionForList[] = [];
      const limit = parseInt(String(options.limit || 20));

      // 各セッションファイルの情報を収集
      for (const file of files) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // セッションデータを読み込む
        const tempWatcher = new SessionWatcher();
        
        let sessionData: SessionData | null = null;
        tempWatcher.once('session-data', (data: SessionData) => {
          sessionData = data;
        });
        
        await tempWatcher.readExistingData(sessionId, file, false);
        
        if (sessionData) {
          const safeSessionData = sessionData as SessionData; // TypeScript 非同期パターン対応
          sessions.push({
            sessionId,
            file,
            lastModified: stats.mtime,
            model: safeSessionData.model || 'unknown',
            turns: safeSessionData.turns || 0,
            totalTokens: safeSessionData.totalTokens || 0,
            latestPrompt: safeSessionData.latestPrompt
          });
        }
      }

      // 最終更新時刻でソート（降順）
      sessions.sort((a, b) => {
        const aTime = a.lastModified instanceof Date ? a.lastModified.getTime() : a.lastModified;
        const bTime = b.lastModified instanceof Date ? b.lastModified.getTime() : b.lastModified;
        return bTime - aTime;
      });

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
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  async clearCache(): Promise<void> {
    try {
      console.log(chalk.yellow('🗑️  Clearing session cache...'));
      
      // SessionsManagerからSessionCacheインスタンスを取得
      const { SessionsManager } = await import('./monitor/sessions-manager.js');
      const manager = new SessionsManager();
      
      // SessionsManagerのclearCacheメソッドを使用
      if (typeof manager.clearCache === 'function') {
        manager.clearCache();
        console.log(chalk.green('✅ Session cache cleared successfully'));
      } else {
        console.log(chalk.yellow('⚠️  No session cache found'));
      }
      
      process.exit(0);
    } catch (error) {
      console.error(chalk.red(`Error clearing cache: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  async showSessionsLive(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🔍 Starting Claude Code Sessions Monitor...'));
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      // 全セッションファイルを取得
      const files = await this.watcher.getAllJsonlFiles();
      const limit = parseInt(String(options.limit));
      
      // 最新のファイルから順に処理
      const sortedFiles = await this.getSortedFilesByMtime(files);
      const filesToWatch = sortedFiles.slice(0, limit);
      
      // 初期セッションリスト
      const sessions: SessionWithContext[] = [];
      
      // 各セッションに対してwatchSessionを開始
      for (const file of filesToWatch) {
        const sessionId = path.basename(file, '.jsonl');
        const stats = await fs.promises.stat(file);
        
        // 個別のSessionWatcherインスタンスを作成
        const sessionWatcher = new SessionWatcher();
        
        // イベントハンドラー設定
        sessionWatcher.on('session-data', (sessionData: SessionData) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, stats.mtime);
        });
        
        sessionWatcher.on('message', ({ sessionData }: { sessionData: SessionData }) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
        });
        
        sessionWatcher.on('error', ({ error }: { error: Error }) => {
          if (options.debug) {
            console.error(`[DEBUG] Error in session ${sessionId}: ${error.message}`);
          }
        });
        
        // watchSessionを開始
        await sessionWatcher.watchSession(sessionId, file);
        this.watchedSessions.set(sessionId, sessionWatcher);
        
        // 初期データを取得してセッションリストに追加
        const sessionData = sessionWatcher.getSessionData(sessionId);
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
      
      // 初期表示
      if (this.sessionsView) {
        this.sessionsView.updateSessions(sessions);
      }
      
      // ディレクトリ監視（新規セッション追加/削除用）
      await this.watcher.startDirectoryWatch();
      
      this.watcher.on('session-added', async ({ sessionId, filePath }: { sessionId: string; filePath: string }) => {
        await this.addSessionWatch(sessionId, filePath, options);
      });
      
      this.watcher.on('session-removed', ({ sessionId }: { sessionId: string }) => {
        this.removeSessionWatch(sessionId);
      });
      
      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());

    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessionsLiveEnhanced(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🔍 Starting Enhanced Claude Code Sessions Monitor...'));
    
    // デバッグモードの設定
    const debugMode = process.env.DEBUG === '1' || options.debug;
    this.sessionsManager.setDebugMode(debugMode || false);
    
    if (debugMode) {
      console.log(chalk.yellow('🐛 Debug mode enabled'));
    }
    
    // ライブビューの初期化
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();
    
    try {
      // イベントリスナーを先に設定
      // セッション読み込み完了イベント
      this.sessionsManager.on('sessions-loaded', (sessions: SessionWithContext[]) => {
        if (debugMode) {
          console.error(`[CLI] Sessions loaded event received: ${sessions.length} sessions`);
        }
        
        const limit = parseInt(String(options.limit || 20));
        const displaySessions = sessions.slice(0, limit);
        
        if (debugMode) {
          console.error(`[CLI] Updating view with ${displaySessions.length} sessions`);
          if (displaySessions.length > 0) {
            console.error(`[CLI] First session sample:`, JSON.stringify(displaySessions[0], null, 2));
          }
        }
        
        if (this.sessionsView) {
          this.sessionsView.updateSessions(displaySessions);
          this.sessionsView.render();
        }
      });
      
      // セッション更新イベント（リアルタイム）
      this.sessionsManager.on('sessions-updated', (sessions: SessionWithContext[]) => {
        const limit = parseInt(String(options.limit || 20));
        const displaySessions = sessions.slice(0, limit);
        if (this.sessionsView) {
          this.sessionsView.updateSessions(displaySessions);
        }
        
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
      console.error(chalk.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  private updateStatusBarForEventDriven(): void {
    // StatusBarの更新（内部プロパティへの安全なアクセス）
    if (this.sessionsView && 'boxes' in this.sessionsView && this.sessionsView.boxes && 
        'statusBar' in this.sessionsView.boxes && this.sessionsView.boxes.statusBar) {
      if ('setContent' in this.sessionsView.boxes.statusBar && 
          typeof (this.sessionsView.boxes.statusBar as { setContent?: unknown }).setContent === 'function') {
        (this.sessionsView.boxes.statusBar as { setContent: (content: string) => void }).setContent(
          '[Live] Event-driven updates (↑↓: navigate, q: exit, r: refresh)'
        );
      }
    }
  }

  async getSortedFilesByMtime(files: string[]): Promise<string[]> {
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const stats = await fs.promises.stat(file);
        return { file, mtime: stats.mtime };
      })
    );
    
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return filesWithStats.map(f => f.file);
  }

  private updateSessionInView(sessionId: string, sessionData: SessionData, contextInfo: ContextInfo, lastModified: Date | number): void {
    // 現在の表示セッションリストを取得
    const currentSessions = this.sessionsView && 'sessions' in this.sessionsView ? 
      (this.sessionsView as { sessions: SessionWithContext[] }).sessions : [];
    
    // 該当セッションを更新
    const updatedSessions = currentSessions.map((session: SessionWithContext) => {
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
    if (!updatedSessions.find((s: SessionWithContext) => s.sessionId === sessionId)) {
      // 新規セッションの場合、file と size が不明なためデフォルト値を設定
      updatedSessions.push({
        sessionId,
        file: '', // ファイルパス不明
        size: 0,  // ファイルサイズ不明
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
    updatedSessions.sort((a: SessionWithContext, b: SessionWithContext) => {
      const aTime = a.lastModified instanceof Date ? a.lastModified.getTime() : a.lastModified;
      const bTime = b.lastModified instanceof Date ? b.lastModified.getTime() : b.lastModified;
      return bTime - aTime;
    });
    if (this.sessionsView) {
      this.sessionsView.updateSessions(updatedSessions);
    }
  }

  async addSessionWatch(sessionId: string, filePath: string, options: CLIOptions): Promise<void> {
    if (this.watchedSessions.has(sessionId)) return;
    
    const sessionWatcher = new SessionWatcher();
    
    sessionWatcher.on('session-data', (sessionData: SessionData) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });
    
    sessionWatcher.on('message', ({ sessionData }: { sessionData: SessionData }) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });
    
    sessionWatcher.on('error', ({ error }: { error: Error }) => {
      if (options.debug) {
        console.error(`[DEBUG] Error in session ${sessionId}: ${error.message}`);
      }
    });
    
    await sessionWatcher.watchSession(sessionId, filePath);
    this.watchedSessions.set(sessionId, sessionWatcher);
  }

  private removeSessionWatch(sessionId: string): void {
    const watcher = this.watchedSessions.get(sessionId);
    if (watcher) {
      watcher.stopWatching(sessionId);
      this.watchedSessions.delete(sessionId);
      
      // ビューからも削除
      const currentSessions = this.sessionsView && 'sessions' in this.sessionsView ? 
      (this.sessionsView as { sessions: SessionWithContext[] }).sessions : [];
      const updatedSessions = currentSessions.filter((s: SessionWithContext) => s.sessionId !== sessionId);
      if (this.sessionsView) {
        this.sessionsView.updateSessions(updatedSessions);
      }
    }
  }

  cleanup(): void {
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
    writeOut: (str: string) => { process.stdout.write(str); },
    writeErr: (str: string) => { process.stderr.write(str); }
  })
  .allowUnknownOption(false);

program
  .command('monitor')
  .description('Monitor Claude Code context usage')
  .option('-l, --live', 'Live monitoring mode (default)', true)
  .option('-s, --session <number>', 'Monitor specific session by number from list')
  .action((options: CLIOptions) => {
    cli.monitorLive(options);
  });

program
  .command('sessions')
  .description('List recent Claude Code sessions')
  .option('--limit <number>', 'Number of sessions to show', '10')
  .option('--live', 'Live monitoring mode')
  .option('--debug', 'Enable debug mode for detailed logging')
  .option('--clear-cache', 'Clear session cache and exit')
  .action((options: CLIOptions) => {
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
program.on('command:*', function (operands: string[]) {
  console.error(`error: unknown command '${operands[0]}'`);
  process.exit(1);
});

// デフォルトコマンド（引数なしで実行された場合）
program
  .option('--list', 'List all sessions for selection')
  .option('--session <number>', 'Monitor specific session by number from list')
  .action((options: CLIOptions) => {
    // コマンドラインの引数をチェック
    const args = process.argv.slice(2);
    // 未知のコマンドが指定されている場合はエラー
    if (args.length > 0 && !args[0]!.startsWith('-') && 
        !['monitor', 'sessions'].includes(args[0]!)) {
      console.error(`error: unknown command '${args[0]!}'`);
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
} catch (error: unknown) {
  // CommanderのexitOverrideでhelp/version時に例外が発生
  const err = error as { code?: string };
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
    process.exit(0);
  } else if (err.code && err.code.startsWith('commander.')) {
    process.exit(1);
  } else {
    throw error;
  }
}