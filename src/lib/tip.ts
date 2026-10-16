/**
 * Props for a rich tooltip (shown by <Tooltips />): a title, an optional longer description
 * and optional shortcut keys ("Ctrl+Z", "W"). Also sets aria-label for icon-only buttons.
 *
 *   <button {...tip('Duplicate', 'Make a copy of this part')}>…</button>
 */
export function tip(title: string, description?: string, keys?: string) {
  return {
    'data-tip': title,
    'data-tip-desc': description,
    'data-tip-keys': keys,
    'aria-label': title,
  }
}
