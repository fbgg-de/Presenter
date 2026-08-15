/**
 * Copy text to the clipboard, with a fallback for insecure contexts.
 *
 * `navigator.clipboard` only exists in a secure context, and this app is regularly deployed
 * over plain HTTP on a church LAN. Without the fallback the copy silently does nothing —
 * which is worse than failing, because callers used to show a "Copied!" tick anyway.
 *
 * Returns whether the text actually made it to the clipboard, so callers can tell the truth.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or non-secure context — fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still focusable: execCommand ignores hidden elements.
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
