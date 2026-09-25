import { useEffect, useState } from 'react';
import { useGetSettings } from '@/store/settingsSlice';
import { DEFAULT_KEYBOARD_MAPPING } from '@/components/settings/KeyboardMappingEditor';

/** How a key code reads on a keycap when the layout cannot be asked. */
const KEY_NAMES: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  BracketLeft: '[',
  BracketRight: ']',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

type LayoutMap = { get: (code: string) => string | undefined };

/**
 * The operator's keyboard layout, asked once. Mappings store physical key codes, so on a German
 * layout `BracketLeft` is the "Ü" key — the label has to come from the layout, not the code name.
 * Chromium/Electron only; elsewhere labels fall back to the code names.
 */
let layoutPromise: Promise<LayoutMap | undefined> | undefined;
const loadLayout = () =>
  (layoutPromise ??= (async () => {
    try {
      const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } }).keyboard;
      return await keyboard?.getLayoutMap?.();
    } catch {
      return undefined;
    }
  })());

/** "Ctrl+KeyB" → "Ctrl+B", "BracketLeft" → "Ü" on a German layout, "[" on a US one. */
export const shortcutLabel = (combo: string, layout?: LayoutMap) =>
  combo
    .split('+')
    .map((part) => {
      if (KEY_NAMES[part] && !part.startsWith('Bracket')) return KEY_NAMES[part];
      const char = layout?.get(part);
      if (char && char.length === 1) return char.toUpperCase();
      return KEY_NAMES[part] ?? part.replace(/^Key/, '').replace(/^Digit/, '');
    })
    .join('+');

/**
 * The key currently bound to a keyboard action, as a label — from the operator's own mapping, so
 * hints never show a default the operator has changed. Undefined when the action is off or unbound.
 */
export function useShortcut(action: string): string | undefined {
  const { keyboardMapping } = useGetSettings('keyboardMapping');
  const [layout, setLayout] = useState<LayoutMap>();
  useEffect(() => {
    let active = true;
    void loadLayout().then((map) => {
      if (active && map) setLayout(map);
    });
    return () => {
      active = false;
    };
  }, []);
  const entry = keyboardMapping?.[action] ?? DEFAULT_KEYBOARD_MAPPING[action];
  if (!entry || entry.enabled === false || !entry.key) return undefined;
  return shortcutLabel(entry.key, layout);
}

/** "Black all" + "B" → "Black all (B)". */
export const withShortcut = (title: string, shortcut: string | undefined) => (shortcut ? `${title} (${shortcut})` : title);
