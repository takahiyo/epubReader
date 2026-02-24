## Reported Issue (New Symptoms)
- **Paginated -> Scroll**:
  - Scrollbar doesn't appear immediately.
  - Clicking navigation (U3/B3) resets to cover, then it starts scrolling.
  - Page count is significantly lower in scroll mode (e.g., 3 pages instead of 20).
- **Scroll -> Paginated**:
  - Moves to paginated mode, but turning pages resets to cover.

## Analysis (Console Logs)
- `buildPagination` in scroll mode is extremely fast and returns a very small number of pages.
- This indicates that the `rendition` flow is likely stuck in the previous mode's configuration or not correctly calculating the scroll height.
- `rendition.display()` might be needed with updated flow/manager settings when switching modes.

## Steps Taken
...
5. [ ] Investigate `ReaderController` rendition initialization.
6. [ ] Check if `rendition.settings` needs manual update during `applyEpubViewMode`.
7. [ ] Ensure `rendition.display()` is called with correct options on mode switch.
