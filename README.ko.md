# CCContext - Claude Code 컨텍스트 모니터

> 📖 **다른 언어로 읽기**: [日本語](./README.ja.md) | [English](./README.md) | [中文](./README.zh.md) | [Español](./README.es.md)

Claude Code의 컨텍스트 사용량을 실시간으로 모니터링하는 도구입니다. Claude Code와 독립적으로 작동하며, JSONL 로그 파일을 모니터링하여 세션별 토큰 사용량과 비용을 표시합니다.

## 목적

CCContext는 Claude Code 사용자가 컨텍스트 소비에 대한 실시간 가시성을 제공하여 AI 어시스턴트의 잠재력을 최대화할 수 있도록 지원합니다. Claude Code와 독립적으로 작동하여 예기치 않은 컨텍스트 소진을 방지하고 지속적이고 고품질의 AI 상호작용을 유지하는 비침습적인 방법을 제공합니다.

**핵심 가치 제안:**
- 🚀 **작업 중단 방지**: 컨텍스트 사용량을 사전에 모니터링하여 워크플로우를 중단시킬 수 있는 예기치 않은 자동 압축 트리거를 방지
- 💡 **AI 성능 최적화**: 컨텍스트를 효과적으로 관리하고 새 세션을 시작할 시기를 파악하여 Claude의 응답 품질 유지
- 💰 **비용 제어**: 캐시 토큰 활용을 포함한 토큰 소비와 비용을 실시간으로 추적하여 비용 최적화
- 🎯 **예측적 인사이트**: 정교한 사용 패턴 분석을 통해 자동 압축 활성화 시점(92%에서)을 정확하게 예측
- 🔄 **세션 인텔리전스**: 개별 추적 및 실시간 모니터링으로 여러 동시 세션을 효율적으로 관리

## 중요 주의사항

- **계산 결과에 대해**: 이 도구가 표시하는 토큰 사용량, 비용, 자동 압축 활성화 타이밍 등의 계산 결과는 cccontext가 독자적으로 계산한 참고값입니다. Claude Code 본체의 계산 결과와 반드시 일치하지는 않을 수 있습니다.
- **구현에 대해**: 이 도구의 거의 모든 코드는 Claude Code에 의해 구현되었습니다.

## 특징

- 🔍 **실시간 모니터링**: Claude Code 실행 중 컨텍스트 사용량을 실시간으로 추적
- 📊 **세션 관리**: 각 세션의 토큰 사용량, 비용, 남은 용량을 개별적으로 표시
- ⚠️ **경고 시스템**: 컨텍스트 사용량이 80%, 90%, 95%에 도달할 때 경고
- 🤖 **자동 압축 추적**: Claude Code 자동 압축 활성화(92%)까지의 남은 용량 표시
- 💰 **비용 계산**: 모델별 가격에 기반한 실시간 비용 계산
- 🎯 **비침입적**: Claude Code 자체에 영향을 주지 않고 JSONL 로그만 읽음

## 설치

### npx로 직접 실행 (권장)

설치 없이 직접 실행:

```bash
npx cccontext
npx cccontext sessions
npx cccontext monitor --live
```

### 전역 설치

```bash
# pnpm 사용
pnpm add -g cccontext

# npm 사용
npm install -g cccontext

# 실행
cccontext sessions
```

## 사용법

### 실시간 모니터링

최신 활성 세션을 자동으로 감지하여 모니터링:

```bash
npx cccontext
```

### 세션 선택

세션 목록에서 번호로 선택하여 모니터링:

```bash
# 세션 목록을 표시하여 선택
npx cccontext --list

# 번호로 직접 지정 (예: 2번째 세션)
npx cccontext --session 2
```

### 세션 목록

최근 세션 표시:

```bash
npx cccontext sessions
npx cccontext sessions --limit 20  # 20개 세션 표시
npx cccontext sessions --live      # 라이브 뷰 모드
```

### 모니터 명령

특정 세션 모니터링:

```bash
npx cccontext monitor
npx cccontext monitor --session 2  # 2번째 세션 모니터링
```

### 기타 옵션

```bash
# 세션 캐시 지우기
npx cccontext sessions --clear-cache

# 디버그 모드
npx cccontext sessions --debug
```

## 명령줄 옵션

### `cccontext` (기본값)
최신 활성 세션을 실시간으로 모니터링합니다.

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--list` | 선택을 위한 세션 목록 표시 | false |
| `--session <number>` | 세션 번호로 직접 지정 | - |
| `--version` | 버전 정보 표시 | - |
| `--help` | 도움말 표시 | - |

### `cccontext monitor`
Claude Code 컨텍스트 사용량을 모니터링합니다.

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--live` | 라이브 모니터링 모드 | true |
| `--session <number>` | 번호로 특정 세션 지정 | - |

### `cccontext sessions`
최근 Claude Code 세션을 나열합니다.

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--limit <number>` | 표시할 세션 수 | 10 |
| `--live` | 라이브 뷰 모드 (자동 새로고침) | false |
| `--clear-cache` | 세션 캐시 지우기 | false |
| `--debug` | 디버그 모드 | false |

자동 압축 표시:
- `until 65.0%`: 정상 - 자동 압축 활성화까지 65% 여유
- `until 45.0%`: 정상 - 자동 압축 활성화까지 45% 여유
- `⚠until 15.0%`: 경고 - 자동 압축 활성화까지 15%
- `!until 5.0%`: 위험 - 자동 압축 활성화 임박
- `ACTIVE`: 자동 압축 활성화됨 (92% 도달)

## 자동 압축 모니터링에 대해

Claude Code는 컨텍스트 창 사용량이 92%에 도달하면 자동으로 자동 압축을 실행하여 대화를 압축합니다. CCContext는 실제 Claude Code 동작과 일치하는 계산 방법을 사용하여 자동 압축 활성화 타이밍을 정확히 예측합니다.

### 계산 방법
CCContext는 Claude Code처럼 총 메시지 수를 기반으로 컨텍스트 사용량을 계산합니다. 이를 통해 실제 자동 압축 활성화 타이밍을 정확히 예측할 수 있습니다.

### 경고 수준
- **정상** (회색): 자동 압축까지 30% 이상 여유
- **주의** (파란색): 자동 압축까지 15-30%
- **경고** (노란색): 자동 압축까지 5-15%
- **위험** (빨간색): 자동 압축까지 5% 미만
- **활성화** (빨간색/강조): 자동 압축 활성화됨 (92% 도달)

### 표시 예제
```
# 여유가 충분한 경우
Auto-compact: at 92% (until 65.0%)

# 경고 수준
Auto-compact: at 92% (⚠until 8.5%)

# 위험 수준
Auto-compact: at 92% (!until 2.5%)

# 활성화
AUTO-COMPACT ACTIVE
```

## 지원 모델

- Claude 3 Opus
- Claude Opus 4
- Claude Opus 4.1 (2025년 8월 출시)
- Claude Sonnet 4 (2025년 5월 출시)
- Claude 3.5 Sonnet
- Claude 3.5 Haiku
- Claude 3 Haiku

## 추가 정보

### 버전 확인

```bash
cccontext --version
```

### 도움말

```bash
cccontext --help
cccontext sessions --help
```

### 필요한 권한

- `~/.claude/projects/` 디렉토리에 대한 읽기 권한
- JSONL 파일 읽기 권한

### 시스템 요구사항

- Node.js 18.0.0 이상
- macOS, Linux, Windows 지원

## 라이센스

MIT

## 감사의 말

이 프로젝트는 [ccusage](https://github.com/ryoppippi/ccusage)의 개념에 크게 영향을 받았습니다.