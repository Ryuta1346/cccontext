#!/usr/bin/env node

import { program } from 'commander';
import { SessionWatcher } from './monitor/session-watcher.mjs';
import { ContextTracker } from './monitor/context-tracker.mjs';
import { LiveView } from './display/live-view.mjs';
import { SessionsLiveView } from './display/sessions-live-view.mjs';
import { UsageCalculator } from './monitor/usage-calculator.mjs';
import chalk from 'chalk';
import stringWidth from 'string-width';
import fs from 'fs';
import path from 'path';
import os from 'os';

class CCContextCLI {
  constructor() {
    this.watcher = new SessionWatcher();
    this.tracker = new ContextTracker();
    this.view = null;
    this.sessionsView = null;
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
        let latestPrompt = '';
        
        // 最初と最後のメッセージから情報を抽出
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.model) model = data.message.model;
            if (data.message?.role === 'assistant') turns++;
            if (data.message?.usage) {
              totalTokens += (data.message.usage.input_tokens || 0) + (data.message.usage.output_tokens || 0);
            }
            // 最新のユーザープロンプトを取得
            if (data.message?.role === 'user' && data.message?.content) {
              const content = Array.isArray(data.message.content) 
                ? data.message.content.find(c => c.type === 'text')?.text || ''
                : data.message.content;
              if (content) {
                latestPrompt = content;
              }
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
          totalTokens,
          latestPrompt: this.formatPromptForList(latestPrompt)
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
      // ディレクトリ監視を開始
      await this.watcher.startDirectoryWatch();
      
      // セッション追加/削除/更新イベントをリッスン
      this.watcher.on('session-added', async ({ sessionId, filePath }) => {
        await updateSessions(); // 新しいセッションが追加されたら更新
      });
      
      this.watcher.on('session-removed', async ({ sessionId, filePath }) => {
        await updateSessions(); // セッションが削除されたら更新
      });
      
      this.watcher.on('session-updated', async ({ sessionId, filePath }) => {
        await updateSessions(); // セッションが更新されたら（/compactなど）更新
      });

      // セッション情報の更新関数
      const updateSessions = async () => {
        try {
          // キャッシュを無効化して最新のファイルリストを取得
          this.watcher.invalidateCache();
          const files = await this.watcher.getAllJsonlFiles();
          const sessions = [];

          // 各セッションファイルの情報を収集
          for (const file of files) {
            const sessionId = path.basename(file, '.jsonl');
            const stats = await fs.promises.stat(file);
            
            // ファイルの最後の数行を読む（効率化）
            const content = await fs.promises.readFile(file, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line);
            
            let model = 'Unknown';
            let turns = 0;
            let totalTokens = 0;
            let latestPrompt = '';
            let totalCost = 0;
            
            // メッセージ情報を抽出
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message?.model) model = data.message.model;
                if (data.message?.role === 'assistant') turns++;
                if (data.message?.usage) {
                  const usage = data.message.usage;
                  totalTokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
                  
                  // コスト計算
                  const costData = this.calculator.calculateCost(usage, model);
                  totalCost += costData.totalCost;
                }
                // 最新のユーザープロンプトを取得
                if (data.message?.role === 'user' && data.message?.content) {
                  const content = Array.isArray(data.message.content) 
                    ? data.message.content.find(c => c.type === 'text')?.text || ''
                    : data.message.content;
                  if (content) {
                    latestPrompt = content;
                  }
                }
              } catch (e) {
                // 無効なJSON行はスキップ
              }
            }

            const contextWindow = this.tracker.getContextWindow(model);
            const usagePercentage = (totalTokens / contextWindow) * 100;
            const modelName = this.calculator.getModelName(model);

            sessions.push({
              sessionId,
              lastModified: stats.mtime,
              model,
              modelName,
              turns,
              totalTokens,
              totalCost,
              usagePercentage,
              latestPrompt
            });
          }

          // 最終更新時刻でソート
          sessions.sort((a, b) => b.lastModified - a.lastModified);

          // 表示数を制限
          const limit = parseInt(options.limit) || 20;
          const displaySessions = sessions.slice(0, limit);

          // ビューを更新
          this.sessionsView.updateSessions(displaySessions);
        } catch (error) {
          this.sessionsView.showError(`Error: ${error.message}`);
        }
      };

      // 初回更新
      await updateSessions();

      // 自動更新を開始
      this.sessionsView.startAutoRefresh(updateSessions);

      // プロセス終了時のクリーンアップ
      process.on('SIGINT', () => this.cleanup());
      process.on('SIGTERM', () => this.cleanup());

    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  cleanup() {
    if (this.view) {
      this.view.destroy();
    }
    if (this.sessionsView) {
      this.sessionsView.destroy();
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
  .action((options) => {
    if (options.live) {
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