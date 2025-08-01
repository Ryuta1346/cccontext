# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-08-01

### Added
- 🤖 Auto-Compact tracking feature - displays remaining context before Claude Code's Auto-Compact triggers at 65%
- Visual warnings with color coding based on proximity to Auto-Compact threshold
- Auto-Compact column in sessions live view (`cccontext sessions --live`)
- Comprehensive Auto-Compact documentation in README

### Fixed
- Fixed context usage calculation bug that was showing 702% usage by excluding cache tokens from total

### Changed
- Enhanced LiveView display to show Auto-Compact information
- Improved SessionsLiveView with dedicated Compact column

## [0.1.0] - 2025-01-31

### Added
- Initial release
- Real-time context usage monitoring
- Session management and tracking
- Cost calculation by model
- Live view and sessions view
- Warning system for high context usage (80%, 90%, 95%)