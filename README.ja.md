# CCContext - Claude Code Context Monitor

> 📖 **他の言語で読む**: [English](./README.md) | [中文](./README.zh.md) | [한국어](./README.ko.md) | [Español](./README.es.md)

リアルタイムでClaude Codeのコンテキスト使用量を監視するツールです。Claude Codeとは独立して動作し、JSONLログファイルを監視してセッションごとのトークン使用量とコストを表示します。

## 目的

CCContextは、Claude Codeユーザーがコンテキスト消費をリアルタイムで可視化することで、AIアシスタントの潜在能力を最大限に引き出すことを可能にします。Claude Code本体から独立して動作するため、作業を妨げることなく、予期しないコンテキスト枯渇を防ぎ、継続的で高品質なAIインタラクションを維持できます。

**コアバリュー:**
- 🚀 **作業中断の防止**: コンテキスト使用量を事前監視し、予期しないAuto-Compact発動による作業フローの中断を回避
- 💡 **AI性能の最適化**: コンテキストを効果的に管理し、新規セッション開始のタイミングを把握することでClaudeの応答品質を維持
- 💰 **コスト管理**: キャッシュトークンの活用を含む、トークン消費とコストをリアルタイムで追跡し最適化
- 🎯 **予測的インサイト**: 高度な使用パターン分析により、Auto-Compact発動タイミング予測
- 🔄 **セッション管理の高度化**: 複数の並行セッションを個別追跡とライブ監視で効率的に管理

## 重要な注意事項

- **算出値について**: 本ツールが表示するトークン使用量、コスト、Auto-Compact発動タイミングなどの算出結果は、cccontextが独自に計算した参考値です。Claude Code本体の算出結果と必ずしも一致しない場合があります。
- **実装について**: このツールのほぼすべてのコードは、Claude Codeによって実装されました。

## 特徴

- 🔍 **リアルタイム監視**: Claude Codeの実行中にコンテキスト使用量をライブで追跡
- 📊 **セッション別管理**: 各セッションのトークン使用量、コスト、残量を個別に表示
- ⚠️ **警告機能**: コンテキスト使用量が一定値に達すると警告
- 💰 **コスト計算**: モデル別の料金でリアルタイムにコストを計算
- 🎯 **非侵入的**: Claude Code本体に影響を与えず、JSONLログを読み取るだけ
- 🤖 **Auto-Compact追跡**: Claude CodeのAuto-Compact発動までの残量を表示

## インストール

### npxで直接実行（推奨）

インストール不要で直接実行できます：

```bash
npx cccontext
npx cccontext sessions
npx cccontext monitor --live
```

### グローバルインストール

```bash
# pnpmを使用
pnpm add -g cccontext

# npmを使用する場合
npm install -g cccontext

# 実行
cccontext sessions
```

## 使用方法

### リアルタイム監視

最新のアクティブセッションを自動検出して監視：

```bash
npx cccontext
```

### セッション選択

セッション一覧から番号で選択して監視：

```bash
# セッション一覧を表示して選択
npx cccontext --list

# 番号で直接指定（例: 2番目のセッション）
npx cccontext --session 2
```

### セッション一覧

最近のセッションを表示：

```bash
npx cccontext sessions
npx cccontext sessions --limit 20  # 20件表示
npx cccontext sessions --live      # ライブビューモード
```

### モニターコマンド

特定セッションを監視：

```bash
npx cccontext monitor
npx cccontext monitor --session 2  # 2番目のセッションを監視
```

### その他のオプション

```bash
# セッションキャッシュをクリア
npx cccontext sessions --clear-cache

# デバッグモード
npx cccontext sessions --debug
```

## コマンドラインオプション

### `cccontext` （デフォルト）
最新のアクティブセッションをリアルタイム監視します。

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--list` | セッション一覧を表示して選択 | false |
| `--session <number>` | セッション番号で直接指定 | - |
| `--version` | バージョン情報を表示 | - |
| `--help` | ヘルプを表示 | - |

### `cccontext monitor`
Claude Codeのコンテキスト使用量を監視します。

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--live` | ライブモニタリングモード | true |
| `--session <number>` | 特定のセッションを番号で指定 | - |

### `cccontext sessions`
最近のClaude Codeセッションを一覧表示します。

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `--limit <number>` | 表示するセッション数 | 10 |
| `--live` | ライブビューモード（自動更新） | false |
| `--clear-cache` | セッションキャッシュをクリア | false |
| `--debug` | デバッグモード | false |

Auto-Compact表示：
- `until 65.0%`: 通常 - Auto-Compact発動まで65%の余裕
- `until 45.0%`: 通常 - Auto-Compact発動まで45%の余裕
- `⚠until 15.0%`: 警告 - Auto-Compact発動まで15%
- `!until 5.0%`: 危険 - まもなくAuto-Compact発動
- `ACTIVE`: Auto-Compact発動中

## Auto-Compact監視について

Claude CodeはコンテキストWindow使用量が一定値に達すると自動的にAuto-Compactを実行し、会話を圧縮します。CCContextは実際のClaude Codeの動作に合わせた計算方法で、正確なAuto-Compact発動タイミングを予測します。

### 計算方法
CCContextは、Claude Codeと同じように、総メッセージ数に基づいてコンテキスト使用量を計算します。これにより、実際のAuto-Compact発動タイミングを正確に予測できます。

### 警告レベル
- **通常** (グレー): Auto-Compactまで30%以上の余裕
- **注意** (青): Auto-Compactまで15-30%
- **警告** (黄): Auto-Compactまで5-15%
- **危険** (赤): Auto-Compactまで5%未満
- **発動中** (赤・強調): Auto-Compactが発動

### 表示例
```
# 余裕がある場合
Auto-compact: at 92% (until 65.0%)

# 警告レベル
Auto-compact: at 92% (⚠until 8.5%)

# 危険レベル
Auto-compact: at 92% (!until 2.5%)

# 発動中
AUTO-COMPACT ACTIVE
```

## 対応モデル

- Claude Opus 4.6
- Claude Opus 4.5
- Claude Opus 4.1
- Claude Opus 4
- Claude 3 Opus
- Claude Sonnet 4.5
- Claude Sonnet 4
- Claude Sonnet 3.7
- Claude 3.5 Sonnet
- Claude Haiku 4.5
- Claude 3.5 Haiku
- Claude 3 Haiku

## その他の情報

### バージョン確認

```bash
cccontext --version
```

### ヘルプ

```bash
cccontext --help
cccontext sessions --help
```

### 必要な権限

- `~/.claude/projects/` ディレクトリへの読み取りアクセス
- JSONLファイルの読み取り権限

### システム要件

- Node.js 22.0.0 以上
- macOS, Linux, Windows対応

## ライセンス

MIT

## 謝辞

このプロジェクトは[ccusage](https://github.com/ryoppippi/ccusage)のコンセプトに大きく影響を受けています。
