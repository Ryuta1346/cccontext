/**
 * Adapter for the existing blessed-based TUI implementation
 */

import type { TUIAdapter, SessionsViewAdapter, MonitorViewAdapter } from "./tui-adapter.js";
import { SessionsLiveView } from "./sessions-live-view.js";
import { LiveView } from "./live-view.js";
import type { SessionData } from "../types/index.js";

class BlessedSessionsViewAdapter implements SessionsViewAdapter {
  private view: SessionsLiveView;
  
  constructor() {
    this.view = new SessionsLiveView();
  }
  
  init(): void {
    this.view.init();
  }
  
  update(sessions: SessionData[]): void {
    // The SessionsLiveView doesn't have a direct update method
    // It uses updateSessions internally
    (this.view as any).sessions = sessions;
    (this.view as any).updateTable();
  }
  
  destroy(): void {
    this.view.destroy();
  }
}

class BlessedMonitorViewAdapter implements MonitorViewAdapter {
  private view: LiveView;
  
  constructor() {
    this.view = new LiveView();
  }
  
  init(): void {
    this.view.init();
  }
  
  update(data: any): void {
    // The LiveView doesn't have a direct update method
    // It uses updateUI internally
    (this.view as any).context = data;
    (this.view as any).updateUI();
  }
  
  destroy(): void {
    this.view.destroy();
  }
}

export class BlessedTUIAdapter implements TUIAdapter {
  createSessionsView(): SessionsViewAdapter {
    return new BlessedSessionsViewAdapter();
  }
  
  createMonitorView(): MonitorViewAdapter {
    return new BlessedMonitorViewAdapter();
  }
}