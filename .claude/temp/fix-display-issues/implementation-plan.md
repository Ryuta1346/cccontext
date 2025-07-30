# cccontext Display Issues Fix Plan

## Issues to Fix

### 1. Japanese Character Encoding Issue in Latest Prompt Display
**Problem**: Japanese characters are showing as garbled text in the latest prompt column
**Root Cause**: The current implementation counts Japanese character width for terminal display but doesn't handle encoding properly

### 2. Focus Jumping to Top in npx cccontext sessions --live
**Problem**: When navigating the sessions list, focus unexpectedly returns to the top
**Root Cause**: The table is being recreated/redrawn completely on each update, losing focus state

## Analysis

### Japanese Character Issue
- Both `sessions-live-view.mjs` and `cli.mjs` have custom logic to count Japanese characters as 2-width units
- The regex pattern used: `/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/`
- The issue might be related to how the terminal or blessed library handles UTF-8 encoding

### Focus Issue
- The table widget has `interactive: false`, `keys: false`, and `vi: false` set
- On each update, `updateSessions()` calls `setData()` which replaces all table data
- No focus state is being preserved between updates

## Implementation Plan

### Fix 1: Japanese Character Encoding
1. Ensure proper UTF-8 handling in the terminal output
2. Test if the issue is with the width calculation or actual character encoding
3. Consider using a library like `string-width` for proper terminal width calculation
4. Update both `truncatePrompt()` methods in sessions-live-view.mjs and cli.mjs

### Fix 2: Focus Management
1. Enable interactive mode for the table widget
2. Preserve the current selection index before updating data
3. Restore the selection after data update
4. Add proper keyboard navigation handling

## Implementation Steps

1. First, fix the Japanese character encoding issue
2. Then, fix the focus management issue
3. Test both fixes together to ensure they work properly