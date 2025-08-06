# CCContext - Claude Code Context Monitor

> 📖 **Read in other languages**: [日本語](./README.ja.md) | [中文](./README.zh.md) | [한국어](./README.ko.md) | [Español](./README.es.md)

A real-time context usage monitor for Claude Code. It operates independently from Claude Code and displays token usage and costs for each session by monitoring JSONL log files.

## Purpose

CCContext empowers Claude Code users to maximize their AI assistant's potential by providing real-time visibility into context consumption. By operating independently from Claude Code, it offers a non-intrusive way to prevent unexpected context exhaustion and maintain continuous, high-quality AI interactions.

**Core Value Propositions:**
- 🚀 **Prevent Work Interruptions**: Proactively monitor context usage to avoid unexpected Auto-Compact triggers that could disrupt your workflow
- 💡 **Optimize AI Performance**: Maintain Claude's response quality by managing context effectively and knowing when to start new sessions
- 💰 **Control Costs**: Track token consumption and costs in real-time, including cache token utilization for cost optimization
- 🎯 **Predictive Insights**: Accurately forecast Auto-Compact activation timing through sophisticated usage pattern analysis
- 🔄 **Session Intelligence**: Manage multiple concurrent sessions efficiently with individual tracking and live monitoring

## Important Notes

- **About Calculations**: Token usage, costs, Auto-Compact activation timing, and other calculation results displayed by this tool are reference values calculated independently by cccontext. They may not necessarily match the calculation results of Claude Code itself.
- **About Implementation**: Almost all code in this tool was implemented by Claude Code.

## Features

- 🔍 **Real-time Monitoring**: Live tracking of context usage during Claude Code execution
- 📊 **Session-by-Session Management**: Individual display of token usage, costs, and remaining capacity for each session
- ⚠️ **Warning System**: Alerts at multiple context usage thresholds
- 💰 **Cost Calculation**: Real-time cost calculation based on model-specific pricing
- 🎯 **Non-intrusive**: Does not affect Claude Code itself, only reads JSONL logs
- 🤖 **Auto-Compact Tracking**: Display remaining capacity until Claude Code Auto-Compact activation

## Installation

### Direct execution with npx (Recommended)

Execute directly without installation:

```bash
npx cccontext
npx cccontext sessions
npx cccontext monitor --live
```

### Global Installation

```bash
# Using pnpm
pnpm add -g cccontext

# Using npm
npm install -g cccontext

# Execute
cccontext sessions
```

## Usage

### Real-time Monitoring

Automatically detect and monitor the latest active session:

```bash
npx cccontext
```

### Session Selection

Select from session list by number for monitoring:

```bash
# Display session list for selection
npx cccontext --list

# Direct specification by number (e.g., 2nd session)
npx cccontext --session 2
```

### Session List

Display recent sessions:

```bash
npx cccontext sessions
npx cccontext sessions --limit 20  # Display 20 sessions
npx cccontext sessions --live      # Live view mode
```

### Monitor Command

Monitor specific sessions:

```bash
npx cccontext monitor
npx cccontext monitor --session 2  # Monitor 2nd session
```

### Other Options

```bash
# Clear session cache
npx cccontext sessions --clear-cache

# Debug mode
npx cccontext sessions --debug
```

## Command Line Options

### `cccontext` (Default)
Monitors the latest active session in real-time.

| Option | Description | Default |
|--------|-------------|---------|
| `--list` | Display session list for selection | false |
| `--session <number>` | Direct specification by session number | - |
| `--version` | Display version information | - |
| `--help` | Display help | - |

### `cccontext monitor`
Monitor Claude Code context usage.

| Option | Description | Default |
|--------|-------------|---------|
| `--live` | Live monitoring mode | true |
| `--session <number>` | Specify specific session by number | - |

### `cccontext sessions`
List recent Claude Code sessions.

| Option | Description | Default |
|--------|-------------|---------|
| `--limit <number>` | Number of sessions to display | 10 |
| `--live` | Live view mode (auto-refresh) | false |
| `--clear-cache` | Clear session cache | false |
| `--debug` | Debug mode | false |

Auto-Compact Display:
- `until 65.0%`: Normal - ample margin until Auto-Compact activation
- `until 45.0%`: Normal - 45% margin until Auto-Compact activation
- `⚠until 15.0%`: Warning - 15% until Auto-Compact activation
- `!until 5.0%`: Danger - Auto-Compact activation imminent
- `ACTIVE`: Auto-Compact active

## About Auto-Compact Monitoring

Claude Code automatically executes Auto-Compact when context window usage reaches a certain threshold, compressing the conversation. CCContext uses calculation methods aligned with actual Claude Code behavior to accurately predict Auto-Compact activation timing.

### Calculation Method
CCContext calculates context usage based on total message count, just like Claude Code. This enables accurate prediction of actual Auto-Compact activation timing.

### Warning Levels
- **Normal** (Gray): 30% or more margin until Auto-Compact
- **Notice** (Blue): 15-30% until Auto-Compact
- **Warning** (Yellow): 5-15% until Auto-Compact
- **Danger** (Red): Less than 5% until Auto-Compact
- **Active** (Red/Emphasized): Auto-Compact activated

### Display Examples
```
# When there's sufficient margin
Auto-compact: at 92% (until 65.0%)

# Warning level
Auto-compact: at 92% (⚠until 8.5%)

# Danger level
Auto-compact: at 92% (!until 2.5%)

# Active
AUTO-COMPACT ACTIVE
```

## Supported Models

- Claude 3 Opus
- Claude Opus 4
- Claude Opus 4.1 (Released August 2025)
- Claude Sonnet 4 (Released May 2025)
- Claude 3.5 Sonnet
- Claude 3.5 Haiku
- Claude 3 Haiku

## Additional Information

### Version Check

```bash
cccontext --version
```

### Help

```bash
cccontext --help
cccontext sessions --help
```

### Required Permissions

- Read access to `~/.claude/projects/` directory
- JSONL file read permissions

### System Requirements

- Node.js 18.0.0 or higher
- macOS, Linux, Windows support

## License

MIT

## Acknowledgments

This project is greatly influenced by the concept of [ccusage](https://github.com/ryoppippi/ccusage).