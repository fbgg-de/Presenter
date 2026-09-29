/** Leave editing, IME composition and focused controls in charge of their own keys. */
export function shouldIgnorePresentationKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return true;
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      'input, textarea, select, [role="textbox"], [role="dialog"], [role="menu"], [role="listbox"], [role="slider"], [role="tablist"]',
    ) ||
    (target as HTMLElement).isContentEditable
  )
    return true;
  // Buttons and links still allow letter shortcuts, but Enter/Space must activate only them.
  return (
    ['Enter', ' ', 'Spacebar'].includes(event.key) &&
    !!target.closest('button, a[href], summary, [role="button"], [role="checkbox"], [role="switch"], [role="radio"]')
  );
}

/**
 * Apple keyboards: ⌘ does there what Ctrl does elsewhere (⌘F finds, ⌘B …), so on a Mac ⌘ counts as
 * Ctrl and every mapping stored as "Ctrl+…" — the defaults included — works with ⌘ as well.
 */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

type KeyInfo = Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'key' | 'code'>;

/** The combo a key event stands for, as keyboard mappings store it: "Ctrl+Shift+KeyF". */
export function eventToCombo(e: KeyInfo): string {
  const parts: string[] = [];
  if (e.ctrlKey || (IS_MAC && e.metaKey)) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey && !IS_MAC) parts.push('Meta');
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(e.code);
  return parts.join('+');
}
