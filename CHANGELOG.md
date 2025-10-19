# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.3.0]: https://github.com/ryuta1346/cccontext/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ryuta1346/cccontext/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ryuta1346/cccontext/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ryuta1346/cccontext/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ryuta1346/cccontext/releases/tag/v1.0.0