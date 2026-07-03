import type { ShowGroup, ShowItem } from '@/api/shows.api';

/** The always-present fallback group. Items without a (valid) groupId belong here. */
export const DEFAULT_GROUP_ID = 'default';

/** Suggested group colors (sidebar tints). 11 colors + the "no color" bubble = a 4×3 grid. */
export const GROUP_COLOR_PRESETS = [
  '#1976d2',
  '#2e7d32',
  '#ed6c02',
  '#9c27b0',
  '#d32f2f',
  '#0288d1',
  '#00838f',
  '#5d4037',
  '#c2185b',
  '#afb42b',
  '#607d8b',
];

export const genGroupId = (): string => `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const makeDefaultGroup = (): ShowGroup => ({ id: DEFAULT_GROUP_ID, name: '', collapsed: false });

/**
 * Ensure a show's grouping is consistent: at least a Default group exists, every item is assigned
 * to a known group, and items are laid out contiguously by group in `groups` order. Returns new
 * arrays only when something actually changed (so callers can skip a no-op update).
 */
export const normalizeShowGroups = (
  order: ShowItem[],
  groups?: ShowGroup[],
): { order: ShowItem[]; groups: ShowGroup[]; changed: boolean } => {
  const hadGroups = !!groups && groups.length > 0;
  let groupList = hadGroups ? [...groups!] : [makeDefaultGroup()];
  if (!groupList.some((g) => g.id === DEFAULT_GROUP_ID)) {
    groupList = [makeDefaultGroup(), ...groupList];
  }
  const ids = new Set(groupList.map((g) => g.id));

  // Reassign items whose group no longer exists to Default. Items with NO groupId are left
  // untouched (they already render in Default via the `?? DEFAULT_GROUP_ID` fallback) so loading
  // a legacy show doesn't rewrite every item — which would otherwise look like an external edit.
  let assignedChanged = false;
  const assigned = order.map((it) => {
    if (!it.groupId || ids.has(it.groupId)) return it;
    assignedChanged = true;
    return { ...it, groupId: DEFAULT_GROUP_ID };
  });

  // Lay items out contiguously, in group order (stable within each group). Items without a
  // groupId belong to Default (same fallback as rendering) — a strict compare would DROP them.
  const contiguous = groupList.flatMap((g) => assigned.filter((it) => (it.groupId ?? DEFAULT_GROUP_ID) === g.id));
  const orderChanged = assignedChanged || contiguous.length !== order.length || contiguous.some((it, i) => it !== order[i]);
  const groupsChanged = !hadGroups || groupList.length !== groups!.length;
  const changed = orderChanged || groupsChanged;

  return {
    order: orderChanged ? contiguous : order,
    groups: groupsChanged ? groupList : groups!,
    changed,
  };
};

/** A group together with its items and each item's index into the flat `order`. */
export type GroupedView = { group: ShowGroup; items: { item: ShowItem; index: number }[] }[];

/** Build the grouped, render-ready view of a show's flat order. */
export const groupedView = (order: ShowItem[], groups: ShowGroup[]): GroupedView =>
  groups.map((group) => ({
    group,
    items: order.map((item, index) => ({ item, index })).filter(({ item }) => (item.groupId ?? DEFAULT_GROUP_ID) === group.id),
  }));

/** Display name for a group (the Default group may have an empty stored name). */
export const groupDisplayName = (group: ShowGroup, defaultLabel: string): string => group.name?.trim() || defaultLabel;

const gid = (item: ShowItem): string => item.groupId ?? DEFAULT_GROUP_ID;

// ──────────────────────────────────────────────────────────────────────────
// Pure operations. The order-changing ones also remap the active item index so
// the caller can keep the presented item stable across the edit.
// ──────────────────────────────────────────────────────────────────────────

export const addGroup = (groups: ShowGroup[], group: ShowGroup): ShowGroup[] => [...groups, group];

/** Patch a group's metadata (name/color/collapsed). */
export const updateGroup = (groups: ShowGroup[], id: string, patch: Partial<ShowGroup>): ShowGroup[] =>
  groups.map((g) => (g.id === id ? { ...g, ...patch } : g));

export const toggleGroupCollapsed = (groups: ShowGroup[], id: string): ShowGroup[] =>
  groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g));

/** Move `sourceId`'s group (and its item-block) to `targetId`'s position (drag & drop). */
export const reorderGroups = (
  order: ShowItem[],
  groups: ShowGroup[],
  sourceId: string,
  targetId: string,
  activeIndex: number,
): { order: ShowItem[]; groups: ShowGroup[]; activeIndex: number } | null => {
  const from = groups.findIndex((g) => g.id === sourceId);
  const to = groups.findIndex((g) => g.id === targetId);
  if (from < 0 || to < 0 || from === to) return null;
  const newGroups = [...groups];
  const [moved] = newGroups.splice(from, 1);
  newGroups.splice(to, 0, moved);
  const indexed = order.map((item, i) => ({ item, i }));
  const reordered = newGroups.flatMap((g) => indexed.filter((x) => gid(x.item) === g.id));
  return { order: reordered.map((x) => x.item), groups: newGroups, activeIndex: reordered.findIndex((x) => x.i === activeIndex) };
};

/**
 * Move an item to flat position `to` (arrayMove semantics: remove at `from`, then insert at `to`)
 * and assign it to `targetGroupId`. Handles same-group reorders and cross-group moves alike.
 */
export const moveItemFlat = (
  order: ShowItem[],
  from: number,
  to: number,
  targetGroupId: string,
  activeIndex: number,
): { order: ShowItem[]; activeIndex: number } | null => {
  if (from < 0 || from >= order.length) return null;
  const indexed = order.map((item, i) => ({ item, i }));
  const [moved] = indexed.splice(from, 1);
  // Leave legacy items (no groupId) untouched when they stay in Default.
  if (gid(moved.item) !== targetGroupId) moved.item = { ...moved.item, groupId: targetGroupId };
  indexed.splice(Math.max(0, Math.min(to, indexed.length)), 0, moved);
  return { order: indexed.map((x) => x.item), activeIndex: indexed.findIndex((x) => x.i === activeIndex) };
};

/** Delete a non-default group, moving its items into Default. Returns null for the Default group. */
export const deleteGroup = (
  order: ShowItem[],
  groups: ShowGroup[],
  id: string,
  activeIndex: number,
): { order: ShowItem[]; groups: ShowGroup[]; activeIndex: number } | null => {
  if (id === DEFAULT_GROUP_ID) return null;
  const newGroups = groups.filter((g) => g.id !== id);
  const indexed = order.map((item, i) => ({ item: gid(item) === id ? { ...item, groupId: DEFAULT_GROUP_ID } : item, i }));
  const reordered = newGroups.flatMap((g) => indexed.filter((x) => gid(x.item) === g.id));
  return { order: reordered.map((x) => x.item), groups: newGroups, activeIndex: reordered.findIndex((x) => x.i === activeIndex) };
};

/** Move a single item into another group (appended to that group's block). */
export const moveItemToGroup = (
  order: ShowItem[],
  groups: ShowGroup[],
  itemIndex: number,
  targetGroupId: string,
  activeIndex: number,
): { order: ShowItem[]; activeIndex: number } | null => {
  if (itemIndex < 0 || itemIndex >= order.length || gid(order[itemIndex]) === targetGroupId) return null;
  const indexed = order.map((item, i) => ({ item, i }));
  const [moved] = indexed.splice(itemIndex, 1);
  moved.item = { ...moved.item, groupId: targetGroupId };
  // Insert after the target group's last item; if the target is empty, after the nearest preceding
  // non-empty group (in `groups` order), else at the front.
  let insertAt = -1;
  for (let i = indexed.length - 1; i >= 0; i--) {
    if (gid(indexed[i].item) === targetGroupId) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt < 0) {
    insertAt = 0;
    const gIdx = groups.findIndex((g) => g.id === targetGroupId);
    for (let gi = gIdx - 1; gi >= 0; gi--) {
      let last = -1;
      for (let i = indexed.length - 1; i >= 0; i--) {
        if (gid(indexed[i].item) === groups[gi].id) {
          last = i;
          break;
        }
      }
      if (last >= 0) {
        insertAt = last + 1;
        break;
      }
    }
  }
  indexed.splice(insertAt, 0, moved);
  return { order: indexed.map((x) => x.item), activeIndex: indexed.findIndex((x) => x.i === activeIndex) };
};
