# Live Refresh Flow Analysis for cccontext sessions --live

## Overview
The `cccontext sessions --live` command displays "Auto-refreshing every 1s" but updates are not reflecting properly. This document analyzes the complete flow and identifies potential issues.

## Flow Analysis

### 1. Command Initialization (cli.mjs)
When `cccontext sessions --live` is executed:
1. `showSessionsLive()` is called (line 215)
2. Creates `SessionsLiveView` instance (line 219)
3. Initializes the blessed UI (line 220)
4. Starts directory watching via `watcher.startDirectoryWatch()` (line 224)

### 2. Event Registration
The code registers three event listeners:
- `session-added` (line 227-229)
- `session-removed` (line 231-233)
- `session-updated` (line 235-237)

All three events call the same `updateSessions()` function.

### 3. The updateSessions Function (lines 240-319)
This function:
1. Invalidates cache with `watcher.invalidateCache()` (line 243)
2. Gets all JSONL files with `watcher.getAllJsonlFiles()` (line 244)
3. Reads and parses each file completely (lines 248-288)
4. Sorts sessions by last modified time (line 308)
5. Updates the UI via `sessionsView.updateSessions()` (line 315)

### 4. Auto-refresh Mechanism
After initial update, `startAutoRefresh()` is called (line 325), which sets up a 1-second interval that repeatedly calls `updateSessions()`.

## Identified Issues

### Issue 1: File Watching Configuration
In `session-watcher.mjs`, the directory watcher has these settings:
```javascript
awaitWriteFinish: {
  stabilityThreshold: 200,
  pollInterval: 100
}
```
This means chokidar waits 200ms after the last write before firing the event. Combined with the 1-second refresh interval, this can cause delays.

### Issue 2: Cache Invalidation Timing
The cache is only invalidated inside `updateSessions()`, but the `getAllJsonlFiles()` method checks the cache first:
```javascript
if (this.cachedFiles.size > 0) {
  return Array.from(this.cachedFiles);
}
```
This means between the file change event and the next refresh interval, the cache might still return stale data.

### Issue 3: Inefficient Full File Reading
Every 1 second, the system:
- Reads ALL session files completely
- Parses ALL JSON lines in each file
- Recalculates ALL statistics

This is extremely inefficient and can cause performance issues with many sessions or large files.

### Issue 4: Event Handling vs Polling Conflict
The system uses both:
- Event-based updates (file watching)
- Polling-based updates (1-second interval)

These can conflict, causing the UI to update at unpredictable times.

### Issue 5: No Incremental Updates
When a session file changes, the system doesn't track what changed. It re-reads everything, which is wasteful.

## Root Cause
The main issue is that the 1-second auto-refresh is working, but it's re-reading all files from disk every second, which is:
1. Slow (causing apparent delays)
2. Inefficient (high CPU/disk usage)
3. Not utilizing the file watching events properly

## Recommendations

### 1. Implement Incremental Updates
- Track file positions like in `watchSession()`
- Only read new data when files change
- Cache parsed session data in memory

### 2. Remove Redundant Polling
- Rely on file watching events for updates
- Only use polling as a fallback or for UI refresh

### 3. Optimize File Reading
- Don't re-read entire files on every update
- Use streaming for large files
- Cache session metadata

### 4. Fix Cache Management
- Update cache immediately when files change
- Don't rely on invalidation at read time

### 5. Debounce Updates
- Batch multiple file changes within a short window
- Update UI once per batch, not per file

## Conclusion
The "Auto-refreshing every 1s" message is accurate - the system IS refreshing every second. However, the refresh is so inefficient that it appears delayed or non-functional. The solution requires restructuring the update mechanism to be event-driven with intelligent caching and incremental updates.