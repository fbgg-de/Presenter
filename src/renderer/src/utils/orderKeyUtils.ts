/**
 * Utility functions for handling order names with embedded keys.
 *
 * Format: "OrderName [Key]" where the [Key] part is optional.
 * Examples:
 *   "Default"         → { order: "Default", key: undefined }
 *   "Default [C#]"    → { order: "Default", key: "C#" }
 *   "Band A [Am]"     → { order: "Band A", key: "Am" }
 */

const ORDER_KEY_REGEX = /^(.+?)\s*\[([A-Ga-g][#b]?m?)]\s*$/;

export const MUSICAL_KEYS = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
  'Cm',
  'C#m',
  'Dm',
  'D#m',
  'Ebm',
  'Em',
  'Fm',
  'F#m',
  'Gm',
  'G#m',
  'Am',
  'A#m',
  'Bbm',
  'Bm',
];

/**
 * Parse an order string into its base order name and optional key.
 */
export function parseOrderKey(orderWithKey: string | undefined): { order: string; key?: string } {
  if (!orderWithKey) return { order: 'Default' };

  const match = orderWithKey.match(ORDER_KEY_REGEX);
  if (match) {
    return { order: match[1].trim(), key: match[2] };
  }
  return { order: orderWithKey, key: undefined };
}

/**
 * Format an order name with an optional key.
 */
export function formatOrderKey(order: string, key?: string): string {
  if (!key) return order;
  return `${order} [${key}]`;
}

/**
 * Extract just the key from an order string (if present).
 */
export function extractKey(orderWithKey: string | undefined): string | undefined {
  return parseOrderKey(orderWithKey).key;
}

/**
 * Extract just the base order name (without key).
 */
export function extractOrder(orderWithKey: string | undefined): string {
  return parseOrderKey(orderWithKey).order;
}
