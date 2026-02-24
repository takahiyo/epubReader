# Debug Log - Search Jump Improvement

## Issue
- Seamless scroll mode jump to search result is inaccurate (jumps slightly past).
- Search term is not highlighted or easy to see at destination.

## Hypotheses
1. `ReaderController.goTo` misses passing `searchQuery` to `goToSegment`.
2. `scrollIntoView({ block: "start" })` might be problematic if there are headers or if the parent element is large.
3. Lack of highlighting makes it hard to confirm the jump destination.

## Steps
1. [ ] Fix `goTo` to pass `searchQuery`.
2. [ ] Change `scrollIntoView` to `block: "center"`.
3. [ ] Implement temporary highlighting for search results.

## Test Results
(To be filled)
