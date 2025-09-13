#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import type { SessionData } from "./types/index.js";

interface CLIOptions {
  live?: boolean;
  session?: string;
  limit?: string | number;
  debug?: boolean;
  clearCache?: boolean;
  list?: boolean;
  listLimit?: number;
}

// Lazy load heavy modules only when needed
async function loadMonitorCommand() {
  const [
    { LiveView },
    { ContextTracker },
    { SessionWatcher },
    { UsageCalculator }
  ] = await Promise.all([
    import("./display/live-view.js"),
    import("./monitor/context-tracker.js"),
    import("./monitor/session-watcher.js"),
    import("./monitor/usage-calculator.js")
  ]);
  
  return { LiveView, ContextTracker, SessionWatcher, UsageCalculator };
}

async function loadSessionsCommand() {
  const [
    { SessionsLiveView },
    { EnhancedSessionsManager },
    { SessionWatcher }
  ] = await Promise.all([
    import("./display/sessions-live-view.js"),
    import("./monitor/enhanced-sessions-manager.js"),
    import("./monitor/session-watcher.js")
  ]);
  
  return { SessionsLiveView, EnhancedSessionsManager, SessionWatcher };
}

// Parse version from package.json
const packagePath = path.join(import.meta.dirname || process.cwd(), "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));

program
  .name("cccontext")
  .description("Real-time context usage monitor for Claude Code")
  .version(packageJson.version);

// Monitor command with lazy loading
program
  .command("monitor")
  .description("Monitor Claude Code context usage")
  .option("-l, --live", "Live monitoring mode")
  .option("-s, --session <number>", "Monitor specific session by number from list")
  .action(async (options: CLIOptions) => {
    const { LiveView, ContextTracker, SessionWatcher } = await loadMonitorCommand();
    
    // Create instances and run monitor
    const tracker = new ContextTracker();
    const watcher = new SessionWatcher();
    
    if (options.live) {
      const view = new LiveView();
      view.init();
      
      // Find active session to monitor
      const activeSession = await watcher.findActiveSession();
      if (!activeSession) {
        console.log(chalk.red("No active Claude Code sessions found."));
        process.exit(1);
      }
      
      // Setup event handlers
      watcher.on("session-data", (sessionData: SessionData) => {
        const contextInfo = tracker.updateSession(sessionData);
        if (contextInfo) {
          view.updateContextInfo(contextInfo);
        }
      });
      
      // Start monitoring the session
      await watcher.watchSession(activeSession.sessionId, activeSession.filePath);
      
      process.on("SIGINT", () => {
        view.destroy();
        watcher.stopWatching(activeSession.sessionId);
        process.exit(0);
      });
    } else {
      // Non-live mode implementation
      console.log(chalk.yellow("Use --live flag for real-time monitoring"));
      process.exit(0);
    }
  });

// Sessions command with lazy loading
program
  .command("sessions")
  .description("List recent Claude Code sessions")
  .option("-l, --live", "Live sessions view")
  .option("--limit <n>", "Number of sessions to display", "10")
  .option("--list", "List sessions without live view")
  .option("--clear-cache", "Clear session cache and exit")
  .action(async (options: CLIOptions) => {
    if (options.clearCache) {
      const { EnhancedSessionsManager } = await loadSessionsCommand();
      const manager = new EnhancedSessionsManager();
      manager.clearCache();
      console.log(chalk.green("✓ Session cache cleared"));
      process.exit(0);
    }
    
    if (options.list) {
      const { EnhancedSessionsManager } = await loadSessionsCommand();
      const manager = new EnhancedSessionsManager();
      await manager.initialize();
      const allSessions = await manager.getAllSessions();
      const sessions = allSessions.slice(0, Number(options.limit) || 10);
      
      // Display sessions list
      console.log(chalk.cyan.bold("\n📊 Recent Claude Code Sessions\n"));
      sessions.forEach((session, index) => {
        console.log(chalk.yellow(`[${index + 1}] ${session.sessionId}`));
        console.log(chalk.gray(`    Model: ${session.model}`));
        console.log(chalk.gray(`    Tokens: ${session.totalTokens.toLocaleString()}`));
        if (session.latestPrompt) {
          const truncated = session.latestPrompt.length > 50 
            ? `${session.latestPrompt.substring(0, 50)}...`
            : session.latestPrompt;
          console.log(chalk.gray(`    Latest: ${truncated}`));
        }
        console.log();
      });
      
      process.exit(0);
    }
    
    if (options.live) {
      const { SessionsLiveView, EnhancedSessionsManager } = await loadSessionsCommand();
      const view = new SessionsLiveView();
      const manager = new EnhancedSessionsManager();
      
      view.init();
      await manager.initialize();
      
      const updateView = async () => {
        const allSessions = await manager.getAllSessions();
        const sessions = allSessions.slice(0, Number(options.limit) || 10);
        // Cast SessionInfo[] to SessionData[] - they're compatible except for startTime type
        view.updateSessions(sessions as unknown as SessionData[]);
      };
      
      // Setup periodic updates
      const intervalId = setInterval(updateView, 1000);
      updateView(); // Initial load
      
      process.on("SIGINT", () => {
        clearInterval(intervalId);
        view.destroy();
        manager.destroy();
        process.exit(0);
      });
    } else {
      // Default to list mode if no --live flag
      options.list = true;
      program.parse(process.argv);
    }
  });

// Default action
program
  .option("-l, --live", "Live monitoring mode")
  .option("--session <number>", "Monitor specific session by number from list")
  .action(async (options: CLIOptions) => {
    // Check command line arguments
    const args = process.argv.slice(2);
    const hasCommand = args.some(arg => !arg.startsWith("-"));
    
    if (!hasCommand) {
      // Default to monitor command
      const { LiveView, ContextTracker, SessionWatcher } = await loadMonitorCommand();
      
      if (options.live) {
        const tracker = new ContextTracker();
        const watcher = new SessionWatcher();
        const view = new LiveView();
        
        view.init();
        
        // Find active session to monitor
        const activeSession = await watcher.findActiveSession();
        if (!activeSession) {
          console.log(chalk.red("No active Claude Code sessions found."));
          process.exit(1);
        }
        
        // Setup event handlers
        watcher.on("session-data", (sessionData: SessionData) => {
          const contextInfo = tracker.updateSession(sessionData);
          if (contextInfo) {
            view.updateContextInfo(contextInfo);
          }
        });
        
        // Start monitoring the session
        await watcher.watchSession(activeSession.sessionId, activeSession.filePath);
        
        process.on("SIGINT", () => {
          view.destroy();
          watcher.stopWatching(activeSession.sessionId);
          process.exit(0);
        });
      } else {
        console.log(chalk.yellow("Use --live flag for real-time monitoring"));
        console.log(chalk.gray("\nAvailable commands:"));
        console.log(chalk.gray("  cccontext monitor --live    Monitor context usage"));
        console.log(chalk.gray("  cccontext sessions --live   View active sessions"));
        process.exit(0);
      }
    }
  });

program.parse();