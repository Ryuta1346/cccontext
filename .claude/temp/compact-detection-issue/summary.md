# /compact 検出問題の調査結果

## 問題
`/compact` を実行しても `npx cccontext` の表示に反映されない

## 調査結果

### ✅ ファイル変更検出は正常に動作
- ファイルサイズの減少は正しく検出される
- 3つの書き込み方法すべてで検出可能：
  1. 直接上書き
  2. アトミック置換（一時ファイル→リネーム）
  3. トランケート＆書き込み

### ❌ トークン数の再計算に問題
- セッションファイルの再読み込みは行われているが、トークン数が正しく計算されない
- 原因：実際のClaude Codeセッションファイルのフォーマットと、パーサーの期待するフォーマットに差異がある可能性

## 実際のセッションファイル形式
```json
{
  "message": {
    "role": "assistant",
    "usage": {
      "input_tokens": 4,
      "output_tokens": 3,
      "cache_creation_input_tokens": 2657,
      "cache_read_input_tokens": 13669
    }
  }
}
```

## 推奨される修正

1. **session-watcher.mjs の検出閾値を下げる**
   - 現在：10KB → 推奨：5KB
   - 小さなセッションでも確実に検出

2. **デバウンシング設定の調整**
   - stabilityThreshold: 200ms → 500ms
   - より確実なファイル書き込み完了を待つ

3. **トークン計算ロジックの改善**
   - `/compact` 後の新しいフォーマットに対応
   - cache_read_input_tokens なども含めた総計算

4. **明示的な compact 検出**
   - セッション内容に「Previous conversation compacted」などの特定メッセージを検出
   - 検出時に全データの再計算を強制