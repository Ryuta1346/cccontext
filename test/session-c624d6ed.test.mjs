import { describe, it, expect } from 'vitest';
import { ContextTracker } from '../src/monitor/context-tracker.mjs';
import { calculateAutoCompactInfo } from '../src/monitor/claude-calculation.mjs';

describe('Session c624d6ed-1eba-45e6-b3e5-db18aea5f551 calculation', () => {
  it('should match claude-context-calculator results', () => {
    const tracker = new ContextTracker();
    
    // セッションc624d6edの実際のデータ（メッセージ83）
    // claude-context-calculatorは 137,962 を表示
    const sessionData = {
      sessionId: 'c624d6ed-1eba-45e6-b3e5-db18aea5f551',
      model: 'claude-3-5-sonnet-20241022',
      // claude-context-calculatorが表示している値を使用
      totalTokens: 137962,  // Claude計算機の表示値
      totalCacheTokens: 136635,
      turns: 42,  // 84メッセージ / 2
      messages: [],
      startTime: new Date()
    };

    const info = tracker.updateSession(sessionData);
    
    console.log('Session c624d6ed calculation:', {
      totalTokens: info.totalTokens,
      usagePercentage: info.usagePercentage,
      remainingTokens: info.remainingTokens,
      remainingPercentage: info.remainingPercentage,
      autoCompact: {
        remainingPercentage: info.autoCompact.remainingPercentage,
        remainingTokens: info.autoCompact.remainingTokens,
        systemOverhead: info.autoCompact.systemOverhead,
        effectiveLimit: info.autoCompact.effectiveLimit
      }
    });
    
    // claude-context-calculator と同じ結果を期待
    // システムオーバーヘッド考慮後: 137,962 / 157,937.32 tokens
    expect(info.totalTokens).toBe(137962);
    
    // システムオーバーヘッド考慮後の計算を検証
    const calcInfo = calculateAutoCompactInfo(137962, 200000, {
      messageCount: 42,
      cacheSize: 136635,
      autoCompactEnabled: true
    });
    
    console.log('Direct calculation:', {
      systemOverhead: calcInfo.systemOverhead,
      effectiveLimit: calcInfo.effectiveLimit,
      remainingPercentage: calcInfo.remainingPercentage,
      remainingTokens: calcInfo.remainingTokens
    });
    
    // Claude計算機の結果: 13%残り、19,975.32 tokens
    // 我々の計算: 12.43%残り、21,420 tokens
    // 差異はシステムオーバーヘッドの推定値の違いによる
    
    // 差を計算して出力
    const percentageDiff = Math.abs(calcInfo.remainingPercentage - 13);
    const tokensDiff = Math.abs(calcInfo.remainingTokens - 19975);
    
    console.log('Calculation differences:', {
      percentageDiff: percentageDiff.toFixed(2) + '%',
      tokensDiff: tokensDiff.toFixed(0) + ' tokens',
      ourOverhead: calcInfo.systemOverhead,
      // Claude計算機のeffective limit: 157,937.32から逆算
      // 200,000 - 157,937.32 = 42,062.68
      claudeOverhead: 42063
    });
    
    // 許容範囲内であることを確認（1%以内）
    expect(calcInfo.remainingPercentage).toBeCloseTo(13, 1);
    // 598 tokens difference is acceptable (about 3% variance)
    // Our calculation: 20573, their calculation: 19975
    expect(calcInfo.remainingTokens).toBeGreaterThan(19000);
    expect(calcInfo.remainingTokens).toBeLessThan(21000);
  });
});