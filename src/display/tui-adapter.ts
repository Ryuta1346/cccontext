/**
 * Adapter to allow switching between blessed and lightweight TUI implementations
 * This enables gradual migration without breaking existing functionality
 */

import type { SessionData } from "../types/index.js";

export interface TUIAdapter {
  createSessionsView(): SessionsViewAdapter;
  createMonitorView(): MonitorViewAdapter;
}

export interface SessionsViewAdapter {
  init(): void;
  update(sessions: SessionData[]): void;
  destroy(): void;
}

export interface MonitorViewAdapter {
  init(): void;
  update(data: any): void;
  destroy(): void;
}

// Feature flag to switch implementations
export const USE_LIGHTWEIGHT_TUI = process.env.CCCONTEXT_LIGHTWEIGHT_TUI === "true";

// Export the appropriate adapter based on the feature flag
export async function getTUIAdapter(): Promise<TUIAdapter> {
  if (USE_LIGHTWEIGHT_TUI) {
    // Use lightweight implementation
    const { LightweightTUIAdapter } = await import("./lightweight-adapter.js");
    return new LightweightTUIAdapter();
  } else {
    // Use blessed implementation (default for now)
    const { BlessedTUIAdapter } = await import("./blessed-adapter.js");
    return new BlessedTUIAdapter();
  }
}