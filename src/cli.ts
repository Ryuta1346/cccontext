import { program } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { LiveView } from "./display/live-view.js";
import { SessionsLiveView } from "./display/sessions-live-view.js";
import { ContextTracker } from "./monitor/context-tracker.js";
import { EnhancedSessionsManager } from "./monitor/enhanced-sessions-manager.js";
import { SessionWatcher } from "./monitor/session-watcher.js";
import { UsageCalculator } from "./monitor/usage-calculator.js";
import type { SessionData } from "./types/index.js";

// Get package version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);
const version = packageJson.version;

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
  warningLevel: "normal" | "warning" | "severe" | "critical";
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

import fs from "fs";
import path from "path";
import pc from "picocolors";
import stringWidth from "string-width";

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
    console.log(pc.cyan("🔍 Starting Claude Code Context Monitor..."));

    try {
      let sessionToMonitor: ActiveSession | null;

      // Session selection processing (before UI initialization)
      if (options.session) {
        // Resolve specified session ID or sequence number
        const resolvedSessionId = await this.resolveSessionIdentifier(options.session);

        // Search for session file
        const files = await this.watcher.getAllJsonlFiles();
        const sessionFile = files.find((f) => path.basename(f, ".jsonl") === resolvedSessionId);

        if (!sessionFile) {
          console.error(pc.red(`Session not found: ${options.session}`));
          process.exit(1);
        }

        sessionToMonitor = {
          sessionId: resolvedSessionId,
          filePath: sessionFile,
        };
      } else {
        // Search for active session
        sessionToMonitor = await this.watcher.findActiveSession();

        if (!sessionToMonitor) {
          console.error(pc.red("No active Claude Code sessions found."));
          process.exit(1);
        }
      }

      console.log(pc.green(`✓ Found session: ${sessionToMonitor.sessionId}`));

      // Initialize live view after session resolution
      this.view = new LiveView();
      this.view.init();
      this.view.showMessage(`Monitoring session: ${sessionToMonitor.sessionId}`);

      // Setup event handlers
      this.watcher.on("session-data", (sessionData: SessionData) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        if (this.view) {
          this.view.updateContextInfo(contextInfo);
        }
      });

      this.watcher.on("message", ({ sessionData }: { sessionData: SessionData }) => {
        const contextInfo = this.tracker.updateSession(sessionData);
        if (this.view) {
          this.view.updateContextInfo(contextInfo);
        }
      });

      this.watcher.on("error", ({ sessionId, error }: { sessionId: string; error: Error }) => {
        if (this.view) {
          this.view.showError(`Error in session ${sessionId}: ${error.message}`);
        }
      });

      // Start session monitoring
      await this.watcher.watchSession(sessionToMonitor.sessionId, sessionToMonitor.filePath);

      // Cleanup on process exit
      process.on("SIGINT", () => this.cleanup());
      process.on("SIGTERM", () => this.cleanup());
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessions(options: CLIOptions): Promise<void> {
    console.log(pc.cyan("🔍 Loading Claude Code Sessions..."));

    // Initialize live view
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions: SessionWithContext[] = [];

      // Collect information for each session file
      for (const file of files) {
        const sessionId = path.basename(file, ".jsonl");
        const stats = await fs.promises.stat(file);

        // monitor --liveと同じ方法でセッションデータを読み込む
        const tempWatcher = new SessionWatcher();

        let sessionData: SessionData | null = null;
        tempWatcher.once("session-data", (data: SessionData) => {
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
            model: safeSessionData.model || "unknown",
            modelName: contextInfo.modelName,
            turns: safeSessionData.turns || 0,
            totalTokens: safeSessionData.totalTokens || 0,
            totalCost: contextInfo.totalCost,
            usagePercentage: contextInfo.usagePercentage,
            latestPrompt: safeSessionData.latestPrompt,
            autoCompact: contextInfo.autoCompact,
          });
        }
      }

      // Sort by last update time
      sessions.sort((a, b) => {
        const aTime = a.lastModified instanceof Date ? a.lastModified.getTime() : a.lastModified;
        const bTime = b.lastModified instanceof Date ? b.lastModified.getTime() : b.lastModified;
        return bTime - aTime;
      });

      // Debug logging
      if (process.env.DEBUG) {
        console.log(pc.gray(`[DEBUG] showSessions - Sessions after sorting (newest first):`));
        sessions.slice(0, 5).forEach((session, idx) => {
          console.log(pc.gray(`[DEBUG]   ${idx + 1}. ${session.sessionId}`));
        });
      }

      // Limit number of displayed items
      const limit = parseInt(String(options.limit || 10), 10);
      const displaySessions = sessions.slice(0, limit);

      // SessionsLiveViewで表示
      this.sessionsView.updateSessions(displaySessions);

      // Cleanup on process exit
      process.on("SIGINT", () => {
        if (this.sessionsView) {
          this.sessionsView.destroy();
        }
        process.exit(0);
      });
      process.on("SIGTERM", () => {
        if (this.sessionsView) {
          this.sessionsView.destroy();
        }
        process.exit(0);
      });

      // Wait for key events
      await new Promise<void>(() => {
        // Promise never resolves (wait until user presses q or Ctrl+C)
      });
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
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

    const color: "red" | "yellow" | "green" = safePercentage >= 80 ? "red" : safePercentage >= 60 ? "yellow" : "green";
    const colorFn = color === "red" ? pc.red : color === "yellow" ? pc.yellow : pc.green;
    return colorFn("█".repeat(filled)) + pc.gray("░".repeat(empty));
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
    if (!prompt) return "";

    const maxLength = 60;
    const cleanPrompt = prompt.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    // string-widthを使用して正確な表示幅を計算
    let result = "";
    let currentWidth = 0;

    // UTF-16サロゲートペアを適切に処理するためにArray.fromを使用
    const chars = Array.from(cleanPrompt);

    for (const char of chars) {
      const charWidth = stringWidth(char);

      if (currentWidth + charWidth > maxLength - 3) {
        // '...'の分を考慮
        result += "...";
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
  //   return `[${bar}] ${pc.cyan(percentStr.padStart(5))}`;
  // }

  // private formatAutoCompact(autoCompact?: { enabled?: boolean; remainingPercentage: number; thresholdPercentage?: number; warningLevel?: string }): string {
  //   if (!autoCompact?.enabled) {
  //     return pc.gray('N/A');
  //   }
  //
  //   const { remainingPercentage, thresholdPercentage, warningLevel } = autoCompact;
  //
  //   if (remainingPercentage <= 0) {
  //     return pc.red('ACTIVE!');
  //   }
  //
  //   // 残り容量を % で表示
  //   const percentStr = remainingPercentage.toFixed(1) + '%';
  //
  //   // 警告レベルに応じた表示
  //   switch (warningLevel) {
  //     case 'critical':
  //       return pc.red(`!${percentStr}`);
  //     case 'warning':
  //       return pc.yellow(`⚠ ${percentStr}`);
  //     case 'notice':
  //       return pc.cyan(percentStr);
  //     default:
  //       return pc.gray(percentStr);
  //   }
  // }

  // private formatCost(cost: number): string {
  //   const safeCost = cost ?? 0;
  //   return `$${safeCost.toFixed(2)}`;
  // }

  async resolveSessionIdentifier(identifier: string): Promise<string> {
    // Accept only numeric values
    if (!/^\d+$/.test(identifier)) {
      throw new Error(`Invalid session number: ${identifier}. Please specify a number from the list.`);
    }

    const position = parseInt(identifier, 10);
    const files = await this.watcher.getAllJsonlFiles();

    // Sort files by last update time (newest first)
    const sortedFiles = await this.getSortedFilesByMtime(files);

    // Debug logging (only when DEBUG environment variable is set)
    if (process.env.DEBUG) {
      console.error(pc.yellow(`\n[Session Selection Debug]`));
      console.error(pc.gray(`  Total files found: ${sortedFiles.length}`));
      console.error(pc.gray(`  Requested position: ${position}`));
      console.error(pc.gray(`  Available sessions (newest first):`));
      sortedFiles.slice(0, Math.min(10, sortedFiles.length)).forEach((file, idx) => {
        const sessionId = path.basename(file, ".jsonl");
        const stats = fs.statSync(file);
        const timeStr = stats.mtime.toISOString().slice(0, 19).replace("T", " ");
        const selected = idx + 1 === position ? pc.green(" <-- SELECTED") : "";
        console.error(pc.gray(`    ${idx + 1}. ${sessionId} (${timeStr})${selected}`));
      });
      console.error("");
    }

    if (position > 0 && position <= sortedFiles.length) {
      const selectedFile = sortedFiles[position - 1];
      const selectedSessionId = path.basename(selectedFile ?? "", ".jsonl");

      if (process.env.DEBUG) {
        console.log(pc.gray(`[DEBUG] Selected session: ${selectedSessionId}`));
      }

      return selectedSessionId;
    } else {
      throw new Error(`Invalid session number: ${position}. Valid range is 1-${sortedFiles.length}`);
    }
  }

  async listSessionsForSelection(options: { limit?: number } = {}): Promise<void> {
    try {
      const files = await this.watcher.getAllJsonlFiles();
      const sessions: SessionForList[] = [];
      const limit = parseInt(String(options.limit || 20), 10);

      // Collect information for each session file
      for (const file of files) {
        const sessionId = path.basename(file, ".jsonl");
        const stats = await fs.promises.stat(file);

        // Load session data
        const tempWatcher = new SessionWatcher();

        let sessionData: SessionData | null = null;
        tempWatcher.once("session-data", (data: SessionData) => {
          sessionData = data;
        });

        await tempWatcher.readExistingData(sessionId, file, false);

        if (sessionData) {
          const safeSessionData = sessionData as SessionData; // TypeScript 非同期パターン対応
          sessions.push({
            sessionId,
            file,
            lastModified: stats.mtime,
            model: safeSessionData.model || "unknown",
            turns: safeSessionData.turns || 0,
            totalTokens: safeSessionData.totalTokens || 0,
            latestPrompt: safeSessionData.latestPrompt,
          });
        }
      }

      // Sort by last update time（降順）
      sessions.sort((a, b) => {
        const aTime = a.lastModified instanceof Date ? a.lastModified.getTime() : a.lastModified;
        const bTime = b.lastModified instanceof Date ? b.lastModified.getTime() : b.lastModified;
        return bTime - aTime;
      });

      // Debug logging
      if (process.env.DEBUG) {
        console.log(pc.gray(`[DEBUG] Sessions after sorting (newest first):`));
        sessions.slice(0, 5).forEach((session, idx) => {
          console.log(pc.gray(`[DEBUG]   ${idx + 1}. ${session.sessionId}`));
        });
      }

      if (sessions.length === 0) {
        console.log(pc.yellow("No sessions found."));
        process.exit(0);
      }

      console.log(pc.cyan("\nActive Sessions"));
      console.log(pc.gray("━".repeat(100)));

      // Header row
      console.log(
        pc.gray("No.") +
          "  " +
          pc.gray("Session ID") +
          "  " +
          pc.gray("Usage") +
          "           " +
          pc.gray("Model") +
          "            " +
          pc.gray("Turns") +
          "   " +
          pc.gray("Age") +
          "      " +
          pc.gray("Latest Prompt"),
      );
      console.log(pc.gray("━".repeat(100)));

      // Limit number of displayed items
      const displaySessions = sessions.slice(0, limit);

      displaySessions.forEach((session, index) => {
        const age = this.formatAge(session.lastModified);
        const modelName = this.calculator.getModelName(session.model);
        const contextWindow = this.tracker.getContextWindow(session.model);
        const usage = (session.totalTokens / contextWindow) * 100;
        const formattedPrompt = session.latestPrompt ? this.formatPromptForList(session.latestPrompt) : "";

        // Number (3 characters)
        const num = pc.yellow((index + 1).toString().padEnd(3));

        // Session ID (10 characters)
        const sessionId = pc.white(session.sessionId);

        // Usage rate and progress bar (15 characters)
        const progressBar = this.createMiniProgressBar(usage);
        const usageStr = `[${progressBar}] ${pc.cyan(`${usage.toFixed(1).padStart(5)}%`)}`;

        // Model name (15 characters)
        const model = pc.blue(modelName.padEnd(15));

        // Turn count (7 characters)
        const turns = pc.green(`${session.turns} turns`.padEnd(7));

        // Elapsed time (8 characters)
        const ageStr = pc.magenta(age.padEnd(8));

        // Latest prompt
        const prompt = pc.dim(formattedPrompt);

        console.log(`${num} ${sessionId} ${usageStr} ${model} ${turns} ${ageStr} ${prompt}`);
      });

      console.log(pc.gray("━".repeat(100)));
      if (sessions.length > limit) {
        console.log(pc.gray(`Total sessions: ${sessions.length} (showing ${limit})`));
      } else {
        console.log(pc.gray(`Total sessions: ${sessions.length}`));
      }
      console.log(pc.gray("\nUsage: cccontext -s <number>"));
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  async clearCache(): Promise<void> {
    try {
      console.log(pc.yellow("🗑️  Clearing session cache..."));

      // EnhancedSessionsManagerを使用してキャッシュをクリア
      const manager = new EnhancedSessionsManager();
      manager.clearCache();
      console.log(pc.green("✅ Session cache cleared successfully"));

      process.exit(0);
    } catch (error) {
      console.error(pc.red(`Error clearing cache: ${(error as Error).message}`));
      process.exit(1);
    }
  }

  async showSessionsLive(options: CLIOptions): Promise<void> {
    console.log(pc.cyan("🔍 Starting Claude Code Sessions Monitor..."));

    // Initialize live view
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      // Get all session files
      const files = await this.watcher.getAllJsonlFiles();
      const limit = parseInt(String(options.limit), 10);

      // Process from newest files first
      const sortedFiles = await this.getSortedFilesByMtime(files);
      const filesToWatch = sortedFiles.slice(0, limit);

      // Initial session list
      const sessions: SessionWithContext[] = [];

      // Start watchSession for each session
      for (const file of filesToWatch) {
        const sessionId = path.basename(file, ".jsonl");
        const stats = await fs.promises.stat(file);

        // Create individual SessionWatcher instance
        const sessionWatcher = new SessionWatcher();

        // Setup event handlers
        sessionWatcher.on("session-data", (sessionData: SessionData) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, stats.mtime);
        });

        sessionWatcher.on("message", ({ sessionData }: { sessionData: SessionData }) => {
          const contextInfo = this.tracker.updateSession(sessionData);
          this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
        });

        sessionWatcher.on("error", ({ error }: { error: Error }) => {
          if (options.debug) {
            console.error(`[DEBUG] Error in session ${sessionId}: ${error.message}`);
          }
        });

        // watchSessionを開始
        await sessionWatcher.watchSession(sessionId, file);
        this.watchedSessions.set(sessionId, sessionWatcher);

        // Get initial data and add to session list
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
            autoCompact: contextInfo.autoCompact,
          });
        }
      }

      // Initial display
      if (this.sessionsView) {
        this.sessionsView.updateSessions(sessions);
      }

      // Directory monitoring (for adding/removing new sessions)
      await this.watcher.startDirectoryWatch();

      this.watcher.on("session-added", async ({ sessionId, filePath }: { sessionId: string; filePath: string }) => {
        await this.addSessionWatch(sessionId, filePath, options);
      });

      this.watcher.on("session-removed", ({ sessionId }: { sessionId: string }) => {
        this.removeSessionWatch(sessionId);
      });

      // Cleanup on process exit
      process.on("SIGINT", () => this.cleanup());
      process.on("SIGTERM", () => this.cleanup());
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  async showSessionsLiveEnhanced(options: CLIOptions): Promise<void> {
    console.log(pc.cyan("🔍 Starting Enhanced Claude Code Sessions Monitor..."));

    // Setup debug mode
    const debugMode = process.env.DEBUG === "1" || options.debug;
    this.sessionsManager.setDebugMode(debugMode || false);

    if (debugMode) {
      console.log(pc.yellow("🐛 Debug mode enabled"));
    }

    // Initialize live view
    this.sessionsView = new SessionsLiveView();
    this.sessionsView.init();

    try {
      // Setup event listeners first
      // Session loading completed event
      this.sessionsManager.on("sessions-loaded", (sessions: SessionWithContext[]) => {
        if (debugMode) {
          console.error(`[CLI] Sessions loaded event received: ${sessions.length} sessions`);
        }

        const limit = parseInt(String(options.limit || 20), 10);
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

      // Session update event (real-time)
      this.sessionsManager.on("sessions-updated", (sessions: SessionWithContext[]) => {
        const limit = parseInt(String(options.limit || 20), 10);
        const displaySessions = sessions.slice(0, limit);
        if (this.sessionsView) {
          this.sessionsView.updateSessions(displaySessions);
        }

        if (debugMode) {
          const stats = this.sessionsManager.getCacheStats();
          console.error(`[CLI] Update: ${sessions.length} sessions, cache: ${stats.cachedSessions}`);
        }
      });

      // Initialize enhanced session manager (after event listener setup)
      await this.sessionsManager.initialize();

      // Cleanup on process exit
      const cleanup = () => {
        console.log(pc.cyan("\n🔄 Shutting down sessions monitor..."));
        this.cleanup();
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Update status bar to show event-driven operation
      this.updateStatusBarForEventDriven();
    } catch (error) {
      console.error(pc.red(`Error: ${(error as Error).message}`));
      this.cleanup();
      process.exit(1);
    }
  }

  private updateStatusBarForEventDriven(): void {
    // StatusBarの更新（内部プロパティへの安全なアクセス）
    if (
      this.sessionsView &&
      "boxes" in this.sessionsView &&
      this.sessionsView.boxes &&
      "statusBar" in this.sessionsView.boxes &&
      this.sessionsView.boxes.statusBar
    ) {
      if (
        "setContent" in this.sessionsView.boxes.statusBar &&
        typeof (this.sessionsView.boxes.statusBar as { setContent?: unknown }).setContent === "function"
      ) {
        (this.sessionsView.boxes.statusBar as { setContent: (content: string) => void }).setContent(
          "[Live] Event-driven updates (↑↓: navigate, q: exit, r: refresh)",
        );
      }
    }
  }

  async getSortedFilesByMtime(files: string[]): Promise<string[]> {
    const filesWithStats = await Promise.all(
      files.map(async (file) => {
        const stats = await fs.promises.stat(file);
        return { file, mtime: stats.mtime };
      }),
    );

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return filesWithStats.map((f) => f.file);
  }

  private updateSessionInView(
    sessionId: string,
    sessionData: SessionData,
    contextInfo: ContextInfo,
    lastModified: Date | number,
  ): void {
    // Get current displayed session list
    const currentSessions =
      this.sessionsView && "sessions" in this.sessionsView
        ? (this.sessionsView as { sessions: SessionWithContext[] }).sessions
        : [];

    // Update corresponding session
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
          autoCompact: contextInfo.autoCompact,
        };
      }
      return session;
    });

    // Add session if it doesn't exist
    if (!updatedSessions.find((s: SessionWithContext) => s.sessionId === sessionId)) {
      // For new sessions, file and size are unknown so set default values
      updatedSessions.push({
        sessionId,
        file: "", // File path unknown
        size: 0, // File size unknown
        model: sessionData.model,
        modelName: contextInfo.modelName,
        turns: sessionData.turns,
        totalTokens: sessionData.totalTokens,
        totalCost: contextInfo.totalCost,
        usagePercentage: contextInfo.usagePercentage,
        latestPrompt: sessionData.latestPrompt,
        lastModified: lastModified,
        autoCompact: contextInfo.autoCompact,
      });
    }

    // Sort and update display
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

    sessionWatcher.on("session-data", (sessionData: SessionData) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });

    sessionWatcher.on("message", ({ sessionData }: { sessionData: SessionData }) => {
      const contextInfo = this.tracker.updateSession(sessionData);
      this.updateSessionInView(sessionId, sessionData, contextInfo, new Date());
    });

    sessionWatcher.on("error", ({ error }: { error: Error }) => {
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

      // Remove from view as well
      const currentSessions =
        this.sessionsView && "sessions" in this.sessionsView
          ? (this.sessionsView as { sessions: SessionWithContext[] }).sessions
          : [];
      const updatedSessions = currentSessions.filter((s: SessionWithContext) => s.sessionId !== sessionId);
      if (this.sessionsView) {
        this.sessionsView.updateSessions(updatedSessions);
      }
    }
  }

  cleanup(): void {
    // Stop all individual session monitoring
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
  .name("cccontext")
  .description("Real-time context usage monitor for Claude Code")
  .version(version)
  .exitOverride()
  .configureOutput({
    writeOut: (str: string) => {
      process.stdout.write(str);
    },
    writeErr: (str: string) => {
      process.stderr.write(str);
    },
  })
  .allowUnknownOption(false);

program
  .command("monitor")
  .description("Monitor Claude Code context usage")
  .option("-l, --live", "Live monitoring mode (default)", true)
  .option("-s, --session <number>", "Monitor specific session by number from list")
  .action((options: CLIOptions) => {
    cli.monitorLive(options);
  });

program
  .command("sessions")
  .description("List recent Claude Code sessions")
  .option("--limit <number>", "Number of sessions to show", "10")
  .option("--live", "Live monitoring mode")
  .option("--debug", "Enable debug mode for detailed logging")
  .option("--clear-cache", "Clear session cache and exit")
  .action((options: CLIOptions) => {
    if (options.clearCache) {
      cli.clearCache();
    } else if (options.live) {
      // Temporarily use original implementation
      cli.showSessionsLive(options);
    } else {
      cli.showSessions(options);
    }
  });

// Handle unknown commands
program.on("command:*", (operands: string[]) => {
  console.error(`error: unknown command '${operands[0]}'`);
  process.exit(1);
});

// Default command (when executed without arguments)
program.option("--list", "List all sessions for selection").action((options: CLIOptions) => {
  // Check command line arguments
  const args = process.argv.slice(2);
  // Error if unknown command is specified
  if (args.length > 0 && !args[0]?.startsWith("-") && !["monitor", "sessions"].includes(args[0] ?? "")) {
    console.error(`error: unknown command '${args[0] ?? ""}'`);
    process.exit(1);
  }

  if (options.list) {
    cli.listSessionsForSelection({ limit: options.listLimit || 20 });
  } else {
    // Default to monitor without session selection
    cli.monitorLive({ live: true });
  }
});

try {
  program.parse(process.argv);
} catch (error: unknown) {
  // CommanderのexitOverrideでhelp/version時に例外が発生
  const err = error as { code?: string; message?: string };
  if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
    process.exit(0);
  } else if (err.code?.startsWith("commander.")) {
    // Commander already outputs error through configureOutput.writeErr
    // Just exit with error code
    process.exit(1);
  } else {
    throw error;
  }
}
