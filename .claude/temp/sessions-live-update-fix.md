# SessionsLiveView 自動更新問題の調査と修正

## 問題
`npx cccontext sessions --live` で "Auto-refreshing every 1s" と表示されるが、実際には最新の状態に更新されない。

## 原因分析

1. **基本的な実装は正しい**：
   - `startAutoRefresh` が正しく呼ばれている
   - `updateSessions` が1秒ごとに実行されている
   - `render()` も呼ばれている

2. **可能性のある原因**：
   - ファイルシステムのキャッシュ
   - セッションデータの変更検知
   - 描画の最適化による更新のスキップ

## デバッグ方法

```bash
# デバッグモードで実行
npx cccontext sessions --live --debug
```

これにより以下の情報が表示されます：
- `[DEBUG] updateSessions called, found X files`
- `[DEBUG] View updated with Y sessions`

## 修正提案

### 1. 強制的な画面更新
blessed の screen.render() が最適化により更新をスキップしている可能性があります。

### 2. データの差分チェック
現在は毎秒全てのファイルを読み直しているため、効率的ではありません。

### 3. ファイル変更イベントの活用
現在は `watcher.on('session-updated')` などのイベントも登録されていますが、自動更新と重複しています。

## 推奨される使用方法

1. **イベント駆動モードの使用**（推奨）:
   ```bash
   npx cccontext sessions --live --enhanced
   ```
   これは `EnhancedSessionsManager` を使用し、より効率的なキャッシュとイベント駆動の更新を提供します。

2. **デバッグモードでの確認**:
   ```bash
   npx cccontext sessions --live --debug
   ```
   更新が実際に行われているかを確認できます。

## 今後の改善点

1. **差分更新の実装**: セッションデータが実際に変更された場合のみ画面を更新
2. **キャッシュの最適化**: ファイル読み込みのキャッシュを実装
3. **イベント駆動への完全移行**: ポーリングベースの更新を廃止し、ファイル変更イベントのみに依存