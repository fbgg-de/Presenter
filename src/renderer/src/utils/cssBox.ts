/**
 * CSS box shorthands, expanded and collapsed.
 *
 * Kept apart from the style form so the box-model editor and its tests share one implementation
 * of the shorthand rules rather than each carrying an approximation of them.
 */
/** The four sides of a CSS box, expanded from whatever shorthand was stored. */
export type BoxSides = { top: string; right: string; bottom: string; left: string };

/**
 * Expand a CSS padding shorthand into its four sides.
 *
 * Follows the CSS rules exactly — one value applies to all sides, two are vertical then
 * horizontal, three are top / horizontal / bottom, four are clockwise from the top — so a value
 * typed by hand or written by an older build round-trips rather than being reinterpreted.
 */
export const parseBoxShorthand = (value: string | undefined, fallback = '0'): BoxSides => {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };

  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
};

/**
 * Write four sides back as the shortest equivalent shorthand.
 *
 * Collapsing keeps the stored value close to what someone would have typed, and means editing
 * one side of an evenly padded box does not permanently expand it to four values.
 */
export const formatBoxShorthand = ({ top, right, bottom, left }: BoxSides): string => {
  const side = (value: string) => (value.trim() === '' ? '0' : value.trim());
  const [t, r, b, l] = [side(top), side(right), side(bottom), side(left)];

  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;

  return `${t} ${r} ${b} ${l}`;
};
