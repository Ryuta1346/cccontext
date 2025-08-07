# CCContext - Claude Code 上下文监视器

> 📖 **阅读其他语言版本**: [日本語](./README.ja.md) | [English](./README.md) | [한국어](./README.ko.md) | [Español](./README.es.md)

实时监控 Claude Code 上下文使用量的工具。独立于 Claude Code 运行，通过监控 JSONL 日志文件显示每个会话的令牌使用量和成本。

## 目的

CCContext 赋能 Claude Code 用户通过提供上下文消耗的实时可见性来最大化 AI 助手的潜力。通过独立于 Claude Code 运行，它提供了一种非侵入式的方式来防止意外的上下文耗尽，并保持连续、高质量的 AI 交互。

**核心价值主张：**
- 🚀 **防止工作中断**：主动监控上下文使用量，避免意外的自动压缩触发而中断您的工作流程
- 💡 **优化 AI 性能**：通过有效管理上下文并了解何时开始新会话来保持 Claude 的响应质量
- 💰 **成本控制**：实时跟踪令牌消耗和成本，包括缓存令牌利用率以优化成本
- 🎯 **预测性洞察**：通过复杂的使用模式分析准确预测自动压缩激活时机
- 🔄 **会话智能管理**：通过个别跟踪和实时监控高效管理多个并发会话

## 重要注意事项

- **关于计算结果**：本工具显示的令牌使用量、成本、自动压缩激活时机等计算结果是 cccontext 独立计算的参考值。不一定与 Claude Code 本体的计算结果一致。
- **关于实现**：本工具几乎所有代码都是由 Claude Code 实现的。

## 特性

- 🔍 **实时监控**：在 Claude Code 执行期间实时跟踪上下文使用量
- 📊 **会话管理**：分别显示每个会话的令牌使用量、成本和剩余容量
- ⚠️ **警告系统**：在上下文使用量达到多个阈值时发出警报
- 💰 **成本计算**：基于特定模型定价的实时成本计算
- 🎯 **非侵入性**：不影响 Claude Code 本身，仅读取 JSONL 日志
- 🤖 **自动压缩跟踪**：显示距离 Claude Code 自动压缩激活的剩余容量

## 安装

### 使用 npx 直接执行（推荐）

无需安装直接执行：

```bash
npx cccontext
npx cccontext sessions
npx cccontext monitor --live
```

### 全局安装

```bash
# 使用 pnpm
pnpm add -g cccontext

# 使用 npm
npm install -g cccontext

# 执行
cccontext sessions
```

## 使用方法

### 实时监控

自动检测并监控最新的活跃会话：

```bash
npx cccontext
```

### 会话选择

从会话列表中选择编号进行监控：

```bash
# 显示会话列表进行选择
npx cccontext --list

# 直接按编号指定（例如：第2个会话）
npx cccontext --session 2
```

### 会话列表

显示最近的会话：

```bash
npx cccontext sessions
npx cccontext sessions --limit 20  # 显示20个会话
npx cccontext sessions --live      # 实时视图模式
```

### 监控命令

监控特定会话：

```bash
npx cccontext monitor
npx cccontext monitor --session 2  # 监控第2个会话
```

### 其他选项

```bash
# 清除会话缓存
npx cccontext sessions --clear-cache

# 调试模式
npx cccontext sessions --debug
```

## 命令行选项

### `cccontext`（默认）
实时监控最新的活跃会话。

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--list` | 显示会话列表进行选择 | false |
| `--session <number>` | 直接按会话编号指定 | - |
| `--version` | 显示版本信息 | - |
| `--help` | 显示帮助 | - |

### `cccontext monitor`
监控 Claude Code 上下文使用量。

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--live` | 实时监控模式 | true |
| `--session <number>` | 按编号指定特定会话 | - |

### `cccontext sessions`
列出最近的 Claude Code 会话。

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--limit <number>` | 要显示的会话数量 | 10 |
| `--live` | 实时视图模式（自动刷新） | false |
| `--clear-cache` | 清除会话缓存 | false |
| `--debug` | 调试模式 | false |

自动压缩显示：
- `until 65.0%`：正常 - 距离自动压缩激活还有 65% 余量
- `until 45.0%`：正常 - 距离自动压缩激活还有 45% 余量
- `⚠until 15.0%`：警告 - 距离自动压缩激活还有 15%
- `!until 5.0%`：危险 - 自动压缩即将激活
- `ACTIVE`：自动压缩已激活

## 关于自动压缩监控

Claude Code 在上下文窗口使用量达到一定阈值时会自动执行自动压缩，压缩对话内容。CCContext 使用与实际 Claude Code 行为一致的计算方法，准确预测自动压缩激活时机。

### 计算方法
CCContext 基于总消息数计算上下文使用量，就像 Claude Code 一样。这使得能够准确预测实际的自动压缩激活时机。

### 警告级别
- **正常**（灰色）：距离自动压缩还有 30% 或更多余量
- **注意**（蓝色）：距离自动压缩 15-30%
- **警告**（黄色）：距离自动压缩 5-15%
- **危险**（红色）：距离自动压缩不足 5%
- **激活中**（红色/强调）：自动压缩已激活

### 显示示例
```
# 有充足余量时
Auto-compact: at 92% (until 65.0%)

# 警告级别
Auto-compact: at 92% (⚠until 8.5%)

# 危险级别
Auto-compact: at 92% (!until 2.5%)

# 激活中
AUTO-COMPACT ACTIVE
```

## 支持的模型

- Claude Opus 4.1
- Claude Opus 4
- Claude Sonnet 4
- Claude 3.5 Sonnet
- Claude 3.5 Haiku

## 其他信息

### 版本检查

```bash
cccontext --version
```

### 帮助

```bash
cccontext --help
cccontext sessions --help
```

### 所需权限

- 对 `~/.claude/projects/` 目录的读取访问权限
- JSONL 文件读取权限

### 系统要求

- Node.js 18.0.0 或更高版本
- 支持 macOS、Linux、Windows

## 许可证

MIT

## 致谢

本项目深受 [ccusage](https://github.com/ryoppippi/ccusage) 概念的启发。
