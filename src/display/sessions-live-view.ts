import blessed from 'blessed';
// import chalk from 'chalk';
import stringWidth from 'string-width';
import type { SessionData } from '../types/index.js';

// SessionData interface removed - using shared type from types/index.js

interface Boxes {
  container: blessed.Widgets.BoxElement;
  header: blessed.Widgets.BoxElement;
  sessionsTable: blessed.Widgets.ListTableElement;
  statusBar: blessed.Widgets.BoxElement;
  summary: blessed.Widgets.BoxElement;
}

export class SessionsLiveView {
  private screen: blessed.Widgets.Screen | null;
  public boxes: Partial<Boxes>;
  public sessions: SessionData[];
  private updateInterval: NodeJS.Timeout | null;
  // private selectedIndex: number; // Store selected row index

  constructor() {
    this.screen = null;
    this.boxes = {};
    this.sessions = [];
    this.updateInterval = null;
    // this.selectedIndex = 0;
  }

  init(): void {
    // Blessedスクリーンの初期化
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,  // Unicode文字の正しい表示のため
      title: 'Claude Code Sessions Monitor'
    });

    // Main container
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

    // Header
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

    // Sessions table
    this.boxes.sessionsTable = blessed.listtable({
      parent: this.boxes.container,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-5',
      border: {
        type: 'line'
      },
      label: ' Active Sessions ',
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'gray'
        },
        header: {
          fg: 'cyan',
          bold: true
        },
        cell: {
          fg: 'white',
          selected: {
            bg: 'cyan',
            fg: 'black',
            bold: true
          }
        }
      },
      tags: false,  // Unicode文字の表示問題を避けるため無効化
      keys: true,   // Enable keyboard navigation
      vi: false,    // viモードを無効化（これが2行ジャンプの原因）
      mouse: true,
      selectedFg: 'black',
      selectedBg: 'cyan',
      interactive: true,  // Enable interactivity
      scrollable: true
    });

    // Status bar
    this.boxes.statusBar = blessed.box({
      parent: this.boxes.container,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: this.formatStatusBar(),
      style: {
        fg: 'green',
        bg: 'black'
      }
    });

    // Summary info
    this.boxes.summary = blessed.box({
      parent: this.boxes.container,
      bottom: 1,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        fg: 'gray',
        bg: 'black'
      }
    });

    // Key bindings
    this.screen.key(['q', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.render();
    });

    // Set focus to table
    if (this.boxes.sessionsTable) {
      this.boxes.sessionsTable.focus();
    }

    // Setup table header
    this.updateTableHeader();
    
    this.screen.render();
  }

  private formatHeader(): string {
    return `+-- Claude Code Sessions Monitor ------------------------+
| Real-time monitoring of all Claude Code sessions       |
+--------------------------------------------------------+`;
  }

  private formatStatusBar(): string {
    return '[Live] Auto-refreshing every 1s (↑↓: navigate, q: exit, r: refresh)';
  }

  private updateTableHeader(): void {
    const headers = [
      'Session',
      'Usage',
      'Model(latest)',
      'Turns',
      'Cost',
      'Last Active',
      'Latest Prompt'
    ];
    
    if (this.boxes.sessionsTable) {
      this.boxes.sessionsTable.setData([headers]);
    }
  }

  updateSessions(sessionsData: SessionData[]): void {
    this.sessions = sessionsData;
    
    if (!this.screen || !this.boxes.sessionsTable) return;

    // Save current selection position
    // selectedIndexプロパティは内部的に使用される可能性があるが、型定義に含まれていないため
    // Type-safe access
    const currentSelected = this.boxes.sessionsTable && 'selectedIndex' in this.boxes.sessionsTable ? 
      (this.boxes.sessionsTable as { selectedIndex?: number }).selectedIndex : undefined;

    // Prepare table data
    const tableData: string[][] = [
      // Header row
      [
        'No.',
        'Session',
        'Usage',
        'Left until auto-compact',
        'Model(latest)',
        'Turns',
        'Cost',
        'Last Active',
        'Latest Prompt'
      ]
    ];

    // Add session data
    sessionsData.forEach((session, index) => {
      const row = [
        (index + 1).toString(),  // Add number
        session.sessionId.substring(0, 8),
        this.formatUsage(session.usagePercentage || 0),
        this.formatAutoCompact(session.autoCompact),
        session.modelName || 'Unknown',
        session.turns.toString(),
        this.formatCost(session.totalCost || 0),
        this.formatAge(session.lastModified || new Date()),
        this.truncatePrompt(session.latestPrompt, 50)
      ];
      tableData.push(row);
    });

    // Update table
    this.boxes.sessionsTable.setData(tableData);

    // Restore selection position (check to prevent out of range)
    if (currentSelected != null && currentSelected > 0 && currentSelected < tableData.length) {
      this.boxes.sessionsTable.select(currentSelected);
    }

    // Update summary info
    this.updateSummary(sessionsData);

    this.render();
  }

  private formatUsage(percentage: number): string {
    // percentageがundefinedまたはnullの場合のデフォルト値
    const safePercentage = Math.max(0, Math.min(100, percentage ?? 0));
    
    const width = 10;
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);
    
    // Create progress bar in same format as regular sessions command
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    const percentStr = safePercentage.toFixed(1) + '%';
    return `[${bar}] ${percentStr.padStart(5)}`;
  }

  private formatAge(date: Date | number): string {
    const now = Date.now();
    const age = now - (date instanceof Date ? date.getTime() : date);
    const seconds = Math.floor(age / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  }

  private formatCost(cost: number): string {
    const safeCost = cost ?? 0;
    return `$${safeCost.toFixed(2)}`;
  }

  private formatAutoCompact(autoCompact: SessionData['autoCompact']): string {
    if (!autoCompact) {
      return 'N/A';
    }

    const { remainingPercentage } = autoCompact;
    
    // Show ACTIVE only when remaining percentage is actually 0 or below
    if (remainingPercentage <= 0) {
      return 'ACTIVE!';
    }
    
    // Display remaining capacity in % (ignore willTrigger flag)
    const percentStr = remainingPercentage.toFixed(1) + '%';
    
    // Warning display based on thresholds
    if (remainingPercentage <= 10) {
      return `!${percentStr}`;
    } else if (remainingPercentage <= 20) {
      return `⚠ ${percentStr}`;
    } else {
      return percentStr;
    }
  }

  private truncatePrompt(prompt: string | undefined, maxLength: number): string {
    if (!prompt) return 'No prompt yet';
    
    // Debug: Check prompt content
    // console.error('DEBUG: Original prompt:', prompt);
    
    // Replace line breaks and consecutive spaces with single space
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
    
    // blessedのtags機能との競合を避けるため、chalkを使用しない
    return result;
  }

  private updateSummary(sessions: SessionData[]): void {
    if (!this.boxes.summary) return;

    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => {
      const lastModified = s.lastModified || new Date();
      const age = Date.now() - (lastModified instanceof Date ? lastModified.getTime() : lastModified);
      return age < 3600000; // 1時間以内
    }).length;
    
    const avgUsage = sessions.length > 0 
      ? (sessions.reduce((sum, s) => sum + (s.usagePercentage || 0), 0) / sessions.length).toFixed(1)
      : '0';
    
    const summary = `Total: ${totalSessions} sessions | ` +
                   `Active (1h): ${activeSessions} | ` +
                   `Avg Usage: ${avgUsage}%`;
    
    this.boxes.summary.setContent(summary);
  }

  showError(message: string): void {
    if (!this.screen) return;
    
    const errorBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'red',
        border: {
          fg: 'white'
        }
      }
    });

    errorBox.error(message, () => {
      this.render();
    });
  }

  startAutoRefresh(refreshCallback: () => void): void {
    // 1秒ごとに更新 - レガシー実装用
    this.updateInterval = setInterval(() => {
      refreshCallback();
    }, 1000);
  }

  stopAutoRefresh(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  render(): void {
    if (this.screen) {
      this.screen.render();
    }
  }

  destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.screen) {
      this.screen.destroy();
    }
  }
}