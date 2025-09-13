import blessed from "blessed";
import pc from "picocolors";

// Type-safe color definitions
type PicoColor =
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "gray"
  | "redBright"
  | "yellowBright"
  | "white";

function getPicoColorFunction(colorName: PicoColor) {
  switch (colorName) {
    case "red":
      return pc.red;
    case "green":
      return pc.green;
    case "yellow":
      return pc.yellow;
    case "blue":
      return pc.blue;
    case "magenta":
      return pc.magenta;
    case "cyan":
      return pc.cyan;
    case "gray":
      return pc.gray;
    case "redBright":
      return (text: string) => pc.red(pc.bold(text));
    case "yellowBright":
      return (text: string) => pc.yellow(pc.bold(text));
    case "white":
      return pc.white;
    default:
      return pc.white;
  }
}

interface ContextInfo {
  sessionId: string;
  modelName: string;
  usagePercentage: number;
  contextWindow: number;
  totalTokens: number;
  remainingTokens: number;
  remainingPercentage: number;
  warningLevel: "normal" | "warning" | "severe" | "critical";
  startTime?: number | string | Date;
  turns: number;
  totalCost: number;
  averageTokensPerTurn: number;
  estimatedRemainingTurns: number;
  latestPrompt?: string;
  autoCompact?: {
    enabled?: boolean;
    warningLevel?: string;
    thresholdPercentage?: number;
    remainingPercentage: number;
  };
  latestTurn?: {
    input: number;
    output: number;
    cache: number;
    total: number;
    percentage: number;
  };
}

interface Boxes {
  container: blessed.Widgets.BoxElement;
  header: blessed.Widgets.BoxElement;
  sessionInfo: blessed.Widgets.BoxElement;
  contextUsage: blessed.Widgets.BoxElement;
  latestTurn: blessed.Widgets.BoxElement;
  latestPrompt: blessed.Widgets.BoxElement;
  sessionTotals: blessed.Widgets.BoxElement;
  statusBar: blessed.Widgets.BoxElement;
}

export class LiveView {
  private screen: blessed.Widgets.Screen | null;
  private boxes: Partial<Boxes>;
  // private contextInfo: ContextInfo | null;
  private updateInterval: NodeJS.Timeout | null;

  constructor() {
    this.screen = null;
    this.boxes = {};
    // this.contextInfo = null;
    this.updateInterval = null;
  }

  init(): void {
    // Blessedスクリーンの初期化
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true, // Unicode文字の正しい表示のため
      title: "Claude Code Context Monitor",
    });

    // Main container
    this.boxes.container = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      style: {
        fg: "white",
        bg: "black",
      },
    });

    // Header
    this.boxes.header = blessed.box({
      parent: this.boxes.container,
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      content: this.formatHeader(),
      style: {
        fg: "cyan",
        bg: "black",
      },
    });

    // Session info box
    this.boxes.sessionInfo = blessed.box({
      parent: this.boxes.container,
      top: 3,
      left: 0,
      width: "100%",
      height: 4,
      border: {
        type: "line",
      },
      label: " Session Info ",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "white",
        },
      },
    });

    // Context usage box
    this.boxes.contextUsage = blessed.box({
      parent: this.boxes.container,
      top: 7,
      left: 0,
      width: "100%",
      height: 7,
      border: {
        type: "line",
      },
      label: " Context Usage ",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "white",
        },
      },
    });

    // Latest turn info box
    this.boxes.latestTurn = blessed.box({
      parent: this.boxes.container,
      top: 14,
      left: 0,
      width: "100%",
      height: 6,
      border: {
        type: "line",
      },
      label: " Latest Turn ",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "white",
        },
      },
    });

    // Latest prompt box
    this.boxes.latestPrompt = blessed.box({
      parent: this.boxes.container,
      top: 20,
      left: 0,
      width: "100%",
      height: 4,
      border: {
        type: "line",
      },
      label: " Latest Prompt ",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "white",
        },
      },
    });

    // Session totals box
    this.boxes.sessionTotals = blessed.box({
      parent: this.boxes.container,
      top: 24,
      left: 0,
      width: "100%",
      height: 6,
      border: {
        type: "line",
      },
      label: " Session Totals ",
      style: {
        fg: "white",
        bg: "black",
        border: {
          fg: "white",
        },
      },
    });

    // Status bar
    this.boxes.statusBar = blessed.box({
      parent: this.boxes.container,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 1,
      content: "[Live] Watching for updates... (q to exit, r to refresh)",
      style: {
        fg: "green",
        bg: "black",
      },
    });

    // Key bindings
    this.screen.key(["q", "C-c"], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key(["r"], () => {
      this.render();
    });

    this.screen.render();
  }

  private formatHeader(): string {
    return `
╭─ Claude Code Context Monitor ─────────────────────────╮
│ Real-time context usage tracking for Claude Code      │
╰───────────────────────────────────────────────────────╯`;
  }

  updateContextInfo(info: ContextInfo): void {
    // this.contextInfo = info;

    if (!this.screen) return;

    // Update session info
    if (this.boxes.sessionInfo) {
      this.boxes.sessionInfo.setContent(this.formatSessionInfo(info));
    }

    // Update context usage
    if (this.boxes.contextUsage) {
      this.boxes.contextUsage.setContent(this.formatContextUsage(info));
    }

    // Update latest turn info
    if (info.latestTurn && this.boxes.latestTurn) {
      this.boxes.latestTurn.setContent(this.formatLatestTurn(info));
    }

    // Update latest prompt
    if (info.latestPrompt && this.boxes.latestPrompt) {
      this.boxes.latestPrompt.setContent(this.formatLatestPrompt(info));
    }

    // Update session totals
    if (this.boxes.sessionTotals) {
      this.boxes.sessionTotals.setContent(this.formatSessionTotals(info));
    }

    // Change border color based on warning level
    const borderColor = this.getBorderColor(info.warningLevel);
    if (this.boxes.contextUsage?.style.border) {
      this.boxes.contextUsage.style.border.fg = borderColor;
    }

    this.render();
  }

  private formatSessionInfo(info: ContextInfo): string {
    const duration = this.calculateDuration(info.startTime);
    return `
Session: ${pc.yellow(info.sessionId)}
Model: ${pc.cyan(info.modelName)}
Started: ${pc.gray(duration)} ago`;
  }

  private formatContextUsage(info: ContextInfo): string {
    const percentage = info.usagePercentage.toFixed(1);
    const bar = this.createProgressBar(info.usagePercentage);
    const color = this.getPercentageColor(info.usagePercentage);

    // AutoCompact情報のフォーマット
    let autoCompactInfo = "";
    if (info.autoCompact?.enabled) {
      const ac = info.autoCompact;
      const acColor = this.getAutoCompactColor(ac.warningLevel || "normal");

      if (ac.remainingPercentage > 0) {
        const colorFunc = getPicoColorFunction(acColor);
        autoCompactInfo = `\nLeft until Auto-compact: ${colorFunc(`${ac.remainingPercentage.toFixed(1)}%`)}`;
      } else {
        autoCompactInfo = `\n${pc.red(pc.bold("AUTO-COMPACT ACTIVE"))}`;
      }
    }

    return `
${bar} ${getPicoColorFunction(color)(`${percentage}%`)} (${this.formatTokens(
      info.totalTokens,
    )}/${this.formatTokens(info.contextWindow)})

Remaining: ${pc.green(
      this.formatTokens(info.remainingTokens),
    )} tokens (${info.remainingPercentage.toFixed(1)}%)${autoCompactInfo}
${this.getWarningMessage(info)}`;
  }

  private formatLatestTurn(info: ContextInfo): string {
    const turn = info.latestTurn;
    if (!turn) {
      return "No recent turn data";
    }
    return `
Input:  ${pc.blue(this.formatTokens(turn.input))} tokens
Output: ${pc.magenta(this.formatTokens(turn.output))} tokens
Cache:  ${pc.gray(this.formatTokens(turn.cache))} tokens (read)
Total:  ${pc.yellow(this.formatTokens(turn.total))} tokens (${turn.percentage.toFixed(2)}% of window)`;
  }

  private formatLatestPrompt(info: ContextInfo): string {
    const prompt = info.latestPrompt || "No prompt yet";
    const lines = prompt.split("\n");
    const maxLines = 2;

    let displayText = lines.slice(0, maxLines).join(" ").replace(/\s+/g, " ");
    if (lines.length > maxLines || displayText.length > 100) {
      displayText = `${displayText.substring(0, 100)}...`;
    }

    return `\n${pc.dim(displayText)}`;
  }

  private formatSessionTotals(info: ContextInfo): string {
    return `
Turns: ${pc.cyan(info.turns)}
Total Tokens: ${pc.yellow(this.formatTokens(info.totalTokens))}
Cost: ${pc.green(this.formatCost(info.totalCost))}
Avg/Turn: ${pc.gray(this.formatTokens(info.averageTokensPerTurn))}
Est. Remaining Turns: ${pc.cyan(info.estimatedRemainingTurns === Infinity ? "∞" : info.estimatedRemainingTurns)}`;
  }

  private createProgressBar(percentage: number): string {
    const width = 40;
    const safePercentage = Math.max(0, Math.min(100, percentage || 0));
    const filled = Math.max(0, Math.min(width, Math.round((safePercentage / 100) * width)));
    const empty = Math.max(0, width - filled);

    const color = this.getPercentageColor(safePercentage);
    const filledChar = getPicoColorFunction(color)("█");
    const emptyChar = pc.gray("░");

    return filledChar.repeat(filled) + emptyChar.repeat(empty);
  }

  private getPercentageColor(percentage: number): PicoColor {
    if (percentage >= 95) return "red";
    if (percentage >= 90) return "redBright";
    if (percentage >= 80) return "yellow";
    if (percentage >= 60) return "yellowBright";
    return "green";
  }

  private getBorderColor(warningLevel: string): string {
    switch (warningLevel) {
      case "critical":
        return "red";
      case "severe":
        return "redBright";
      case "warning":
        return "yellow";
      default:
        return "gray";
    }
  }

  private getAutoCompactColor(warningLevel: string): PicoColor {
    switch (warningLevel) {
      case "active":
        return "red";
      case "critical":
        return "red";
      case "warning":
        return "yellow";
      case "notice":
        return "blue";
      default:
        return "gray";
    }
  }

  private getWarningMessage(info: ContextInfo): string {
    switch (info.warningLevel) {
      case "critical":
        return pc.red("⚠️  CRITICAL: Context limit nearly reached!");
      case "severe":
        return pc.red(pc.bold("⚠️  WARNING: Approaching context limit"));
      case "warning":
        return pc.yellow("⚠️  Notice: High context usage");
      default:
        return "";
    }
  }

  private formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`;
    } else if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}k`;
    }
    return tokens.toString();
  }

  private formatCost(cost: number): string {
    return `$${cost.toFixed(2)}`;
  }

  private calculateDuration(startTime: number | string | Date | undefined): string {
    if (!startTime) return "Unknown";

    const duration = Date.now() - new Date(startTime).getTime();
    const minutes = Math.floor(duration / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  }

  showError(message: string): void {
    if (!this.screen) return;

    const errorBox = blessed.message({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "50%",
      height: "shrink",
      border: {
        type: "line",
      },
      style: {
        fg: "white",
        bg: "red",
        border: {
          fg: "white",
        },
      },
    });

    errorBox.error(message, () => {
      this.render();
    });
  }

  showMessage(message: string): void {
    if (!this.screen) return;

    if (this.boxes.statusBar) {
      this.boxes.statusBar.setContent(message);
      this.render();

      // 3秒後に元のメッセージに戻す
      setTimeout(() => {
        if (this.boxes.statusBar) {
          this.boxes.statusBar.setContent("[Live] Watching for updates... (q to exit, r to refresh)");
          this.render();
        }
      }, 3000);
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
