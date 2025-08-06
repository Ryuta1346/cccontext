import blessed from 'blessed';
import chalk from 'chalk';

export class LiveView {
  constructor() {
    this.screen = null;
    this.boxes = {};
    this.contextInfo = null;
    this.updateInterval = null;
  }

  init() {
    // Blessedスクリーンの初期化
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,  // Unicode文字の正しい表示のため
      title: 'Claude Code Context Monitor'
    });

    // メインコンテナ
    this.boxes.container = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      style: {
        fg: 'white',
        bg: 'black'
      }
    });

    // ヘッダー
    this.boxes.header = blessed.box({
      parent: this.boxes.container,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.formatHeader(),
      style: {
        fg: 'cyan',
        bg: 'black'
      }
    });

    // セッション情報ボックス
    this.boxes.sessionInfo = blessed.box({
      parent: this.boxes.container,
      top: 3,
      left: 0,
      width: '100%',
      height: 4,
      border: {
        type: 'line',
        fg: 'gray'
      },
      label: ' Session Info ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        }
      }
    });

    // コンテキスト使用量ボックス
    this.boxes.contextUsage = blessed.box({
      parent: this.boxes.container,
      top: 7,
      left: 0,
      width: '100%',
      height: 7,
      border: {
        type: 'line',
        fg: 'gray'
      },
      label: ' Context Usage ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        }
      }
    });

    // 最新ターン情報ボックス
    this.boxes.latestTurn = blessed.box({
      parent: this.boxes.container,
      top: 14,
      left: 0,
      width: '100%',
      height: 6,
      border: {
        type: 'line',
        fg: 'gray'
      },
      label: ' Latest Turn ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        }
      }
    });

    // 最新プロンプトボックス
    this.boxes.latestPrompt = blessed.box({
      parent: this.boxes.container,
      top: 20,
      left: 0,
      width: '100%',
      height: 4,
      border: {
        type: 'line',
        fg: 'gray'
      },
      label: ' Latest Prompt ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        }
      }
    });

    // セッション合計ボックス
    this.boxes.sessionTotals = blessed.box({
      parent: this.boxes.container,
      top: 24,
      left: 0,
      width: '100%',
      height: 6,
      border: {
        type: 'line',
        fg: 'gray'
      },
      label: ' Session Totals ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        }
      }
    });

    // ステータスバー
    this.boxes.statusBar = blessed.box({
      parent: this.boxes.container,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: '[Live] Watching for updates... (q to exit, r to refresh)',
      style: {
        fg: 'green',
        bg: 'black'
      }
    });

    // キーバインディング
    this.screen.key(['q', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.render();
    });

    this.screen.render();
  }

  formatHeader() {
    return `
╭─ Claude Code Context Monitor ─────────────────────────╮
│ Real-time context usage tracking for Claude Code      │
╰───────────────────────────────────────────────────────╯`;
  }

  updateContextInfo(info) {
    this.contextInfo = info;
    
    if (!this.screen) return;

    // セッション情報の更新
    this.boxes.sessionInfo.setContent(this.formatSessionInfo(info));

    // コンテキスト使用量の更新
    this.boxes.contextUsage.setContent(this.formatContextUsage(info));

    // 最新ターン情報の更新
    if (info.latestTurn) {
      this.boxes.latestTurn.setContent(this.formatLatestTurn(info));
    }

    // 最新プロンプトの更新
    if (info.latestPrompt) {
      this.boxes.latestPrompt.setContent(this.formatLatestPrompt(info));
    }

    // セッション合計の更新
    this.boxes.sessionTotals.setContent(this.formatSessionTotals(info));

    // 警告レベルに応じて枠線の色を変更
    const borderColor = this.getBorderColor(info.warningLevel);
    this.boxes.contextUsage.style.border.fg = borderColor;

    this.render();
  }

  formatSessionInfo(info) {
    const duration = this.calculateDuration(info.startTime);
    return `
Session: ${chalk.yellow(info.sessionId.substring(0, 16))}...
Model: ${chalk.cyan(info.modelName)}
Started: ${chalk.gray(duration)} ago`;
  }

  formatContextUsage(info) {
    const percentage = info.usagePercentage.toFixed(1);
    const bar = this.createProgressBar(info.usagePercentage);
    const color = this.getPercentageColor(info.usagePercentage);
    
    // AutoCompact情報のフォーマット
    let autoCompactInfo = '';
    if (info.autoCompact?.enabled) {
      const ac = info.autoCompact;
      const acColor = this.getAutoCompactColor(ac.warningLevel);
      
      if (ac.remainingPercentage > 0) {
        autoCompactInfo = `\nAuto-compact: ${chalk[acColor](`at ${ac.thresholdPercentage}% (until ${ac.remainingPercentage.toFixed(1)}%)`)}`;
      } else {
        autoCompactInfo = `\n${chalk.red.bold('AUTO-COMPACT ACTIVE')}`;
      }
    }
    
    return `
${bar} ${chalk[color](percentage + '%')} (${this.formatTokens(info.totalTokens)}/${this.formatTokens(info.contextWindow)})

Remaining: ${chalk.green(this.formatTokens(info.remainingTokens))} tokens (${info.remainingPercentage.toFixed(1)}%)${autoCompactInfo}
${this.getWarningMessage(info)}`;
  }

  formatLatestTurn(info) {
    const turn = info.latestTurn;
    return `
Input:  ${chalk.blue(this.formatTokens(turn.input))} tokens
Output: ${chalk.magenta(this.formatTokens(turn.output))} tokens
Cache:  ${chalk.gray(this.formatTokens(turn.cache))} tokens (read)
Total:  ${chalk.yellow(this.formatTokens(turn.total))} tokens (${turn.percentage.toFixed(2)}% of window)`;
  }

  formatLatestPrompt(info) {
    const prompt = info.latestPrompt || 'No prompt yet';
    const lines = prompt.split('\n');
    const maxLines = 2;
    
    let displayText = lines.slice(0, maxLines).join(' ').replace(/\s+/g, ' ');
    if (lines.length > maxLines || displayText.length > 100) {
      displayText = displayText.substring(0, 100) + '...';
    }
    
    return `\n${chalk.dim(displayText)}`;
  }

  formatSessionTotals(info) {
    return `
Turns: ${chalk.cyan(info.turns)}
Total Tokens: ${chalk.yellow(this.formatTokens(info.totalTokens))}
Cost: ${chalk.green(this.formatCost(info.totalCost))}
Avg/Turn: ${chalk.gray(this.formatTokens(info.averageTokensPerTurn))}
Est. Remaining Turns: ${chalk.cyan(info.estimatedRemainingTurns === Infinity ? '∞' : info.estimatedRemainingTurns)}`;
  }

  createProgressBar(percentage) {
    const width = 40;
    const safePercentage = Math.max(0, Math.min(100, percentage || 0));
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);
    
    const color = this.getPercentageColor(safePercentage);
    const filledChar = chalk[color]('█');
    const emptyChar = chalk.gray('░');
    
    return filledChar.repeat(filled) + emptyChar.repeat(empty);
  }

  getPercentageColor(percentage) {
    if (percentage >= 95) return 'red';
    if (percentage >= 90) return 'redBright';
    if (percentage >= 80) return 'yellow';
    if (percentage >= 60) return 'yellowBright';
    return 'green';
  }

  getBorderColor(warningLevel) {
    switch (warningLevel) {
      case 'critical': return 'red';
      case 'severe': return 'redBright';
      case 'warning': return 'yellow';
      default: return 'gray';
    }
  }

  getAutoCompactColor(warningLevel) {
    switch (warningLevel) {
      case 'active': return 'red';
      case 'critical': return 'red';
      case 'warning': return 'yellow';
      case 'notice': return 'blue';
      default: return 'gray';
    }
  }

  getWarningMessage(info) {
    switch (info.warningLevel) {
      case 'critical':
        return chalk.red('⚠️  CRITICAL: Context limit nearly reached!');
      case 'severe':
        return chalk.redBright('⚠️  WARNING: Approaching context limit');
      case 'warning':
        return chalk.yellow('⚠️  Notice: High context usage');
      default:
        return '';
    }
  }

  formatTokens(tokens) {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  formatCost(cost) {
    return `$${cost.toFixed(2)}`;
  }

  calculateDuration(startTime) {
    if (!startTime) return 'Unknown';
    
    const duration = Date.now() - new Date(startTime).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  showError(message) {
    if (!this.screen) return;
    
    const errorBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: {
        type: 'line',
        fg: 'red'
      },
      style: {
        fg: 'white',
        bg: 'red',
        border: {
          fg: 'red'
        }
      }
    });

    errorBox.error(message, () => {
      this.render();
    });
  }

  showMessage(message) {
    if (!this.screen) return;
    
    this.boxes.statusBar.setContent(message);
    this.render();
    
    // 3秒後に元のメッセージに戻す
    setTimeout(() => {
      this.boxes.statusBar.setContent('[Live] Watching for updates... (q to exit, r to refresh)');
      this.render();
    }, 3000);
  }

  render() {
    if (this.screen) {
      this.screen.render();
    }
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.screen) {
      this.screen.destroy();
    }
  }
}