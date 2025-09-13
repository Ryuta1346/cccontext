/**
 * Adapter for the lightweight TUI implementation
 * This will be implemented when cli-table3 is properly installed
 */

import type { TUIAdapter, SessionsViewAdapter, MonitorViewAdapter } from "./tui-adapter.js";
import type { SessionData } from "../types/index.js";

class LightweightSessionsViewAdapter implements SessionsViewAdapter {
  init(): void {
    console.log("Lightweight sessions view initialized");
  }
  
  update(sessions: SessionData[]): void {
    console.log(`Updating with ${sessions.length} sessions`);
  }
  
  destroy(): void {
    console.log("Lightweight sessions view destroyed");
  }
}

class LightweightMonitorViewAdapter implements MonitorViewAdapter {
  init(): void {
    console.log("Lightweight monitor view initialized");
  }
  
  update(data: any): void {
    console.log("Updating monitor view", data);
  }
  
  destroy(): void {
    console.log("Lightweight monitor view destroyed");
  }
}

export class LightweightTUIAdapter implements TUIAdapter {
  createSessionsView(): SessionsViewAdapter {
    return new LightweightSessionsViewAdapter();
  }
  
  createMonitorView(): MonitorViewAdapter {
    return new LightweightMonitorViewAdapter();
  }
}