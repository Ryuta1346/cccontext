# TDD（テスト駆動開発）ガイドライン

このドキュメントは、t-wadaの推奨するTDD方針に基づいた、cccontextプロジェクトにおけるテスト駆動開発のガイドラインです。

## 基本原則

### 1. テストは仕様書である
- テストコードは実装の振る舞いを明確に記述する
- テスト名は「何をテストしているか」が一目でわかるようにする
- テストケースは実装の使い方の例となる

### 2. テストは設計を駆動する
- テストを書くことで、より良い設計に導かれる
- テストしやすいコードは、良い設計のコード
- 依存関係の少ない、疎結合な設計を促進する

### 3. テストはリファクタリングを安全にする
- 包括的なテストがあれば、安心してリファクタリングできる
- テストが通っている限り、既存の振る舞いが保証される

## Red-Green-Refactorサイクル

### 1. Red（失敗するテストを書く）
```javascript
// 例：新機能のテストを先に書く
it('should calculate average tokens per turn', () => {
  const calculator = new UsageCalculator();
  const result = calculator.calculateAverage(1000, 5);
  assert.equal(result, 200);
});
```

### 2. Green（テストを通す最小限の実装）
```javascript
// 最小限の実装でテストを通す
calculateAverage(totalTokens, turns) {
  return totalTokens / turns;
}
```

### 3. Refactor（コードを改善する）
```javascript
// テストが通ったまま、コードを改善
calculateAverage(totalTokens, turns) {
  if (turns === 0) return 0;
  return Math.round(totalTokens / turns);
}
```

## テスト戦略

### 三角測量
複数の具体例からパターンを見出す：
```javascript
it('should format tokens with k suffix', () => {
  assert.equal(formatTokens(1000), '1.0k');
  assert.equal(formatTokens(1500), '1.5k');
  assert.equal(formatTokens(999), '999');
});
```

### 明白な実装
シンプルで明白な実装から始める：
```javascript
// 最初は明白な実装
formatTokens(tokens) {
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'k';
  }
  return tokens.toString();
}
```

### 仮実装
まず固定値を返してテストを通す：
```javascript
// ステップ1: 仮実装
getContextWindow(model) {
  return 200000; // 仮の固定値
}

// ステップ2: 実際の実装に置き換える
getContextWindow(model) {
  const windows = {
    'claude-3-opus': 200000,
    'claude-2.0': 100000,
    // ...
  };
  return windows[model] || 200000;
}
```

## ベストプラクティス

### 1. AAA構造を使う
```javascript
it('should calculate context usage correctly', () => {
  // Arrange
  const tracker = new ContextTracker();
  const sessionData = createMockSessionData();
  
  // Act
  const result = tracker.updateSession(sessionData);
  
  // Assert
  assert.equal(result.totalTokens, 3000);
});
```

### 2. テストの独立性を保つ
```javascript
beforeEach(() => {
  // 各テストの前に新しいインスタンスを作成
  calculator = new UsageCalculator();
});

afterEach(() => {
  // 必要に応じてクリーンアップ
  calculator = null;
});
```

### 3. エッジケースをカバーする
```javascript
describe('Edge Cases', () => {
  it('should handle null input', () => {
    assert.doesNotThrow(() => calculator.process(null));
  });
  
  it('should handle empty array', () => {
    const result = calculator.process([]);
    assert.equal(result.length, 0);
  });
  
  it('should handle very large numbers', () => {
    const result = calculator.process(Number.MAX_SAFE_INTEGER);
    assert.ok(isFinite(result));
  });
});
```

### 4. テストヘルパーを活用する
```javascript
import { 
  createMockSessionData, 
  createMockMessage,
  withTempDir 
} from '../helpers/test-utils.mjs';

it('should process session correctly', async () => {
  await withTempDir(async (tempDir) => {
    const sessionData = createMockSessionData({
      model: 'claude-3-5-sonnet-20241022'
    });
    // テスト実行
  });
});
```

## チェックリスト

新機能を実装する際のTDDチェックリスト：

- [ ] 失敗するテストを書いた
- [ ] テストが失敗することを確認した
- [ ] 最小限の実装でテストを通した
- [ ] すべてのテストが通ることを確認した
- [ ] リファクタリングを行った
- [ ] エッジケースのテストを追加した
- [ ] エラーケースのテストを追加した
- [ ] テストの独立性を確認した
- [ ] テスト名が明確で理解しやすい
- [ ] AAA構造に従っている

## 実践例

### 新機能追加時のTDDフロー

1. **要件定義**
   ```
   「セッションの平均応答時間を計算する機能を追加」
   ```

2. **テストファースト**
   ```javascript
   // test/monitor/response-time.test.mjs
   it('should calculate average response time', () => {
     const calculator = new ResponseTimeCalculator();
     const messages = [
       { timestamp: '2025-01-01T00:00:00Z', role: 'user' },
       { timestamp: '2025-01-01T00:00:10Z', role: 'assistant' },
       { timestamp: '2025-01-01T00:00:20Z', role: 'user' },
       { timestamp: '2025-01-01T00:00:35Z', role: 'assistant' }
     ];
     
     const avgTime = calculator.calculateAverage(messages);
     assert.equal(avgTime, 12.5); // (10 + 15) / 2
   });
   ```

3. **最小実装**
   ```javascript
   // src/monitor/response-time-calculator.mjs
   export class ResponseTimeCalculator {
     calculateAverage(messages) {
       let total = 0;
       let count = 0;
       
       for (let i = 1; i < messages.length; i++) {
         if (messages[i].role === 'assistant' && 
             messages[i-1].role === 'user') {
           const userTime = new Date(messages[i-1].timestamp);
           const assistantTime = new Date(messages[i].timestamp);
           total += (assistantTime - userTime) / 1000;
           count++;
         }
       }
       
       return count > 0 ? total / count : 0;
     }
   }
   ```

4. **追加テスト**
   ```javascript
   it('should handle empty messages', () => {
     const calculator = new ResponseTimeCalculator();
     assert.equal(calculator.calculateAverage([]), 0);
   });
   
   it('should handle messages without pairs', () => {
     const calculator = new ResponseTimeCalculator();
     const messages = [
       { timestamp: '2025-01-01T00:00:00Z', role: 'user' },
       { timestamp: '2025-01-01T00:00:10Z', role: 'user' }
     ];
     assert.equal(calculator.calculateAverage(messages), 0);
   });
   ```

## リソース

- [t-wada/tdd-bc](https://github.com/t-wada/tdd-bc) - TDDブートキャンプ資料
- [テスト駆動開発](https://www.amazon.co.jp/dp/4274217884) - Kent Beck著、和田卓人訳
- [実践テスト駆動開発](https://www.amazon.co.jp/dp/4798124583) - Steve Freeman, Nat Pryce著