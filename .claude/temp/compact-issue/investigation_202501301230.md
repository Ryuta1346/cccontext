# `/compact` コマンド実行時のContext Usage更新問題の調査結果

## 問題の概要

ユーザーから報告された問題：
- `/compact` コマンドを実行してもContext Usageが変わらない
- `npx cccontext sessions --live` で「Auto-refreshing every 1s」と表示されるが、実際には最新の状態に反映されない

## 調査結果

### 1. 根本原因の特定

#### SessionWatcher の増分読み込み方式の問題

`src/monitor/session-watcher.mjs` の `handleFileChange` メソッド（192行目）を調査した結果：

```javascript
async handleFileChange(sessionId, filePath) {
  try {
    const stats = await fs.promises.stat(filePath);
    const lastPosition = this.filePositions.get(sessionId) || 0;
    
    if (stats.size > lastPosition) {  // ← ここが問題
      // 新しいデータを読み込む
      // ...
    }
  } catch (error) {
    this.emit('error', { sessionId, error });
  }
}
```

**問題点**：
- ファイルサイズが `lastPosition` より大きい場合のみ新データを読み込む
- `/compact` コマンドはセッションを要約してファイルを置き換えるため、ファイルサイズが減少する可能性がある
- ファイルサイズが減少した場合、条件を満たさないため更新処理がスキップされる

### 2. `/compact` コマンドの動作

Web検索結果から判明した `/compact` の動作：
- 会話履歴を要約して重要なコンテキストを保持
- ファイル全体を圧縮された内容で置き換える
- コンテキストウィンドウの使用量を削減する

### 3. 現在の実装の問題点

1. **ファイル変更検知の不完全性**
   - 追記のみを想定した実装
   - ファイルの置換や圧縮を考慮していない

2. **SessionsLiveView の更新メカニズム**
   - `session-updated` イベントは発火する
   - しかし、SessionWatcher が新データを読み込まないため、表示が更新されない

### 4. EnhancedSessionsManager では正しく動作する理由

`src/monitor/enhanced-sessions-manager.mjs` の実装を確認：

```javascript
// セッションファイルが更新された時
this.watcher.on('session-updated', async ({ sessionId, filePath }) => {
  this.log(`Session updated: ${sessionId}`);
  this.cache.clearSession(filePath); // キャッシュをクリアして再読み込みを強制
  this.scheduleUpdate(filePath);
});
```

- ファイル更新時にキャッシュをクリア
- ファイル全体を再読み込み
- これにより `/compact` 後も正しく更新される

## 影響範囲

1. **影響を受ける機能**
   - `npx cccontext monitor --live`
   - `npx cccontext sessions --live`（--enhanced なし）

2. **影響を受けない機能**
   - `npx cccontext sessions --live --enhanced`
   - 静的な表示（`npx cccontext sessions`）

## 暫定対策

以下のコマンドを使用することで問題を回避できます：

```bash
# EnhancedSessionsManager を使用（正しく動作）
npx cccontext sessions --live --enhanced
```

## 恒久対策案

1. **SessionWatcher.handleFileChange の修正**
   - ファイルサイズの減少を検知
   - 大幅なサイズ変更時はファイル全体を再読み込み

2. **ファイル変更検知の改善**
   - mtimeやファイルハッシュを活用
   - より確実な変更検知メカニズムの実装

3. **テストケースの追加**
   - `/compact` シナリオのシミュレーション
   - ファイルサイズ減少時の動作確認

## 次のステップ

1. SessionWatcher の修正実装
2. テストケースの追加
3. 修正の動作確認
4. ドキュメントの更新（README に暫定対策を記載）

## 技術的詳細

### ファイル構造の例

通常のセッションファイル（JSONL形式）：
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"user","content":"Hello"}}
{"timestamp":"2025-01-01T00:00:01Z","message":{"role":"assistant","model":"claude-opus-4-20250514","usage":{"input_tokens":100,"output_tokens":200}}}
// ... 多数のメッセージ
```

`/compact` 後：
```json
{"timestamp":"2025-01-01T00:00:00Z","message":{"role":"system","content":"[Previous conversation summary]"}}
{"timestamp":"2025-01-01T00:10:00Z","message":{"role":"user","content":"Latest message"}}
// ... 要約されて行数が減少
```

この変更により、ファイルサイズが大幅に減少し、現在の実装では検知できない。

## 調査日時
2025年1月30日 12:30 JST