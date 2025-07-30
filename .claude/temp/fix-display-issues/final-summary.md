# cccontext 文字化け問題の修正

## 実施した修正

### 1. blessedスクリーンの設定
- `fullUnicode: true` オプションを追加（sessions-live-view.mjs, live-view.mjs）
- Unicode文字の正しい表示をサポート

### 2. テーブルウィジェットの設定変更
- `tags: false` に変更 - タグ処理によるUnicode文字の誤解釈を防ぐ
- インタラクティブモードとキーボードナビゲーションを有効化

### 3. 色付けの削除
- テーブル内のデータからchalkによる色付けを削除
- ヘッダー、セッションID、使用率、モデル名など全ての項目で色を削除
- formatUsageメソッドでASCII文字のみを使用（█→#、░→-）

### 4. 特殊文字の削除
- ヘッダーのボックス描画文字を簡素化（╭╰│→+|-）
- サマリー情報からも色付けを削除

## 現在の状況

上記の修正により、blessedライブラリ側の制限によるUnicode文字の表示問題を最小限に抑えています。

## 追加の対策案

もし引き続き文字化けが発生する場合：

1. **環境変数の設定**
   ```bash
   export LANG=ja_JP.UTF-8
   export LC_ALL=ja_JP.UTF-8
   npx cccontext sessions --live
   ```

2. **代替ライブラリの検討**
   - ink（React for CLI）
   - blessed-contrib
   - cli-table3（静的なテーブル表示）

3. **カスタム実装**
   - blessedのboxウィジェットを使用して手動でテーブルを描画
   - ANSI エスケープシーケンスを直接使用

現時点では、blessedのテーブルウィジェットのUnicode処理に関する制限が主な原因と考えられます。