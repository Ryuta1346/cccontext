import blessed from 'blessed';
// import chalk from 'chalk';
import stringWidth from 'string-width';

interface SessionData {
  sessionId: string;
  modelName?: string;
  usagePercentage: number;
  turns: number;
  totalCost?: number;
  lastModified: Date | number;
  latestPrompt?: string;
  autoCompact?: {
    enabled?: boolean;
    remainingPercentage: number;
    thresholdPercentage?: number;
    warningLevel?: string;
  };
}

interface Boxes {
  container: blessed.Widgets.BoxElement;
  header: blessed.Widgets.BoxElement;
  sessionsTable: blessed.Widgets.ListTableElement;
  statusBar: blessed.Widgets.BoxElement;
  summary: blessed.Widgets.BoxElement;
}

export class SessionsLiveView {
  private screen: blessed.Widgets.Screen | null;
  private boxes: Partial<Boxes>;
  public sessions: SessionData[];
  private updateInterval: NodeJS.Timeout | null;
  // private selectedIndex: number; // 選択中の行インデックスを保存

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

    // セッションテーブル
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
      keys: true,   // キーボードナビゲーションを有効化
      vi: false,    // viモードを無効化（これが2行ジャンプの原因）
      mouse: true,
      selectedFg: 'black',
      selectedBg: 'cyan',
      interactive: true,  // インタラクティブを有効化
      scrollable: true
    });

    // ステータスバー
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

    // サマリー情報
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

    // キーバインディング
    this.screen.key(['q', 'C-c'], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      this.render();
    });

    // テーブルにフォーカスを設定
    if (this.boxes.sessionsTable) {
      this.boxes.sessionsTable.focus();
    }

    // テーブルヘッダーの設定
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

    // 現在の選択位置を保存
    const currentSelected = (this.boxes.sessionsTable as any).selectedIndex;

    // テーブルデータの準備
    const tableData: string[][] = [
      // ヘッダー行
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

    // セッションデータの追加
    sessionsData.forEach((session, index) => {
      const row = [
        (index + 1).toString(),  // 番号を追加
        session.sessionId.substring(0, 8),
        this.formatUsage(session.usagePercentage),
        this.formatAutoCompact(session.autoCompact),
        session.modelName || 'Unknown',
        session.turns.toString(),
        this.formatCost(session.totalCost || 0),
        this.formatAge(session.lastModified),
        this.truncatePrompt(session.latestPrompt, 50)
      ];
      tableData.push(row);
    });

    // テーブル更新
    this.boxes.sessionsTable.setData(tableData);

    // 選択位置を復元（範囲外にならないようチェック）
    if (currentSelected > 0 && currentSelected < tableData.length) {
      this.boxes.sessionsTable.select(currentSelected);
    }

    // サマリー情報の更新
    this.updateSummary(sessionsData);

    this.render();
  }

  private formatUsage(percentage: number): string {
    // percentageがundefinedまたはnullの場合のデフォルト値
    const safePercentage = Math.max(0, Math.min(100, percentage ?? 0));
    
    const width = 10;
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);
    
    // 通常のsessionsコマンドと同じ形式でプログレスバーを作成
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

  private formatAutoCompact(autoCompact?: SessionData['autoCompact']): string {
    // autoCompactが存在しない、またはenabledが明示的にfalseの場合のみN/A
    if (!autoCompact || autoCompact.enabled === false) {
      return 'N/A';
    }

    const { remainingPercentage, warningLevel } = autoCompact;
    
    if (remainingPercentage <= 0) {
      return 'ACTIVE!';
    }
    
    // 残り容量を % で表示
    const percentStr = remainingPercentage.toFixed(1) + '%';
    
    // 警告レベルに応じた表示
    switch (warningLevel) {
      case 'critical':
        return `!${percentStr}`;
      case 'warning':
        return `⚠ ${percentStr}`;
      case 'notice':
        return percentStr;
      default:
        return percentStr;
    }
  }

  private truncatePrompt(prompt: string | undefined, maxLength: number): string {
    if (!prompt) return 'No prompt yet';
    
    // デバッグ: プロンプトの内容を確認
    // console.error('DEBUG: Original prompt:', prompt);
    
    // 改行や連続する空白を単一スペースに置換
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
      const age = Date.now() - (s.lastModified instanceof Date ? s.lastModified.getTime() : s.lastModified);
      return age < 3600000; // 1時間以内
    }).length;
    
    const avgUsage = sessions.length > 0 
      ? (sessions.reduce((sum, s) => sum + s.usagePercentage, 0) / sessions.length).toFixed(1)
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