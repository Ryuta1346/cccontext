/**
 * Adapter for the existing blessed-based TUI implementation
 */

import type { TUIAdapter, SessionsViewAdapter, MonitorViewAdapter } from "./tui-adapter.js";
import { SessionsLiveView } from "./sessions-live-view.js";
import { LiveView } from "./live-view.js";
import type { SessionData } from "../types/index.js";
import type { ContextInfo } from "../monitor/context-tracker.js";

class BlessedSessionsViewAdapter implements SessionsViewAdapter {
  private view: SessionsLiveView;
  
  constructor() {
    this.view = new SessionsLiveView();
  }
  
  init(): void {
    this.view.init();
  }
  
  update(sessions: SessionData[]): void {
    // Use the public updateSessions method
    this.view.updateSessions(sessions);
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
  
  update(data: ContextInfo): void {
    // Use the public updateContextInfo method
    this.view.updateContextInfo(data);
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