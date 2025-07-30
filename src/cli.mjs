#!/usr/bin/env node

import { program } from 'commander';
import { SessionWatcher } from './monitor/session-watcher.mjs';
import { ContextTracker } from './monitor/context-tracker.mjs';
import { LiveView } from './display/live-view.mjs';
import { UsageCalculator } from './monitor/usage-calculator.mjs';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';

class CCContextCLI {
  constructor() {
    this.watcher = new SessionWatcher();
    this.tracker = new ContextTracker();
    this.view = null;
    this.calculator = new UsageCalculator();
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
        const content = await fs.promises.readFile(file, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line);
        
        let model = 'Unknown';
        let turns = 0;
        let totalTokens = 0;
        
        // 最初と最後のメッセージから情報を抽出
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.model) model = data.message.model;
            if (data.message?.role === 'assistant') turns++;
            if (data.message?.usage) {
              totalTokens += (data.message.usage.input_tokens || 0) + (data.message.usage.output_tokens || 0);
            }
          } catch (e) {
            // 無効なJSON行はスキップ
          }
        }

        sessions.push({
          sessionId,
          file,
          lastModified: stats.mtime,
          size: stats.size,
          model,
          turns,
          totalTokens
        });
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

  cleanup() {
    if (this.view) {
      this.view.destroy();
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
  .version('0.1.0');

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
  .action((options) => {
    cli.showSessions(options);
  });

// デフォルトコマンド（引数なしで実行された場合）
program
  .action(() => {
    cli.monitorLive({ live: true });
  });

program.parse(process.argv);