# CCContext アーキテクチャ図・データフロー図

## 1. システム全体アーキテクチャ図

```
                    ┌─────────────────────────────────────────┐
                    │             CLI Interface               │
                    │                                         │
                    │  ┌─────────────┐ ┌─────────────────────┐ │
                    │  │ Commander   │ │   CCContextCLI      │ │
                    │  │ (.program)  │ │   (Orchestrator)    │ │
                    │  └─────────────┘ └─────────────────────┘ │
                    └─────────────────────────────────────────┘
                                        │
                                        │ (Events & Control)
                                        │
┌───────────────────────────────────────┼───────────────────────────────────────┐
│                                       │                                       │
│  ┌─────────────────────────────────────┼─────────────────────────────────────┐ │
│  │             Monitor Layer           │                                     │ │
│  │                                     │                                     │ │
│  │  ┌────────────────┐  ┌─────────────┼─────────────────┐                  │ │
│  │  │ SessionWatcher │  │ ContextTracker                │                  │ │
│  │  │   (Observer)   │  │   (Analyzer)                  │                  │ │
│  │  │                │  │                               │                  │ │
│  │  │ ┌─chokidar─────┤  │ ┌─session state calculation─┐ │                  │ │
│  │  │ ┌─file watch───┤  │ ┌─warning level detection───┐ │                  │ │
│  │  │ ┌─event emit───┤  │ ┌─context window management─┐ │                  │ │
│  │  └────────────────┘  └─────────────────────────────┘                  │ │
│  │                                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │                 Enhanced Sessions Manager                         │ │ │
│  │  │                     (Event-Driven)                               │ │ │
│  │  │  ┌─batch update─┐  ┌─parallel loading─┐  ┌─cache integration─┐  │ │ │
│  │  │  │ debouncing   │  │ Promise.all      │  │ smart invalidation│  │ │ │
│  │  │  └──────────────┘  └──────────────────┘  └───────────────────┘  │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  │  ┌────────────────┐                    ┌─────────────────────────────┐ │ │
│  │  │ SessionCache   │                    │      UsageCalculator        │ │ │
│  │  │ (Smart Cache)  │                    │   (Stateless Utility)       │ │ │
│  │  │                │                    │                             │ │ │
│  │  │ ┌─mtime check─┐ │                    │ ┌─model pricing─────────────┐ │ │ │
│  │  │ ┌─size check──┐ │                    │ ┌─token calculation─────────┐ │ │ │
│  │  │ ┌─parse cache─┐ │                    │ ┌─cost estimation───────────┐ │ │ │
│  │  └────────────────┘                    └─────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ (Processed Data)
                                        │
                    ┌─────────────────────────────────────────┐
                    │             Display Layer               │
                    │                                         │
                    │  ┌─────────────────┐ ┌─────────────────┐ │
                    │  │    LiveView     │ │ SessionsLiveView│ │
                    │  │   (Real-time)   │ │  (List Mode)    │ │
                    │  │                 │ │                 │ │
                    │  │ ┌─blessed.js───┐ │ │ ┌─blessed.js───┐ │ │
                    │  │ ┌─TUI rendering┐ │ │ ┌─table view───┐ │ │
                    │  │ ┌─progress bars┐ │ │ ┌─navigation───┐ │ │
                    │  └─────────────────┘ └─────────────────┘ │
                    └─────────────────────────────────────────┘
                                        │
                                        │ (User Interface)
                                        │
                                ┌───────────────┐
                                │     User      │
                                │  (Terminal)   │
                                └───────────────┘
```

## 2. データフロー図（リアルタイム監視）

```
┌─────────────────┐
│   Claude Code   │
│  (External)     │
└─────────────────┘
         │
         │ writes JSONL
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│            ~/.claude/projects/<project>/<session>.jsonl         │
│                        (File System)                           │
└─────────────────────────────────────────────────────────────────┘
         │
         │ file change detection
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        chokidar                                 │
│                    (File Watcher)                               │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    add      │  │   change    │  │       unlink           │  │
│  │   events    │  │   events    │  │       events           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ emit events
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SessionWatcher                              │
│                   (EventEmitter)                                │
│                                                                 │
│  Process:                                                       │
│  1. Detect file changes                                         │
│  2. Read incremental data (from last position)                 │
│  3. Parse JSONL lines                                          │
│  4. Update session state                                       │
│  5. Emit events                                                │
│                                                                 │
│  Events:                                                        │
│  • session-data                                                │
│  • message                                                     │
│  • session-added/removed/updated                               │
│  • compact-detected                                            │
└─────────────────────────────────────────────────────────────────┘
         │
         │ session data events
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLI (Orchestrator)                         │
│                                                                 │
│  Event Handlers:                                                │
│  • watcher.on('session-data', ...)                            │
│  • watcher.on('message', ...)                                 │
│  • watcher.on('error', ...)                                   │
│                                                                 │
│  Processing Flow:                                               │
│  1. Receive session data                                        │
│  2. Pass to ContextTracker                                     │
│  3. Get processed context info                                 │
│  4. Update UI                                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ raw session data
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ContextTracker                              │
│                    (State Manager)                              │
│                                                                 │
│  Processing:                                                    │
│  1. Calculate total tokens                                      │
│  2. Determine usage percentage                                  │
│  3. Calculate costs (via UsageCalculator)                      │
│  4. Assess warning levels                                      │
│  5. Generate context info object                               │
│                                                                 │
│  Dependencies:                                                  │
│  → UsageCalculator (for costs)                                 │
│  → CONTEXT_WINDOWS (for limits)                                │
└─────────────────────────────────────────────────────────────────┘
         │
         │ processed context info
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       LiveView                                  │
│                   (UI Renderer)                                 │
│                                                                 │
│  UI Components:                                                 │
│  • Header box                                                  │
│  • Session info box                                            │
│  • Context usage box (with progress bar)                      │
│  • Latest turn box                                             │
│  • Session totals box                                          │
│  • Status bar                                                 │
│                                                                 │
│  Rendering:                                                     │
│  1. Format data for display                                     │
│  2. Update blessed.js components                               │
│  3. Apply color coding based on warning levels                │
│  4. Render to terminal                                         │
└─────────────────────────────────────────────────────────────────┘
         │
         │ terminal output
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Terminal Display                            │
│                                                                 │
│  ╭─ Claude Code Context Monitor ──────────────────────╮        │
│  │ Real-time context usage tracking for Claude Code    │        │
│  ╰─────────────────────────────────────────────────────╯        │
│                                                                 │
│  ┌ Session Info ─────────────────────────────────────┐          │
│  │ Session: 4ffe7e4f-5d3e-4b...                    │          │
│  │ Model: Claude Opus 4                              │          │
│  │ Started: 15m ago                                  │          │
│  └───────────────────────────────────────────────────┘          │
│                                                                 │
│  [Progress bars, metrics, and real-time updates...]            │
└─────────────────────────────────────────────────────────────────┘
```

## 3. セッション一覧モードのデータフロー

```
┌─────────────────────────────────────────────────────────────────┐
│                File System Monitoring                           │
│                                                                 │
│  ~/.claude/projects/*/                                          │
│  ├── project1/session1.jsonl                                   │
│  ├── project1/session2.jsonl                                   │
│  ├── project2/session3.jsonl                                   │
│  └── ...                                                       │
└─────────────────────────────────────────────────────────────────┘
         │
         │ directory watch
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│               EnhancedSessionsManager                           │
│                 (Event-Driven)                                 │
│                                                                 │
│  Initialization:                                                │
│  1. Start directory watcher                                     │
│  2. Scan all existing .jsonl files                            │
│  3. Load session data in parallel                             │
│  4. Emit 'sessions-loaded' event                              │
│                                                                 │
│  Real-time Updates:                                             │
│  • On file add    → scheduleUpdate()                          │
│  • On file change → scheduleUpdate()                          │
│  • On file remove → clearCache() + emit update                │
│                                                                 │
│  Batch Processing (100ms debounce):                             │
│  1. Collect changed files                                       │
│  2. Process updates in parallel                                │
│  3. Emit 'sessions-updated' event                             │
└─────────────────────────────────────────────────────────────────┘
         │
         │ session file paths
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SessionCache                               │
│                    (Smart Cache)                                │
│                                                                 │
│  Cache Strategy:                                                │
│  1. Check file mtime + size                                    │
│  2. Return cached data if unchanged                            │
│  3. Parse file if changed:                                     │
│     • Read file content                                        │
│     • Parse JSONL lines (reverse order for efficiency)        │
│     • Extract: model, tokens, costs, prompts                  │
│     • Calculate usage percentage                               │
│     • Cache result                                             │
│                                                                 │
│  Optimizations:                                                 │
│  • Reverse parsing (latest data first)                        │
│  • mtime/size-based change detection                          │
│  • Batch processing support                                   │
└─────────────────────────────────────────────────────────────────┘
         │
         │ parsed session data
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Handler                              │
│                                                                 │
│  Event Listeners:                                               │
│  • 'sessions-loaded'  → initial display                       │
│  • 'sessions-updated' → incremental updates                   │
│                                                                 │
│  Processing:                                                    │
│  1. Receive session data array                                 │
│  2. Apply limit filter                                         │
│  3. Sort by lastModified (descending)                         │
│  4. Pass to SessionsLiveView                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ filtered & sorted sessions
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SessionsLiveView                              │
│                  (Table Renderer)                               │
│                                                                 │
│  Table Structure:                                               │
│  ┌──────────┬─────────┬───────┬───────┬────────┬─────────────┐   │
│  │ Session  │ Usage   │ Model │ Turns │ Cost   │ Last Active │   │
│  ├──────────┼─────────┼───────┼───────┼────────┼─────────────┤   │
│  │ 4ffe7e4f │ [████░] │ Opus4 │  15   │ $1.23  │    15m ago  │   │
│  │ 7963885d │ [███░░] │ Opus4 │  75   │ $4.56  │     2h ago  │   │
│  └──────────┴─────────┴───────┴───────┴────────┴─────────────┘   │
│                                                                 │
│  Features:                                                      │
│  • Keyboard navigation (↑↓)                                   │
│  • Real-time updates                                          │
│  • Progress bar visualization                                 │
│  • Unicode-aware text truncation                              │
│  • Summary statistics                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 4. エラーハンドリングフロー

```
┌─────────────────────────────────────────────────────────────────┐
│                      Error Sources                              │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  File System    │  │  JSON Parsing   │  │  Process Issues │  │
│  │                 │  │                 │  │                 │  │
│  │ • Permission    │  │ • Malformed     │  │ • Memory limits │  │
│  │ • File locked   │  │ • Incomplete    │  │ • Signal handling│  │
│  │ • Path invalid  │  │ • Encoding      │  │ • Resource leak │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ error events
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Multi-Level Error Handling                     │
│                                                                 │
│  Level 1: Component Level                                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  try {                                                  │    │
│  │    // risky operation                                   │    │
│  │  } catch (error) {                                      │    │
│  │    this.emit('error', { sessionId, error });          │    │
│  │    return fallback_value;                              │    │
│  │  }                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Level 2: Event-Based Error Propagation                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  this.watcher.on('error', ({ sessionId, error }) => {  │    │
│  │    this.view.showError(`Error: ${error.message}`);     │    │
│  │    // continue operation for other sessions             │    │
│  │  });                                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Level 3: Global Exception Handling                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  try {                                                  │    │
│  │    program.parse(process.argv);                         │    │
│  │  } catch (err) {                                        │    │
│  │    if (err.code?.startsWith('commander.')) {           │    │
│  │      process.exit(1);                                   │    │
│  │    } else {                                             │    │
│  │      throw err;                                         │    │
│  │    }                                                    │    │
│  │  }                                                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │
         │ error recovery
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Recovery Strategies                          │
│                                                                 │
│  • Graceful Degradation                                        │
│    - Skip problematic sessions, continue with others           │
│    - Show partial data with error indicators                   │
│    - Maintain core functionality                               │
│                                                                 │
│  • Resource Cleanup                                            │
│    - SIGINT/SIGTERM signal handling                           │
│    - Proper watcher disposal                                   │
│    - Memory cleanup on exit                                    │
│                                                                 │
│  • User Notification                                           │
│    - Error display in UI                                       │
│    - Status bar messages                                       │
│    - Logging for debugging                                     │
└─────────────────────────────────────────────────────────────────┘
```

## 5. キャッシュシステムの動作フロー

```
┌─────────────────────────────────────────────────────────────────┐
│                    Session File Request                         │
│                  (parseAndCacheSession)                         │
└─────────────────────────────────────────────────────────────────┘
         │
         │ file path
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Cache Lookup                                │
│                                                                 │
│  Key: sessionId (from filename)                                 │
│                                                                 │
│  Check Process:                                                 │
│  1. Get current file stats (mtime, size)                      │
│  2. Compare with cached stats                                  │
│  3. Determine if file changed                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         ├─────────────────┬─────────────────────┐
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Cache Hit     │ │   Cache Miss    │ │   File Changed  │
│                 │ │                 │ │                 │
│ • File unchanged│ │ • First request │ │ • mtime differs │
│ • Return cached │ │ • No cache entry│ │ • size differs  │
│   data          │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                 │                     │
         │                 ▼                     │
         │         ┌─────────────────────────────│─────────┐
         │         │        File Parsing              │
         │         │                                  │
         │         │  1. Read file content              │
         │         │  2. Split into JSONL lines         │
         │         │  3. Parse in reverse order         │
         │         │     (latest data first)            │
         │         │  4. Extract:                       │
         │         │     • Model information            │
         │         │     • Token counts                 │
         │         │     • Cost calculations            │
         │         │     • Latest prompts               │
         │         │     • Timestamps                   │
         │         │  5. Calculate usage percentage     │
         │         │  6. Store in cache                 │
         │         │  7. Update file stats cache        │
         │         └────────────────────────────────────┘
         │                 │                     │
         │                 ▼                     │
         └─────────────────┬─────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Return Session Data                          │
│                                                                 │
│  {                                                              │
│    sessionId: "abc123",                                         │
│    model: "claude-opus-4-20250514",                            │
│    modelName: "Opus 4",                                        │
│    turns: 15,                                                  │
│    totalTokens: 45000,                                         │
│    totalCost: 2.34,                                            │
│    usagePercentage: 22.5,                                      │
│    latestPrompt: "...",                                        │
│    lastModified: Date,                                         │
│    filePath: "/path/to/session.jsonl"                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

これらの図表は、CCContextの複雑な内部動作を視覚的に理解するのに役立ち、システムの各コンポーネントがどのように連携してリアルタイム監視機能を実現しているかを明確に示しています。