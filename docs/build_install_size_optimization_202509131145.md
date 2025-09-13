# ビルドサイズ／インストールサイズを小さく保つための改善案（cccontext）

本書は、cccontext の配布サイズ（publish tarball）と利用者インストールサイズ（依存込み）を継続的に小さく保つための実践ガイドです。現状の構成（TypeScript/ESM CLI、esbuild による最小化、size-limit による閾値管理）を土台に、依存削減・遅延読込・パッケージング最適化を段階的に進めます。

## 目標と指標
- CLI エントリ（`dist/cli.js`）: 30 KB 以下（.size-limit 既定）
- `dist/**/*.js` 合計: 150 KB 以下（既定）
- NPM パッケージ同梱（`files` 対象）: 200 KB 以下（既定）
- 依存ツリー: 直接依存の削減（機能同等のまま 1〜2 件削減）

計測の基本コマンド
- `npm run build:minify && npm run size`
- `node -e "const z=require('zlib');const fs=require('fs');const c=fs.readFileSync('dist/cli.js');console.log('gzip',z.gzipSync(c).length,'bytes')"`
- `npx npm-packlist | xargs -I{} du -sh {}`（publish 対象の粒度で確認）

## すぐに効く改善（Quick Wins）
- import のアダプタ化徹底
  - `string-width` の直接 import を廃止し、`utils/string-width-adapter.ts` を経由してロード。
    - 目的: Node 18+ での軽量実装や将来の内製化に柔軟に切替可能。
  - `blessed` 直接 import をやめ、`display/tui-adapter.ts` を経由（遅延 `import()`）。
    - 目的: TUI 未使用ケースでの依存ロード回避。
- 監視のデフォルト軽量化
  - `watcher-adapter.ts` のデフォルトを `fs.watch` に。`chokidar` は存在時のみ使用。
    - 目的: chokidar 非導入でも動作（インストール最小化）。
- 配布物の最小化を堅持
  - 既に `files` フィールドで `dist/*` と必要書類のみ同梱 → 維持。
  - `.map` 非同梱（`tsconfig.prod.json` で無効化済）→ 維持。

## 依存の見直し（Install Size 対策）
- `string-width`（直接依存）
  - 代替: 既存アダプタの軽量実装（`src/utils/string-width.ts`）を優先採用。
  - 効果: サブ依存の連鎖を抑制。将来の完全除去が容易に。
- `chokidar`
  - 運用: デフォルトは `fs.watch`、`--live` や OS 事情で必要な場合のみ `chokidar` を推奨。
  - package.json: `optionalDependencies` or `peerDependencies` 化を検討（README で案内）。
- `blessed` / `cli-table3`
  - 方針: TUI が不要な環境向けに **軽量表示モード** を提供（標準出力のテキスト/表のみ）。
  - 段階案: `cccontext` = コア + 軽量 TUI、`cccontext-tui` = リッチ TUI（分割配布を検討）。
- `chalk`
  - 現状 v5 で軽量。必要になれば `picocolors` への置換で更に縮小。

## ビルド最適化（Build Size 対策）
- 役割分離
  - `npm run build:minify`: TypeScript 出力を esbuild で最小化（現行運用を維持）。
  - `npm run build:bundled`: 自コードのみバンドル、依存は external（現行）
- esbuild 推奨オプション（既存確認＋再掲）
  - `minify`, `treeShaking`, `legalComments: 'none'`, `pure`, `drop`, `target: 'node18'`
  - 依存は `external` で保持（インストールサイズ管理のため）。
- TypeScript 設定
  - `importHelpers: true`（`tslib` 依存、重複削減）: 維持
  - `removeComments: true`, sourceMap/declMap off（prod）: 維持

## パッケージングのコツ
- `package.json`
  - `files` の厳格化（既に最小）
  - 可能なら `sideEffects: false`（将来的に lib 化する場合に備え）
- NPM 配布動作
  - `prepublishOnly`: `build:minify` → `size-limit` を強制（現状維持）
  - `npm pack` で配布物の実サイズを継続確認

## 実装ガイド（リポジトリ参照）
- 直接参照の修正ポイント
  - `src/cli.ts`, `src/display/sessions-live-view.ts` の `import stringWidth from 'string-width'` を `utils/string-width-adapter` に統一
  - `src/display/live-view.ts`, `src/display/sessions-live-view.ts` の `blessed` 直接 import を `display/tui-adapter` 経由へ
  - `src/monitor/watcher-adapter.ts` のデフォルト分岐を `fs.watch` 優先に変更
- ビルドスクリプト
  - `scripts/build*.mjs` の `external` 設定は現状維持（依存をバンドルしない）

## CI とサイズ予算
- `.size-limit.json` 既定を維持（将来、閾値 10–20% 低減も検討）
- PR に `npm run size` を追加（GitHub Actions がある場合はワークフロー化）

## トレードオフと選択肢
- 単一バイナリ化（`pkg`/`nexe`）は Node ランタイム同梱で 30–50MB 程度に膨張 → 本プロジェクトでは非推奨
- `chokidar` 排除は OS 差分のケアが必要 → デフォルト `fs.watch` + オプション導入/案内が現実的

## ロードマップ（段階導入）
- Phase 1（即時）: import 統一、デフォルト監視切替、サイズ計測を CI 固定化
- Phase 2（小変更）: TUI 遅延 import、軽量モード UX 整備、README 追記
- Phase 3（必要時）: 依存分割配布（`cccontext-tui`）、size-limit の閾値見直し

---

## Proactive Suggestions（テンプレ雛形）

```
**Improvement Suggestion**: string-width をアダプタ経由に統一
**Time saved**: ~5分/PR（レビューフリクション減）
**Implementation**: import を `utils/string-width-adapter` に差し替え
**Benefits**: 依存削減の布石・今後の内製化/軽量化が容易
```

```
**Improvement Suggestion**: 監視のデフォルトを fs.watch へ
**Time saved**: ~0分（利用者側インストール軽量化）
**Implementation**: watcher-adapter の分岐を fs.watch 優先に
**Benefits**: chokidar 不要環境での依存回避、tarball/lockfile を細く保つ
```

```
**Improvement Suggestion**: TUI を遅延 import + optional 化
**Time saved**: ~10分/環境（不要依存の排除）
**Implementation**: `tui-adapter` で dynamic import、無い場合は軽量表示に自動フォールバック
**Benefits**: 機能維持のままインストールサイズを縮小
```

## 付録：運用メモ
- 破壊的変更（依存の optional/peer 化）を行う際は README にインストールガイドを明記
- `size-limit` の失敗は「即リジェクト」ではなく、差分の説明/調整を前提にレビュー（過剰防衛を避ける）

