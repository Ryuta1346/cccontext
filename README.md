# CCContext - Claude Code Context Monitor

リアルタイムでClaude Codeのコンテキスト使用量を監視するツールです。ccusageと同様に、Claude Codeとは独立して動作し、JSONLログファイルを監視してセッションごとのトークン使用量とコストを表示します。

## 特徴

- 🔍 **リアルタイム監視**: Claude Codeの実行中にコンテキスト使用量をライブで追跡
- 📊 **セッション別管理**: 各セッションのトークン使用量、コスト、残量を個別に表示
- ⚠️ **警告機能**: コンテキスト使用量が80%、90%、95%に達すると警告
- 💰 **コスト計算**: モデル別の料金でリアルタイムにコストを計算
- 🎯 **非侵入的**: Claude Code本体に影響を与えず、JSONLログを読み取るだけ

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
npm install -g cccontext
cccontext sessions
```

### ローカル開発

```bash
git clone https://github.com/yourusername/cccontext.git
cd cccontext
npm install
npm link  # グローバルにリンク
```

## 使用方法

### リアルタイム監視

最新のアクティブセッションを自動検出して監視：

```bash
cccontext
# または
cccontext monitor
cccontext monitor --live
```

特定のセッションを監視：

```bash
cccontext monitor --session <session-id>
```

### セッション一覧

最近のセッションを表示：

```bash
cccontext sessions
cccontext sessions --limit 20  # 20件表示
cccontext sessions --live      # ライブビューモード
```

## コマンドラインオプション

### `cccontext` （デフォルト）
最新のアクティブセッションをリアルタイム監視します。

### `cccontext monitor`
Claude Codeのコンテキスト使用量を監視します。

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `-l, --live` | ライブ監視モード | true |
| `-s, --session <id>` | 特定のセッションIDを監視 | - |

### `cccontext sessions`
最近のClaude Codeセッションを一覧表示します。

| オプション | 説明 | デフォルト |
|------------|------|------------|
| `-l, --limit <number>` | 表示するセッション数 | 10 |
| `--live` | ライブビューモード（自動更新） | false |

## 表示例

### ライブモニター

```
╭─ Claude Code Context Monitor ─────────────────────────╮
│ Real-time context usage tracking for Claude Code      │
╰───────────────────────────────────────────────────────╯

┌ Session Info ─────────────────────────────────────────┐
│                                                       │
│ Session: 4ffe7e4f-5d3e-4b...                        │
│ Model: Claude Opus 4                                  │
│ Started: 15m ago                                      │
└───────────────────────────────────────────────────────┘

┌ Context Usage ────────────────────────────────────────┐
│                                                       │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░ 30% (60k/200k)│
│                                                       │
│ Remaining: 140k tokens (70.0%)                        │
│                                                       │
└───────────────────────────────────────────────────────┘

┌ Latest Turn ──────────────────────────────────────────┐
│                                                       │
│ Input:  2.5k tokens                                   │
│ Output: 1.8k tokens                                   │
│ Cache:  5.2k tokens (read)                           │
│ Total:  4.3k tokens (2.15% of window)                │
└───────────────────────────────────────────────────────┘

┌ Session Totals ───────────────────────────────────────┐
│                                                       │
│ Turns: 15                                             │
│ Total Tokens: 60k                                     │
│ Cost: $1.23                                          │
│ Avg/Turn: 4k                                         │
│ Est. Remaining Turns: 35                              │
└───────────────────────────────────────────────────────┘

[Live] Watching for updates... (q to exit, r to refresh)
```

### セッション一覧

```
Active Sessions (Last 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1. 4ffe7e4f [███░░░░░░░] 30.0% | Claude Opus 4 | 15 turns | 15m ago
 2. 7963885d [█████░░░░░] 50.0% | Claude Opus 4 | 75 turns | 2h ago
 3. fb512f58 [████████░░] 80.0% | Claude Opus 4 | 146 turns | 5h ago
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total sessions: 3
```

## 仕組み

1. Claude Codeは `~/.claude/projects/` にJSONL形式でセッションログを保存します
2. Gavrriはこれらのファイルを監視し、新しいメッセージが追加されるとリアルタイムで解析します
3. トークン使用量、コスト、コンテキスト使用率を計算して表示します
4. Claude Code本体には一切触れず、完全に独立して動作します

## 対応モデル

- Claude 3 Opus
- Claude Opus 4
- Claude 3.5 Sonnet
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
cccontext monitor --help
cccontext sessions --help
```

### 必要な権限

- `~/.claude/projects/` ディレクトリへの読み取りアクセス
- JSONLファイルの読み取り権限

### システム要件

- Node.js 18.0.0 以上
- macOS, Linux, Windows対応

## ライセンス

MIT

## 謝辞

このプロジェクトは[ccusage](https://github.com/ryoppippi/ccusage)のコンセプトに大きく影響を受けています。