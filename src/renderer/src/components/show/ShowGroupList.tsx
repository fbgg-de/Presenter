import { ReactNode, useState, MouseEvent } from 'react';
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  Menu,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon,
  DeleteOutlined as DeleteIcon,
  Circle as CircleIcon,
  FormatColorReset as NoColorIcon,
} from '@mui/icons-material';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  CollisionDetection,
  Modifier,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowGroup, ShowItem } from '@/api/shows.api';
import { DEFAULT_GROUP_ID, GROUP_COLOR_PRESETS, groupDisplayName, makeDefaultGroup } from '@/utils/showGroups';

/**
 * Small name-prompt dialog shared by the group list (add), the sidebar's add-item
 * menu and the item rename action. `fieldLabel`/`placeholder`/`helperText` let
 * callers repurpose it for names other than group names.
 */
export const GroupNameDialog = ({
  open,
  title,
  initialName = '',
  fieldLabel,
  placeholder,
  helperText,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initialName?: string;
  fieldLabel?: string;
  placeholder?: string;
  helperText?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) => {
  const { LL } = useI18nContext();
  const [name, setName] = useState(initialName);

  // Re-seed the input whenever the dialog opens (rename pre-fills, add starts empty).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName(initialName);
  }

  const submit = () => {
    onSubmit(name.trim());
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={fieldLabel ?? LL.SHOW_GROUPS.NAME()}
          placeholder={placeholder}
          helperText={helperText}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={submit}>
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/** Sortable wrapper for item rows (the whole row is the drag handle). */
const SortableRow = ({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // Translate only — the sorting strategy's scale part stretches entries of differing heights.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // While dragging, the row is just a dim placeholder — the DragOverlay carries the visuals.
      sx={{ touchAction: 'none', ...(isDragging ? { opacity: 0.35 } : {}) }}
    >
      {children}
    </Box>
  );
};

/**
 * Sortable wrapper for a whole group card. The card is the sortable node so the
 * ENTIRE group (header + items) moves while dragging; the header is the drag handle.
 */
const SortableGroupCard = ({
  id,
  disabled,
  color,
  header,
  children,
}: {
  id: string;
  disabled?: boolean;
  color?: string;
  /** Renders the header row; spread `dragHandleProps` onto it to make it the drag handle. */
  header: (dragHandleProps: Record<string, unknown>) => ReactNode;
  children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <Box
      ref={setNodeRef}
      // Translate only — group cards have different heights, and the strategy's scaleY
      // would visibly stretch/squash the dragged card while hovering other groups.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      sx={{
        mx: 0.75,
        mb: 1,
        borderRadius: 1,
        overflow: 'hidden',
        borderLeft: '3px solid',
        borderColor: color || 'divider',
        // The whole group block is tinted with the group color, the header a bit stronger.
        bgcolor: color ? `${color}14` : 'transparent',
        // While dragging, the card is just a dim placeholder — the DragOverlay carries the visuals.
        ...(isDragging ? { opacity: 0.35 } : {}),
      }}
    >
      {header({ ...attributes, ...listeners })}
      {children}
    </Box>
  );
};

interface ShowGroupListProps {
  order: ShowItem[];
  groups: ShowGroup[];
  /** Render one item row. `flatIndex` is the item's index in the flat order. */
  renderItem: (item: ShowItem, flatIndex: number) => ReactNode;
  /** Drag & drop: move the item at `from` to flat position `to` (arrayMove semantics) into `targetGroupId`. */
  onMoveItem: (from: number, to: number, targetGroupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  /** When true, group management (add/rename/recolor/reorder/delete, cross-group drag) is enabled. */
  editable?: boolean;
  onRenameGroup?: (groupId: string, name: string) => void;
  onRecolorGroup?: (groupId: string, color: string | undefined) => void;
  /** Drag & drop: move `sourceId`'s group block to `targetId`'s position. */
  onReorderGroup?: (sourceId: string, targetId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onAddGroup?: (name: string) => void;
  /** Static content rendered after the last group (e.g. the import skeleton). */
  footer?: ReactNode;
}

const GROUP_ID_PREFIX = 'grp:';
const ITEM_ID_PREFIX = 'itm:';

/**
 * While dragging a group card, only other group CARDS count as drop targets — otherwise
 * item rows inside expanded groups grab the collision and the sort preview jitters.
 */
const groupAwareCollision: CollisionDetection = (args) => {
  if (String(args.active.id).startsWith(GROUP_ID_PREFIX)) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(GROUP_ID_PREFIX)),
    });
  }
  return closestCenter(args);
};

/** Everything in the list moves vertically only — prevents drags from creating horizontal overflow. */
const lockToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** An item together with its index in the REAL (uncommitted) flat order. */
type Entry = { item: ShowItem; origIndex: number };

const entryGid = (e: Entry): string => e.item.groupId ?? DEFAULT_GROUP_ID;

/**
 * Renders a show's items grouped into named, optionally-colored, collapsible sections.
 * One dnd-kit context spans everything: items can be dragged within and across groups
 * (drop on a header to move an item to the start of that group — works for collapsed
 * and empty groups too), and group headers can be dragged to reorder whole groups.
 */
export const ShowGroupList = ({
  order,
  groups,
  renderItem,
  onMoveItem,
  onToggleCollapse,
  editable = false,
  onRenameGroup,
  onRecolorGroup,
  onReorderGroup,
  onDeleteGroup,
  onAddGroup,
  footer,
}: ShowGroupListProps) => {
  const { LL } = useI18nContext();
  // Never render with zero groups — items would silently disappear from the list.
  const effectiveGroups = groups.length > 0 ? groups : [makeDefaultGroup()];

  // Live preview of the order while an item is dragged: cross-group moves re-parent
  // immediately so the target group opens a gap (committed via onMoveItem on drop).
  // Entries keep their ORIGINAL flat index so ids and renderItem stay stable.
  const [preview, setPreview] = useState<Entry[] | null>(null);
  const [activeEntry, setActiveEntry] = useState<Entry | null>(null);

  // Same live preview for group drags: cards swap positions while dragging (committed on drop).
  const [previewGroups, setPreviewGroups] = useState<ShowGroup[] | null>(null);
  const [activeGroupDrag, setActiveGroupDrag] = useState<{ group: ShowGroup; count: number } | null>(null);

  const displayGroups = previewGroups ?? effectiveGroups;
  const entries: Entry[] = preview ?? order.map((item, origIndex) => ({ item, origIndex }));
  const view = displayGroups.map((group) => ({ group, items: entries.filter((e) => entryGid(e) === group.id) }));

  // Color menu (opened from the group's color circle) + inline rename + add dialog.
  const [colorMenu, setColorMenu] = useState<{ anchor: HTMLElement; groupId: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Groups sort as whole cards; each group's items sort in their own nested context.
  const groupIds = view.map(({ group }) => `${GROUP_ID_PREFIX}${group.id}`);

  const gidOf = (flatIndex: number): string => order[flatIndex]?.groupId ?? DEFAULT_GROUP_ID;

  const clearDrag = () => {
    setPreview(null);
    setActiveEntry(null);
    setPreviewGroups(null);
    setActiveGroupDrag(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith(GROUP_ID_PREFIX)) {
      const group = effectiveGroups.find((g) => g.id === id.slice(GROUP_ID_PREFIX.length));
      if (!group) return;
      setPreviewGroups(effectiveGroups);
      setActiveGroupDrag({ group, count: entries.filter((e) => entryGid(e) === group.id).length });
      return;
    }
    const origIndex = Number(id.slice(ITEM_ID_PREFIX.length));
    if (!order[origIndex]) return;
    setPreview(order.map((item, i) => ({ item, origIndex: i })));
    setActiveEntry({ item: order[origIndex], origIndex });
  };

  /** Re-parent/reorder the preview while dragging so the UI shows where things will land. */
  const handleDragOver = (event: DragOverEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : '';

    // ── Group card dragged: swap cards live ──
    if (activeId.startsWith(GROUP_ID_PREFIX)) {
      if (!previewGroups || !overId.startsWith(GROUP_ID_PREFIX) || overId === activeId) return;
      const from = previewGroups.findIndex((g) => `${GROUP_ID_PREFIX}${g.id}` === activeId);
      const to = previewGroups.findIndex((g) => `${GROUP_ID_PREFIX}${g.id}` === overId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...previewGroups];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setPreviewGroups(next);
      return;
    }

    if (!preview || !activeId.startsWith(ITEM_ID_PREFIX) || !overId || overId === activeId) return;

    const from = preview.findIndex((e) => `${ITEM_ID_PREFIX}${e.origIndex}` === activeId);
    if (from < 0) return;
    const sourceGid = entryGid(preview[from]);

    // Determine insertion position (arrayMove semantics) and target group.
    let to: number;
    let targetGid: string;
    if (overId.startsWith(ITEM_ID_PREFIX)) {
      to = preview.findIndex((e) => `${ITEM_ID_PREFIX}${e.origIndex}` === overId);
      if (to < 0) return;
      targetGid = entryGid(preview[to]);
    } else {
      // Hovering a group card (header / collapsed / empty area) → start of that group.
      targetGid = overId.slice(GROUP_ID_PREFIX.length);
      if (targetGid === sourceGid) return;
      let start = 0;
      for (const g of effectiveGroups) {
        if (g.id === targetGid) break;
        start += preview.filter((e) => entryGid(e) === g.id).length;
      }
      to = from < start ? start - 1 : start;
    }

    // Non-editable views (musician) may reorder within a group but not regroup.
    if (!editable && targetGid !== sourceGid) return;
    if (to === from && targetGid === sourceGid) return;

    const next = [...preview];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, entryGid(moved) === targetGid ? moved : { ...moved, item: { ...moved.item, groupId: targetGid } });
    setPreview(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active?.id ?? '');
    const overId = event.over ? String(event.over.id) : '';

    // ── Item dragged: commit the live preview ──
    if (activeId.startsWith(ITEM_ID_PREFIX)) {
      const finalPreview = preview;
      clearDrag();
      if (!finalPreview || !overId) return;
      const origIndex = Number(activeId.slice(ITEM_ID_PREFIX.length));
      const pos = finalPreview.findIndex((e) => e.origIndex === origIndex);
      if (pos < 0) return;
      const targetGid = entryGid(finalPreview[pos]);
      if (pos === origIndex && targetGid === gidOf(origIndex)) return; // nothing moved
      onMoveItem(origIndex, pos, targetGid);
      return;
    }

    // ── Group card dragged: commit the live group preview ──
    const finalGroups = previewGroups;
    clearDrag();
    if (!finalGroups || !overId || !editable || !onReorderGroup) return;
    const sourceId = activeId.slice(GROUP_ID_PREFIX.length);
    const finalPos = finalGroups.findIndex((g) => g.id === sourceId);
    const startPos = effectiveGroups.findIndex((g) => g.id === sourceId);
    if (finalPos < 0 || startPos < 0 || finalPos === startPos) return; // nothing moved
    // reorderGroups(source, target) moves source to target's position — the group that sits
    // at the final position in the ORIGINAL array is exactly that target.
    onReorderGroup(sourceId, effectiveGroups[finalPos].id);
  };

  const commitRename = () => {
    if (editing) onRenameGroup?.(editing.id, editing.name.trim());
    setEditing(null);
  };

  return (
    <Box sx={{ py: 0.5 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={groupAwareCollision}
        modifiers={[lockToVerticalAxis]}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={clearDrag}
      >
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {view.map(({ group, items }) => {
            const expanded = !group.collapsed;
            return (
              <SortableGroupCard
                key={group.id}
                id={`${GROUP_ID_PREFIX}${group.id}`}
                disabled={!editable || !!editing}
                color={group.color}
                header={(dragHandleProps) => (
                  <Stack
                    direction="row"
                    {...dragHandleProps}
                    sx={{
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.5,
                      cursor: 'pointer',
                      touchAction: 'none',
                      bgcolor: group.color ? `${group.color}2E` : 'action.hover',
                    }}
                    onClick={() => onToggleCollapse(group.id)}
                  >
                    <IconButton size="small" sx={{ p: 0.25 }}>
                      {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
                    </IconButton>

                    {/* Label — click to rename inline (editable mode) */}
                    {editable && editing?.id === group.id ? (
                      <TextField
                        autoFocus
                        variant="standard"
                        size="small"
                        value={editing.name}
                        sx={{ flex: 1 }}
                        onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                    ) : (
                      <Typography
                        variant="subtitle2"
                        noWrap
                        sx={{ flex: 1, fontWeight: 700 }}
                        onClick={
                          editable
                            ? (e) => {
                                e.stopPropagation();
                                setEditing({ id: group.id, name: group.name });
                              }
                            : undefined
                        }
                      >
                        {groupDisplayName(group, LL.SHOW_GROUPS.DEFAULT())}
                      </Typography>
                    )}

                    {/* Item count — only useful while the items are hidden */}
                    {!expanded && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {items.length}
                      </Typography>
                    )}

                    {/* Remove group — only offered while the group is empty */}
                    {editable && group.id !== DEFAULT_GROUP_ID && items.length === 0 && (
                      <Tooltip title={LL.SHOW_GROUPS.DELETE()}>
                        <IconButton
                          size="small"
                          sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteGroup?.(group.id);
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}

                    {/* Color circle → color menu */}
                    {editable && (
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        onClick={(e: MouseEvent<HTMLElement>) => {
                          e.stopPropagation();
                          setColorMenu({ anchor: e.currentTarget, groupId: group.id });
                        }}
                      >
                        <CircleIcon fontSize="small" sx={{ color: group.color || 'text.disabled' }} />
                      </IconButton>
                    )}
                  </Stack>
                )}
              >
                {/* Group items (own nested sortable context) */}
                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <SortableContext
                    items={items.map(({ origIndex }) => `${ITEM_ID_PREFIX}${origIndex}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    <List disablePadding>
                      {items.map(({ item, origIndex }) => (
                        <SortableRow key={`${ITEM_ID_PREFIX}${origIndex}`} id={`${ITEM_ID_PREFIX}${origIndex}`}>
                          {renderItem(item, origIndex)}
                        </SortableRow>
                      ))}
                    </List>
                  </SortableContext>
                </Collapse>
              </SortableGroupCard>
            );
          })}
        </SortableContext>

        {/* The dragged item/group follows the cursor as an overlay; the in-list original stays as placeholder */}
        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeEntry ? (
            <Box sx={{ bgcolor: 'background.paper', boxShadow: 4, borderRadius: 1, overflow: 'hidden' }}>
              {renderItem(activeEntry.item, activeEntry.origIndex)}
            </Box>
          ) : activeGroupDrag ? (
            // Compact ghost of the dragged group: colored header bar with name + item count.
            <Box sx={{ bgcolor: 'background.paper', boxShadow: 4, borderRadius: 1, overflow: 'hidden' }}>
              <Stack
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: 0.5,
                  px: 1.5,
                  py: 0.75,
                  borderLeft: '3px solid',
                  borderColor: activeGroupDrag.group.color || 'divider',
                  bgcolor: activeGroupDrag.group.color ? `${activeGroupDrag.group.color}2E` : 'action.hover',
                }}
              >
                <Typography variant="subtitle2" noWrap sx={{ flex: 1, fontWeight: 700 }}>
                  {groupDisplayName(activeGroupDrag.group, LL.SHOW_GROUPS.DEFAULT())}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {activeGroupDrag.count}
                </Typography>
              </Stack>
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>

      {footer}

      {editable && (
        <Button
          fullWidth
          size="small"
          startIcon={<AddIcon />}
          sx={{ justifyContent: 'flex-start', px: 1.75, color: 'text.secondary', textTransform: 'none' }}
          onClick={() => setAddOpen(true)}
        >
          {LL.SHOW_GROUPS.ADD()}
        </Button>
      )}

      {/* Color menu (per group) — "no color" bubble first, then the presets */}
      <Menu anchorEl={colorMenu?.anchor ?? null} open={!!colorMenu} onClose={() => setColorMenu(null)}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, px: 1, py: 0.5 }}>
          <Tooltip title={LL.SHOW_GROUPS.NO_COLOR()}>
            <IconButton
              size="small"
              onClick={() => {
                if (colorMenu) onRecolorGroup?.(colorMenu.groupId, undefined);
                setColorMenu(null);
              }}
            >
              <NoColorIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </IconButton>
          </Tooltip>
          {GROUP_COLOR_PRESETS.map((color) => (
            <Tooltip key={color} title={color}>
              <IconButton
                size="small"
                onClick={() => {
                  if (colorMenu) onRecolorGroup?.(colorMenu.groupId, color);
                  setColorMenu(null);
                }}
              >
                <CircleIcon fontSize="small" sx={{ color }} />
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      </Menu>

      {/* Add group dialog */}
      <GroupNameDialog
        open={addOpen}
        title={LL.SHOW_GROUPS.ADD()}
        onClose={() => setAddOpen(false)}
        onSubmit={(name) => onAddGroup?.(name)}
      />
    </Box>
  );
};
