# テスト実装チェックリスト

## 現在のテストカバレッジ状況

### ✅ 実装済みテスト

#### Core機能
- [x] **ContextTracker** (`test/context-tracker.test.mjs`)
  - 基本的なコンテキスト計算
  - 警告レベルの判定
  - セッション管理
  - エラーケース（invalid data, malformed usage, overflow）

- [x] **SessionWatcher** (`test/session-watcher.test.mjs`)
  - ファイル検索・読み込み
  - メッセージ処理
  - イベント発行
  - エラーケース（non-existent dir, malformed JSONL, file errors）

- [x] **UsageCalculator** (`test/usage-calculator.test.mjs`)
  - コスト計算
  - トークンフォーマット
  - セッション統計
  - エラーケース（invalid usage, edge cases, extreme values）

#### UI機能
- [x] **LiveView** (`test/display/live-view.test.mjs`)
  - 表示フォーマット関数
  - プログレスバー生成
  - 警告メッセージ
  - エラーケース（ロジック部分のみ）

- [x] **SessionsLiveView** (`test/display/sessions-live-view.test.mjs`)
  - セッション一覧フォーマット
  - テーブルデータ生成
  - 自動更新機能
  - エラーケース（ロジック部分のみ）

#### CLI機能
- [x] **CLI** (`test/cli.test.mjs`)
  - コマンドライン引数パース
  - ヘルプ表示
  - バージョン表示
  - エラーケース（unknown commands, invalid options）

#### テストユーティリティ
- [x] **Test Helpers** (`test/helpers/test-utils.mjs`)
  - モックファイルシステム
  - モックタイマー
  - モックイベントエミッター
  - データファクトリー関数

### ❌ 未実装・改善が必要なテスト

#### 統合テスト
- [ ] End-to-Endテスト（実際のClaude Codeセッションのシミュレーション）
- [ ] 複数セッション同時監視のテスト
- [ ] ライブモニタリングの統合テスト

#### UI統合テスト
- [ ] BlessedベースのUIの実際の描画テスト
- [ ] キーボード入力ハンドリングのテスト
- [ ] 画面リサイズ時の挙動テスト

#### パフォーマンステスト
- [ ] 大量のメッセージ処理時のパフォーマンス
- [ ] メモリリークのチェック
- [ ] ファイル監視の効率性

#### 非同期処理のテスト
- [ ] ファイル監視の並行処理
- [ ] エラー時のリトライ機構
- [ ] タイムアウト処理

## 推奨される追加テスト

### 1. モックを使用した統合テスト
```javascript
// test/integration/monitor-integration.test.mjs
import { MockFileSystem, MockTimer } from '../helpers/test-utils.mjs';

describe('Monitor Integration', () => {
  it('should monitor session updates in real-time', async () => {
    const fs = new MockFileSystem();
    const timer = new MockTimer();
    
    // セッションファイルのシミュレーション
    await fs.writeFile('/projects/test/session.jsonl', '');
    
    // 監視開始
    const watcher = new SessionWatcher(fs);
    await watcher.watchSession('session', '/projects/test/session.jsonl');
    
    // メッセージ追加のシミュレーション
    await fs.appendFile('/projects/test/session.jsonl', 
      JSON.stringify({ message: { role: 'user', ... } }) + '\n'
    );
    
    timer.tick(100); // ファイル変更検知の待機
    
    // アサーション
  });
});
```

### 2. スナップショットテスト
```javascript
// test/display/snapshot.test.mjs
describe('Display Snapshots', () => {
  it('should match session table snapshot', () => {
    const view = new SessionsLiveView();
    const sessions = createMockSessions();
    
    const tableData = view.formatTableData(sessions);
    
    // スナップショットとの比較
    assert.deepEqual(tableData, expectedSnapshot);
  });
});
```

### 3. プロパティベーステスト
```javascript
// test/properties/calculator.property.test.mjs
describe('Calculator Properties', () => {
  it('should always return non-negative costs', () => {
    const calculator = new UsageCalculator();
    
    for (let i = 0; i < 100; i++) {
      const usage = {
        input_tokens: Math.random() * 1000000,
        output_tokens: Math.random() * 1000000,
        cache_read_input_tokens: Math.random() * 1000000
      };
      
      const result = calculator.calculateCost(usage, 'any-model');
      assert.ok(result.totalCost >= 0);
    }
  });
});
```

## カバレッジ目標

現在のカバレッジ（推定）:
- 行カバレッジ: ~70%
- 分岐カバレッジ: ~60%
- 関数カバレッジ: ~80%

目標:
- 行カバレッジ: 90%以上
- 分岐カバレッジ: 80%以上
- 関数カバレッジ: 95%以上

## 実行コマンド

```bash
# 全テスト実行
npm test

# カバレッジ付きテスト実行
npm run test:coverage

# 特定のテストファイルのみ実行
node --test test/context-tracker.test.mjs

# Watchモードでテスト実行
node --test --watch
```

## 次のステップ

1. `npm run test:coverage` を実行して実際のカバレッジを確認
2. カバレッジレポートから未カバーの行を特定
3. 優先度の高い未カバー部分から順にテストを追加
4. 統合テストの実装
5. CI/CDパイプラインでのテスト自動実行の設定