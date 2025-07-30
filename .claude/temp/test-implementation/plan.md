# テスト実装計画

## 対象モジュール
1. context-tracker.mjs - コンテキスト使用量の計算ロジック
2. session-watcher.mjs - セッション監視とメッセージ処理
3. usage-calculator.mjs - トークン計算とコスト計算

## テストケース

### context-tracker.mjs
- コンテキストウィンドウサイズの取得
- セッション更新と使用率計算
- 警告レベルの判定
- 残りトークン数の計算
- セッション情報のフォーマット

### session-watcher.mjs  
- JSONLファイルの読み込み
- メッセージの処理とトークン集計
- ファイル変更の検知
- セッションデータの管理

### usage-calculator.mjs
- トークン数の集計
- コスト計算
- 平均トークン数の計算
- 残りターン数の推定

## テストフレームワーク
Node.js標準のテストランナーを使用（node:test）