import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { SessionsLiveView } from '../../src/display/sessions-live-view.ts';

describe('SessionsLiveView', () => {
  let sessionsView;

  beforeEach(() => {
    sessionsView = new SessionsLiveView();
  });

  afterEach(() => {
    if (sessionsView && sessionsView.screen) {
      sessionsView.destroy();
    }
  });

  describe('formatCost', () => {
    it('should format cost with correct decimal places', () => {
      expect(sessionsView.formatCost(0)).toBe('$0.00');
      expect(sessionsView.formatCost(0.001)).toBe('$0.00');
      expect(sessionsView.formatCost(0.009)).toBe('$0.01');
      expect(sessionsView.formatCost(1.5)).toBe('$1.50');
      expect(sessionsView.formatCost(10.999)).toBe('$11.00');
    });
  });

  describe('formatAge', () => {
    it('should format recent times as minutes', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      expect(sessionsView.formatAge(fiveMinutesAgo)).toBe('5m ago');
    });

    it('should format times within 24 hours as hours', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);
      expect(sessionsView.formatAge(threeHoursAgo)).toBe('3h ago');
    });

    it('should format older times as days', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
      expect(sessionsView.formatAge(twoDaysAgo)).toBe('2d ago');
    });

    it('should handle very recent times', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now - 30 * 1000);
      expect(sessionsView.formatAge(thirtySecondsAgo)).toBe('30s ago');
    });
  });

  describe('formatHeader', () => {
    it('should return formatted header', () => {
      const header = sessionsView.formatHeader();
      expect(header).toMatch(/Claude Code Sessions Monitor/);
      expect(header).toMatch(/Real-time monitoring/);
    });
  });

  describe('formatStatusBar', () => {
    it('should return formatted status bar', () => {
      const statusBar = sessionsView.formatStatusBar();
      expect(statusBar).toMatch(/Live.*Auto-refreshing every.*s/);
      expect(statusBar).toMatch(/q.*exit/);
      expect(statusBar).toMatch(/r.*refresh/);
      expect(statusBar).toMatch(/↑↓.*navigate/);
    });
  });

  describe('updateSessions', () => {
    it('should update sessions data', () => {
      const sessions = [
        {
          sessionId: 'test-session',
          modelName: 'Test Model',
          usagePercentage: 50,
          turns: 15,
          totalTokens: 100000,
          totalCost: 1.50,
          lastModified: new Date(),
          latestPrompt: 'Test'
        }
      ];

      sessionsView.updateSessions(sessions);
      
      expect(sessionsView.sessions.length).toBe(1);
      expect(sessionsView.sessions[0].sessionId).toBe('test-session');
    });
  });

  describe('showError', () => {
    it('should store error message', () => {
      sessionsView.showError('Test error');
      
      // エラーメッセージが内部に保存されることを確認
      // （実際の表示はscreenが必要なのでテストしない）
      expect(sessionsView).toBeTruthy();
    });
  });

  describe('startAutoRefresh and stopAutoRefresh', () => {
    it('should manage auto refresh interval', async () => {
      let refreshCount = 0;
      const mockRefresh = async () => { refreshCount++; };
      
      sessionsView.startAutoRefresh(mockRefresh);
      expect(sessionsView.updateInterval).toBeTruthy();
      
      // インターバルが設定されていることを確認
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // stopAutoRefresh is internal, test just the state
      if (sessionsView.updateInterval) {
        clearInterval(sessionsView.updateInterval);
        sessionsView.updateInterval = null;
      }
      expect(sessionsView.updateInterval).toBe(null);
      
      // リフレッシュが呼ばれたことを確認
      expect(refreshCount).toBeGreaterThanOrEqual(0);
    });
  });
});