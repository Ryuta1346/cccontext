# バージョンアップ手順ガイド

## 1. セマンティックバージョニング

### バージョン番号の構成
- **MAJOR.MINOR.PATCH** (例: 1.1.1)
  - **MAJOR**: 破壊的変更がある場合
  - **MINOR**: 後方互換性のある機能追加
  - **PATCH**: 後方互換性のあるバグ修正

### バージョン判定基準

#### PATCH (1.1.1 → 1.1.2)
- バグ修正
- ドキュメントの修正
- 内部実装の改善（外部インターフェース変更なし）

#### MINOR (1.1.1 → 1.2.0)
- 新機能の追加
- 既存機能の拡張
- 非推奨APIの追加（削除はしない）

#### MAJOR (1.1.1 → 2.0.0)
- 破壊的変更
- APIの削除や変更
- Node.jsの最小バージョン変更

## 2. プレリリースチェックリスト

### 必須確認項目
```bash
# 1. ブランチの確認
git branch
# mainブランチまたはリリース用ブランチにいることを確認

# 2. 最新の変更を取得
git pull origin main

# 3. 依存関係の確認
pnpm install
pnpm audit

# 4. テストの実行
pnpm test
pnpm test:coverage

# 5. 型チェック
pnpm typecheck

# 6. リント＆フォーマット
pnpm check:all

# 7. ビルド確認
pnpm build

# 8. サイズチェック
pnpm size
```

### コードレビュー確認
- [ ] 新機能のテストが追加されている
- [ ] ドキュメントが更新されている
- [ ] CHANGELOGが準備されている
- [ ] 破壊的変更がある場合、マイグレーションガイドがある

## 3. バージョンアップ実行手順

### 3.1 バージョン番号の更新

```bash
# PATCHバージョンアップ
npm version patch

# MINORバージョンアップ
npm version minor

# MAJORバージョンアップ
npm version major

# プレリリース版
npm version prerelease --preid=beta
# 例: 1.1.1 → 1.1.2-beta.0
```

### 3.2 手動でバージョンを指定する場合

```bash
npm version 1.2.0
```

### 3.3 コミットメッセージのカスタマイズ

```bash
npm version patch -m "chore: release v%s"
```

## 4. リリースノート作成

### CHANGELOGの記載形式

```markdown
## [1.2.0] - 2025-01-13

### Added
- 新機能や追加されたもの

### Changed
- 既存機能の変更

### Deprecated
- 非推奨になった機能

### Removed
- 削除された機能

### Fixed
- バグ修正

### Security
- セキュリティ関連の修正
```

### コミットからリリースノートを生成

```bash
# 前回のタグから現在までの変更を表示
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# 詳細な変更履歴
git log $(git describe --tags --abbrev=0)..HEAD --pretty=format:"- %s (%h)"
```

## 5. GitHub Release作成手順

### 5.1 タグのプッシュ

```bash
# バージョンタグをプッシュ
git push origin main --tags
```

### 5.2 GitHub Release作成

1. GitHubリポジトリの「Releases」タブを開く
2. 「Draft a new release」をクリック
3. タグを選択（例: v1.2.0）
4. リリースタイトルを入力（例: v1.2.0 - Feature Update）
5. リリースノートを記載
6. プレリリースの場合は「This is a pre-release」にチェック
7. 「Publish release」をクリック

### 5.3 自動リリース（GitHub CLI使用）

```bash
# GitHub CLIをインストール済みの場合
gh release create v1.2.0 \
  --title "v1.2.0 - Feature Update" \
  --notes-file CHANGELOG.md \
  --target main
```

## 6. npm パッケージ公開手順

### 6.1 公開前の最終確認

```bash
# dry-runで確認
npm publish --dry-run

# パッケージ内容の確認
npm pack
tar -tzf cccontext-*.tgz
```

### 6.2 npmへの公開

```bash
# 通常公開
npm publish

# ベータ版の公開
npm publish --tag beta

# スコープ付きパッケージの公開
npm publish --access public
```

### 6.3 公開後の確認

```bash
# npmレジストリで確認
npm view cccontext

# 最新バージョンの確認
npm view cccontext version

# すべてのバージョンを表示
npm view cccontext versions
```

## 7. ロールバック手順

### 7.1 npmパッケージの非推奨化

```bash
# 特定バージョンを非推奨にする
npm deprecate cccontext@1.2.0 "Critical bug found, use 1.1.1 instead"
```

### 7.2 Gitでの対応

```bash
# タグの削除（ローカル）
git tag -d v1.2.0

# タグの削除（リモート）
git push origin --delete v1.2.0

# 以前のコミットに戻す
git revert <commit-hash>
git push origin main
```

### 7.3 緊急パッチリリース

```bash
# 1. 安定版に戻す
git checkout v1.1.1

# 2. ホットフィックスブランチ作成
git checkout -b hotfix/1.1.2

# 3. 修正を実施
# ... 修正作業 ...

# 4. パッチバージョンをリリース
npm version patch
git push origin hotfix/1.1.2 --tags

# 5. npmに公開
npm publish

# 6. mainにマージ
git checkout main
git merge hotfix/1.1.2
git push origin main
```

## 8. 自動化スクリプト

### リリーススクリプトの作成例

```bash
#!/bin/bash
# scripts/release.sh

set -e

echo "🚀 Starting release process..."

# 1. 確認
echo "Current version: $(node -p "require('./package.json').version")"
read -p "Enter new version (major/minor/patch): " VERSION_TYPE

# 2. テスト実行
echo "📋 Running tests..."
pnpm test
pnpm typecheck
pnpm check:all

# 3. ビルド
echo "🔨 Building..."
pnpm build

# 4. バージョンアップ
echo "📝 Updating version..."
npm version $VERSION_TYPE

# 5. プッシュ
echo "📤 Pushing to GitHub..."
git push origin main --tags

# 6. npm公開
echo "📦 Publishing to npm..."
npm publish

echo "✅ Release completed!"
```

### package.jsonへのスクリプト追加

```json
{
  "scripts": {
    "release:patch": "npm run check:all && npm run build && npm version patch && git push origin main --tags && npm publish",
    "release:minor": "npm run check:all && npm run build && npm version minor && git push origin main --tags && npm publish",
    "release:major": "npm run check:all && npm run build && npm version major && git push origin main --tags && npm publish"
  }
}
```

## 9. トラブルシューティング

### よくある問題と対処法

#### npm公開エラー
```bash
# 認証エラーの場合
npm login

# パッケージ名重複の場合
# package.jsonの"name"を変更またはスコープを追加

# 権限エラーの場合
npm whoami
npm owner ls cccontext
```

#### ビルドエラー
```bash
# キャッシュクリア
pnpm store prune
rm -rf node_modules
pnpm install

# dist削除
pnpm clean
pnpm build
```

#### Gitタグの競合
```bash
# ローカルタグの更新
git fetch --tags --force

# タグの確認
git tag -l
```

## 10. ベストプラクティス

### リリース頻度
- **PATCH**: 必要に応じて即座に
- **MINOR**: 2-4週間ごと
- **MAJOR**: 3-6ヶ月ごと（計画的に）

### コミュニケーション
1. 破壊的変更は事前にアナウンス
2. CHANGELOGを詳細に記載
3. マイグレーションガイドを提供
4. ユーザーフィードバックの収集

### 品質保証
- リリース前に必ずステージング環境でテスト
- 自動テストのカバレッジを80%以上に維持
- リリース後24時間は監視を強化

## 付録: コマンドクイックリファレンス

```bash
# バージョン確認
node -p "require('./package.json').version"

# プレリリース
npm version prerelease --preid=rc

# タグ一覧
git tag -l

# 特定タグのチェックアウト
git checkout tags/v1.1.0

# npmバージョン履歴
npm view cccontext versions --json

# 最新版へのアップデート促進
npm deprecate cccontext@"<1.2.0" "Please upgrade to v1.2.0 or higher"
```

---

最終更新: 2025年1月13日
作成者: Claude (AI Assistant)