# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-02-05

### Changed

- Merge pull request #26 from Ryuta1346/claude/fix-release-workflow-VVDL0
- fix: handle existing remote branch in release workflow
- Merge pull request #24 from Ryuta1346/claude/fix-repo-rule-violations-0QCWq
- fix: use PR-based release flow to comply with branch protection rules
- Merge pull request #23 from Ryuta1346/claude/fix-release-workflow-sed-PcGhE
- fix: replace sed with file-split approach in release workflow changelog update
- Merge pull request #21 from Ryuta1346/claude/update-library-version-Ga3sw
- fix: update Node.js version references to 22.0.0
- fix: address code review findings
- deps: update all library versions to latest
- Merge pull request #20 from Ryuta1346/claude/automate-release-process-Ndjv1
- fix: strip ANSI codes in live-view tests for CI compatibility
- fix: resolve CI failures - reorder build before test, fix lint errors
- ci: add production environment protection to release workflow
- ci: add GitHub Actions workflows for CI and automated release
- Merge pull request #19 from Ryuta1346/claude/update-claude-models-CnQSx
- chore: remove npm lock file (project uses pnpm)
- chore: add package-lock.json
- feat(models): add Claude Opus 4.6, Opus 4.5, Sonnet 3.7 and update pricing
- Merge pull request #17 from Ryuta1346/release/v1.4.1
- test: update tests for 1M default context window

## [1.4.1] - 2025-11-01

### Fixed
- Model configuration improvements for 1M context window handling
  - Simplified Sonnet 4.5 display name (now shows as "Sonnet 4.5")
  - Set 1M as default context window for all latest Claude models (Oct 2024+)
  - Fixed model ID lookup to work directly without [1m] suffix priority
  - Removed unnecessary context window suffix from non-Sonnet 4.5 model names
  - Removed [1m] suffix variants from configuration as Claude Code doesn't store them in session files
  - Updated DEFAULT_CONTEXT_WINDOW to 1M (1,000,000 tokens)

### Changed
- Streamlined model configuration by removing redundant [1m] suffix entries
- All modern Claude models now default to 1M context window to match Claude Code's actual behavior

## [1.4.0] - 2025-10-31

### Added
- Support for 1M context window variants of Claude models
  - Added `[1m]` suffix support for model IDs (e.g., `claude-sonnet-4-5-20250929[1m]`)
  - Context window configuration for 1M variants (1,000,000 tokens)
  - Auto-compact threshold configuration for 1M variants
  - Supported models with 1M context:
    - Claude 3 Opus, Claude Opus 4, Claude Opus 4.1
    - Claude Sonnet 4, Claude Sonnet 4.5
    - Claude 3.5 Sonnet
    - Claude 3.5 Haiku, Claude Haiku 4.5
    - Claude 3 Haiku

### Changed
- Updated model display names to explicitly show context window size
  - 200k models: Now display as "Model Name (200k)"
  - 1M models: Display as "Model Name (1M)"
  - Example: "Claude Sonnet 4.5 (1M)" vs "Claude Sonnet 4.5 (200k)"
- Enhanced test coverage for 1M context window models
  - Added tests for auto-compact configuration
  - Added tests for context window size validation
  - Added tests for model name display

### Fixed
- Model context window detection now properly distinguishes between 1M and 200k variants

## [1.3.0] - 2025-10-17

### Added
- Support for Claude Sonnet 4.5 (claude-sonnet-4-5-20250929) model (#13)
  - Pricing configuration
  - Context window settings (200K tokens)
  - Auto-compact threshold configuration
- Support for Claude Haiku 4.5 (claude-haiku-4-5-20251001) model (#13)
  - Pricing configuration
  - Context window settings (200K tokens)
  - Auto-compact threshold configuration

### Changed
- Updated documentation across all language versions (README.ja.md, README.zh.md, README.ko.md, README.es.md)
- Enhanced model configuration system for better extensibility

### Fixed
- Updated .gitignore file for better project maintenance

## [1.2.0] - 2025-01-13

### Added
- Build size optimization system with multiple build configurations (#10)
  - Standard optimized build (default)
  - Bundled build with esbuild for faster startup
  - Ultra-optimized build for minimal size
- New build scripts and commands:
  - `build:bundled` - Creates a single bundled file
  - `build:ultra` - Creates the smallest possible build
  - `build:analyze` - Analyzes build output
- Size-limit integration for monitoring bundle size
- Terminal UI module for better display formatting
- Version upgrade guide documentation

### Changed
- Improved build process with better optimization
- Enhanced type safety by removing `any` types
- Updated biome configuration to version 2.2.4
- Refactored build scripts for better maintainability

### Fixed
- License file update (#9)
- parseInt calls now include radix parameter for better code quality
- Fixed lint issues across the codebase
- Resolved parameter assignment issues in debug utilities
- Fixed forEach callback return value warnings

## [1.1.1] - 2024-12-20

### Fixed
- Initial bug fixes and improvements

## [1.1.0] - 2024-12-15

### Added
- Cache read token support (#3)
- Coverage directory to gitignore (#2)
- Basic features implementation (#1)

### Changed
- Migrated JavaScript codebase to TypeScript (#7)
- Added Biome for code formatting and linting (#8)

## [1.0.0] - 2024-12-01

### Added
- Initial release
- Real-time context usage monitoring for Claude Code
- Live session tracking
- Token usage visualization
- Auto-compact detection

[1.4.1]: https://github.com/ryuta1346/cccontext/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/ryuta1346/cccontext/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ryuta1346/cccontext/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ryuta1346/cccontext/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ryuta1346/cccontext/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ryuta1346/cccontext/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ryuta1346/cccontext/releases/tag/v1.0.0[1.5.0]: https://github.com/ryuta1346/cccontext/compare/v1.4.1...v1.5.0
