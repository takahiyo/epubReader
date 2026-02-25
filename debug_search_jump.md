# Debug Log - Search Jump Improvement

## Issue
- Seamless scroll mode jump to search result is inaccurate (jumps slightly past).
- Search term is not highlighted or easy to see at destination.

## Hypotheses
1. `ReaderController.goTo` misses passing `searchQuery` to `goToSegment`.
2. `scrollIntoView({ block: "start" })` might be problematic if there are headers or if the parent element is large.
3. Lack of highlighting makes it hard to confirm the jump destination.

## Steps
1. [x] Fix `goTo` to pass `searchQuery`.
2. [x] Change `scrollIntoView` to `block: "center"`.
3. [x] Implement temporary highlighting for search results.
4. [x] Fix `ReferenceError: targetElement is not defined` introduced in initial implementation.

## Test Results
- [x] Initial implementation: Failed due to `ReferenceError` at `reader.js:1280`. Search results were jumping to chapter start instead of correct position.
- [x] Fix applied: Declared `targetElement` in `_scrollToPositionInDOM`.
- [x] Result: Correctly jumps to centered text and applies highlight.
