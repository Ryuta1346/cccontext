# CCContext API リファレンス

## 目次

1. [CLI Layer API](#cli-layer-api)
2. [Monitor Layer API](#monitor-layer-api)
3. [Display Layer API](#display-layer-api)
4. [データ型定義](#データ型定義)
5. [イベント仕様](#イベント仕様)
6. [設定パラメータ](#設定パラメータ)

---

## CLI Layer API

### `CCContextCLI` クラス

CCContextの主要なオーケストレータークラス。

#### コンストラクタ

```javascript
constructor()
```

**説明**: 各コンポーネントを初期化し、基本的なセットアップを行います。

**初期化されるコンポーネント**:
- `SessionWatcher`: ファイル監視
- `ContextTracker`: コンテキスト追跡
- `EnhancedSessionsManager`: セッション管理
- `UsageCalculator`: 使用量計算

#### メソッド

##### `monitorLive(options)`

```javascript
async monitorLive(options: MonitorOptions): Promise<void>
```

**説明**: リアルタイム監視モードを開始します。

**パラメータ**:
```typescript
interface MonitorOptions {
  live?: boolean;      // ライブモード（デフォルト: true）
  session?: string;    // 特定セッションID
}
```

**動作フロー**:
1. LiveViewを初期化
2. アクティブセッションを検索
3. イベントハンドラーを設定
4. セッション監視を開始

**例外**:
- アクティブセッションが見つからない場合、3秒後に終了

##### `showSessions(options)`

```javascript
async showSessions(options: SessionsOptions): Promise<void>
```

**説明**: セッション一覧を静的に表示します。

**パラメータ**:
```typescript
interface SessionsOptions {
  limit?: number;      // 表示件数（デフォルト: 10）
}
```

**出力形式**:
```
Active Sessions (Last 24h)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 1. 4ffe7e4f [███░░░░░░░] 30.0% | Claude Opus 4 | 15 turns | 15m ago
    └→ 実装している機能について詳しく教えて...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total sessions: 3
```

##### `showSessionsLive(options)`

```javascript
async showSessionsLive(options: SessionsLiveOptions): Promise<void>
```

**説明**: ライブ更新セッション一覧を表示します（レガシー実装）。

**パラメータ**:
```typescript
interface SessionsLiveOptions {
  limit?: number;      // 表示件数（デフォルト: 20）
  debug?: boolean;     // デバッグモード
}
```

##### `showSessionsLiveEnhanced(options)`

```javascript
async showSessionsLiveEnhanced(options: SessionsLiveOptions): Promise<void>
```

**説明**: 拡張ライブ更新セッション一覧を表示します（推奨）。

**特徴**:
- イベント駆動による効率的な更新
- バッチ処理による高いパフォーマンス
- デバッグモード対応

##### `cleanup()`

```javascript
cleanup(): void
```

**説明**: 全てのリソースをクリーンアップし、プロセスを終了します。

**処理内容**:
- View の破棄
- SessionsManager の破棄
- Watcher の停止
- プロセス終了

---

## Monitor Layer API

### `SessionWatcher` クラス

**継承**: `EventEmitter`

ファイルシステムの監視を担当するコアクラス。

#### コンストラクタ

```javascript
constructor()
```

**初期化される状態**:
- `projectsDir`: `~/.claude/projects`
- `sessions`: セッション情報マップ
- `watchers`: ファイルウォッチャーマップ
- `filePositions`: ファイル位置記録
- `cachedFiles`: ファイルキャッシュ

#### メソッド

##### `findActiveSession()`

```javascript
async findActiveSession(): Promise<ActiveSession | null>
```

**戻り値**:
```typescript
interface ActiveSession {
  sessionId: string;
  filePath: string;
}
```

**説明**: 最も最近更新されたセッションファイルを検索します。

##### `getAllJsonlFiles()`

```javascript
async getAllJsonlFiles(): Promise<string[]>
```

**説明**: プロジェクトディレクトリ内の全.jsonlファイルを取得します。

**最適化**:
- キャッシュ機能付き
- 再帰的ディレクトリスキャン

##### `startDirectoryWatch()`

```javascript
async startDirectoryWatch(): Promise<void>
```

**説明**: ディレクトリ全体の監視を開始します。

**監視イベント**:
- `add`: ファイル追加 → `session-added`
- `unlink`: ファイル削除 → `session-removed`
- `change`: ファイル変更 → `session-updated`

##### `watchSession(sessionId, filePath)`

```javascript
async watchSession(sessionId: string, filePath: string): Promise<void>
```

**説明**: 特定のセッションファイルを監視します。

**最適化機能**:
- 増分読み込み
- Compact操作検知
- 位置記録

##### `invalidateCache()`

```javascript
invalidateCache(): void
```

**説明**: ファイルキャッシュを無効化し、次回フルスキャンを強制します。

#### イベント

##### `session-data`

```javascript
emit('session-data', sessionData: SessionData)
```

**説明**: セッションデータが更新された時に発行。

##### `message`

```javascript
emit('message', {
  sessionId: string,
  data: MessageData,
  sessionData: SessionData
})
```

**説明**: 新しいメッセージが追加された時に発行。

##### `compact-detected`

```javascript
emit('compact-detected', {
  sessionId: string,
  filePath: string
})
```

**説明**: `/compact`操作が検知された時に発行。

### `ContextTracker` クラス

セッションのコンテキスト状態を追跡・計算するクラス。

#### メソッド

##### `updateSession(sessionData)`

```javascript
updateSession(sessionData: SessionData): ContextInfo
```

**戻り値**:
```typescript
interface ContextInfo {
  sessionId: string;
  model: string;
  modelName: string;
  contextWindow: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  usagePercentage: number;
  remainingTokens: number;
  remainingPercentage: number;
  totalCost: number;
  turns: number;
  averageTokensPerTurn: number;
  estimatedRemainingTurns: number;
  warningLevel: 'normal' | 'warning' | 'severe' | 'critical';
  startTime: Date;
  lastUpdate: Date;
  latestPrompt?: string;
  latestTurn?: {
    input: number;
    output: number;
    cache: number;
    total: number;
    percentage: number;
  };
}
```

##### `getContextWindow(model)`

```javascript
getContextWindow(model: string): number
```

**説明**: モデル別のコンテキストウィンドウサイズを取得。

**対応モデル**:
- Claude 3 Opus: 200,000
- Claude Opus 4: 200,000
- Claude 3.5 Sonnet: 200,000
- Claude 3.5 Haiku: 200,000
- Claude 3 Haiku: 200,000

##### `formatContextInfo(info)`

```javascript
formatContextInfo(info: ContextInfo): FormattedContextInfo
```

**戻り値**:
```typescript
interface FormattedContextInfo {
  session: string;           // 短縮セッションID
  model: string;            // モデル表示名
  usage: string;            // 使用率（"50.1%"）
  tokens: string;           // トークン数（"100k/200k"）
  remaining: string;        // 残りトークン（"100k"）
  cost: string;            // コスト（"$1.23"）
  turns: number;           // ターン数
  avgTokensPerTurn: string; // 平均トークン（"4k"）
  estRemainingTurns: string; // 推定残りターン（"35" or "∞"）
  warningLevel: string;     // 警告レベル
  duration: string;         // 経過時間（"1h 30m"）
  latestPrompt: string;     // 最新プロンプト（切り詰め）
}
```

### `UsageCalculator` クラス

使用量とコストの計算を担当するユーティリティクラス。

#### メソッド

##### `calculateCost(usage, model)`

```javascript
calculateCost(usage: Usage, model: string): CostResult
```

**パラメータ**:
```typescript
interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}
```

**戻り値**:
```typescript
interface CostResult {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  totalTokens: number;
}
```

**料金計算**:
- キャッシュトークンは入力トークンの10%として計算
- USD per 1M tokens基準

##### `calculateSessionTotals(messages, model)`

```javascript
calculateSessionTotals(messages: Message[], model: string): SessionTotals
```

**戻り値**:
```typescript
interface SessionTotals {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalTokens: number;
  totalCost: number;
  turns: number;
  averageTokensPerTurn: number;
}
```

##### `formatTokens(tokens)`

```javascript
formatTokens(tokens: number): string
```

**フォーマット例**:
- `1500` → `"1.5k"`
- `1500000` → `"1.5M"`
- `500` → `"500"`

##### `formatCost(cost)`

```javascript
formatCost(cost: number): string
```

**フォーマット**: `$1.23`

### `SessionCache` クラス

効率的なセッションデータキャッシュシステム。

#### メソッド

##### `parseAndCacheSession(filePath)`

```javascript
async parseAndCacheSession(filePath: string): Promise<CachedSessionData | null>
```

**戻り値**:
```typescript
interface CachedSessionData {
  sessionId: string;
  model: string;
  modelName: string;
  turns: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheTokens: number;
  totalCost: number;
  latestPrompt: string;
  lastModified: Date;
  firstTimestamp: string;
  lastTimestamp: string;
  filePath: string;
  usagePercentage: number;
}
```

**キャッシュ戦略**:
1. ファイル変更チェック（mtime + size）
2. 変更なしの場合、キャッシュを返却
3. 変更ありの場合、パース実行

##### `hasFileChanged(filePath)`

```javascript
async hasFileChanged(filePath: string): Promise<boolean>
```

**判定基準**:
- `mtime`（最終更新時刻）の変化
- `size`（ファイルサイズ）の変化

##### `clearSession(filePath)`

```javascript
clearSession(filePath: string): void
```

**説明**: 特定セッションのキャッシュをクリアします。

### `EnhancedSessionsManager` クラス

**継承**: `EventEmitter`

高性能なセッション管理システム。

#### メソッド

##### `initialize()`

```javascript
async initialize(): Promise<void>
```

**初期化処理**:
1. ファイル監視イベントセットアップ
2. ディレクトリ監視開始
3. 初回セッション読み込み

##### `getAllSessions()`

```javascript
async getAllSessions(): Promise<EnhancedSessionData[]>
```

**戻り値**: 最終更新時刻で降順ソートされたセッションデータ配列

**パフォーマンス**:
- 並列読み込み（`Promise.all`）
- スマートキャッシュ活用

#### イベント

##### `sessions-loaded`

```javascript
emit('sessions-loaded', sessions: EnhancedSessionData[])
```

**説明**: 初回セッション読み込み完了時に発行。

##### `sessions-updated`

```javascript
emit('sessions-updated', sessions: EnhancedSessionData[])
```

**説明**: セッションデータ更新時に発行（バッチ処理後）。

---

## Display Layer API

### `LiveView` クラス

リアルタイム監視のTUIを提供するクラス。

#### メソッド

##### `init()`

```javascript
init(): void
```

**説明**: blessed.jsを使用してTUIを初期化します。

**UI構成**:
- ヘッダーボックス
- セッション情報ボックス
- コンテキスト使用量ボックス
- 最新ターンボックス
- 最新プロンプトボックス
- セッション合計ボックス
- ステータスバー

##### `updateContextInfo(info)`

```javascript
updateContextInfo(info: ContextInfo): void
```

**説明**: コンテキスト情報を受け取り、UIを更新します。

**更新内容**:
- プログレスバー
- 各種メトリクス
- 警告レベルに応じた色分け

##### `showError(message)`

```javascript
showError(message: string): void
```

**説明**: エラーメッセージをモーダルダイアログで表示します。

##### `destroy()`

```javascript
destroy(): void
```

**説明**: UIリソースをクリーンアップします。

### `SessionsLiveView` クラス

セッション一覧のTUIを提供するクラス。

#### メソッド

##### `updateSessions(sessionsData)`

```javascript
updateSessions(sessionsData: SessionData[]): void
```

**説明**: セッションデータを受け取り、テーブルを更新します。

**テーブル列**:
- Session: セッションID（短縮）
- Usage: 使用率プログレスバー
- Model: モデル名
- Turns: ターン数
- Cost: コスト
- Last Active: 最終活動時刻
- Latest Prompt: 最新プロンプト（切り詰め）

##### `startAutoRefresh(refreshCallback)`

```javascript
startAutoRefresh(refreshCallback: () => Promise<void>): void
```

**説明**: 1秒間隔での自動更新を開始します（レガシー機能）。

---

## データ型定義

### セッション関連

```typescript
interface SessionData {
  sessionId: string;
  messages: Message[];
  totalTokens: number;
  totalCost: number;
  turns: number;
  model: string | null;
  startTime: Date | null;
  latestUsage?: {
    input: number;
    output: number;
    cache: number;
    timestamp: string;
  };
  latestPrompt?: string;
  latestPromptTime?: string;
}

interface Message {
  timestamp: string;
  message: {
    role: 'user' | 'assistant';
    model?: string;
    content: string | ContentBlock[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
    };
  };
}

interface ContentBlock {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: string;
    media_type: string;
    data: string;
  };
}
```

### 設定関連

```typescript
interface ModelPricing {
  input: number;    // USD per 1M tokens
  output: number;   // USD per 1M tokens
  name: string;     // Display name
}

interface ModelConfig {
  [modelId: string]: ModelPricing;
}

const PRICING: ModelConfig = {
  'claude-opus-4-20250514': {
    input: 15.00,
    output: 75.00,
    name: 'Claude Opus 4'
  },
  // ...
};
```

---

## イベント仕様

### SessionWatcher イベント

| イベント名 | パラメータ | 説明 |
|------------|------------|------|
| `session-data` | `SessionData` | セッションデータ更新 |
| `message` | `{sessionId, data, sessionData}` | 新メッセージ追加 |
| `session-added` | `{sessionId, filePath}` | セッションファイル追加 |
| `session-removed` | `{sessionId, filePath}` | セッションファイル削除 |
| `session-updated` | `{sessionId, filePath}` | セッションファイル更新 |
| `compact-detected` | `{sessionId, filePath}` | Compact操作検知 |
| `error` | `{sessionId, error}` | エラー発生 |

### EnhancedSessionsManager イベント

| イベント名 | パラメータ | 説明 |
|------------|------------|------|
| `sessions-loaded` | `EnhancedSessionData[]` | 初回読み込み完了 |
| `sessions-updated` | `EnhancedSessionData[]` | セッション更新 |

---

## 設定パラメータ

### 環境変数

| 変数名 | 説明 | デフォルト |
|--------|------|-----------|
| `DEBUG` | デバッグモード有効化 | `0` |
| `SESSION_WATCHER_DEBUG` | SessionWatcher詳細ログ | `0` |
| `LOG_LEVEL` | ログレベル | `info` |

### chokidar設定

```javascript
const watcherOptions = {
  persistent: true,           // プロセス維持
  ignoreInitial: true,       // 初期スキャン無視
  followSymlinks: false,     // シンボリックリンク無視
  depth: 10,                 // 最大階層深度
  awaitWriteFinish: {
    stabilityThreshold: 500, // 書き込み安定化待機時間
    pollInterval: 50         // ポーリング間隔
  }
};
```

### blessed.js UI設定

```javascript
const screenOptions = {
  smartCSR: true,         // 効率的なレンダリング
  fullUnicode: true,      // Unicode文字対応
  title: 'Claude Code Context Monitor'
};
```

---

## 使用例

### 基本的な使用法

```javascript
import { CCContextCLI } from './src/cli.mjs';

const cli = new CCContextCLI();

// リアルタイム監視
await cli.monitorLive({ live: true });

// セッション一覧
await cli.showSessions({ limit: 20 });

// 拡張ライブセッション一覧
await cli.showSessionsLiveEnhanced({ 
  limit: 30, 
  debug: true 
});
```

### プログラマティック使用

```javascript
import { SessionWatcher } from './src/monitor/session-watcher.mjs';
import { ContextTracker } from './src/monitor/context-tracker.mjs';

const watcher = new SessionWatcher();
const tracker = new ContextTracker();

// イベントリスナー設定
watcher.on('session-data', (sessionData) => {
  const contextInfo = tracker.updateSession(sessionData);
  console.log('Context usage:', contextInfo.usagePercentage);
});

// アクティブセッション監視開始
const activeSession = await watcher.findActiveSession();
if (activeSession) {
  await watcher.watchSession(activeSession.sessionId, activeSession.filePath);
}
```

### カスタムフォーマッター

```javascript
import { UsageCalculator } from './src/monitor/usage-calculator.mjs';

const calculator = new UsageCalculator();

// カスタムフォーマット
function formatSessionSummary(session) {
  return {
    id: session.sessionId.substring(0, 8),
    usage: calculator.formatTokens(session.totalTokens),
    cost: calculator.formatCost(session.totalCost),
    efficiency: (session.totalTokens / session.turns).toFixed(0) + ' tokens/turn'
  };
}
```

このAPIリファレンスにより、CCContextの各コンポーネントを効果的に活用し、カスタマイズや拡張を行うことができます。