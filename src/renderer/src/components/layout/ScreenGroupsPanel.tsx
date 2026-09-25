/**
 * Screen groups as a board: one column per group, and a side tray for adding groups (and for
 * windows in no group, which only happens while there are no groups yet).
 *
 * Each column shows the group's windows as a small canvas (the physical outputs side by side),
 * the window list with open/closed state, and everything the group decides: layers, text layout,
 * languages and transparency. Windows are dragged between columns; the select on a column is the
 * keyboard-friendly way to do the same. Groups are account-wide; membership goes through
 * `onAssign`, which the Window Manager routes through the rig's three-way update, so a move
 * applies to an open window at once. Every window is in a group, so there is no "remove".
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ContentCopy as DuplicateIcon, DeleteOutlined as DeleteIcon, DragIndicator as DragIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { Segmented } from '@/components/media/Viewer';
import type { RigWindow } from '@/hooks/usePresentationWindows';
import {
  useCreateScreenGroupMutation,
  useDeleteScreenGroupMutation,
  useGetScreenGroupsQuery,
  useUpdateScreenGroupMutation,
} from '@/api/screenGroups.api';
import {
  SCREEN_GROUP_KINDS,
  emptyScreenGroupData,
  normaliseScreenGroupData,
  type ScreenGroupEntity,
  type ScreenGroupKind,
  type ScreenGroupLayers,
} from '@/screens/types';
import { StageLayoutEditor } from '@/components/stage/StageLayoutEditor';
import { LanguagePicker } from '@/components/common/LanguagePicker';
import { useAccountLanguages } from '@/hooks/useAccountLanguages';
import { ScreenSetsSection } from './ScreenSetsSection';

const LAYER_KEYS: Array<keyof ScreenGroupLayers> = ['background', 'slides', 'media', 'bibleVerses', 'overlays'];
const DRAG_TYPE = 'application/x-presenter-window';
const STREAM_LINE_CHOICES = [1, 2, 3, 4];

export interface ScreenGroupsPanelProps {
  windows: RigWindow[];
  onAssign: (windowId: string, groupId: number) => void;
}

/** The group name, edited in place: click to rename, Enter or blur to save. */
const GroupName = ({ value, label, onCommit }: { value: string; label: string; onCommit: (name: string) => void }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <Tooltip title={label}>
        <Typography
          variant="subtitle2"
          noWrap
          onClick={() => setEditing(true)}
          sx={{ fontWeight: 700, cursor: 'text', minWidth: 0, flex: 1 }}
        >
          {value}
        </Typography>
      </Tooltip>
    );
  }
  return (
    <TextField
      size="small"
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const name = draft.trim();
        if (name && name !== value) onCommit(name);
        else setDraft(value);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      sx={{ flex: 1, '& input': { py: 0.5, fontWeight: 700 } }}
    />
  );
};

/** A window row that can be dragged into another group. */
const WindowRowChip = ({ win, dashed, hint }: { win: RigWindow; dashed?: boolean; hint?: string }) => (
  <Stack
    direction="row"
    draggable
    onDragStart={(e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, win.id);
      e.dataTransfer.effectAllowed = 'move';
    }}
    spacing={0.75}
    sx={{
      alignItems: 'center',
      px: 0.75,
      py: 0.4,
      borderRadius: 1,
      bgcolor: 'action.hover',
      border: dashed ? '1px dashed' : '1px solid transparent',
      borderColor: 'divider',
      cursor: 'grab',
      minWidth: 0,
    }}
  >
    <DragIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: win.isOpen ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
    <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
      {win.name}
    </Typography>
    {hint && (
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', flexShrink: 0 }}>
        {hint}
      </Typography>
    )}
  </Stack>
);

export const ScreenGroupsPanel = ({ windows, onAssign }: ScreenGroupsPanelProps) => {
  const { LL } = useI18nContext();
  const G = LL.SCREEN_GROUP;
  const { data: groups = [] } = useGetScreenGroupsQuery();
  const [createGroup] = useCreateScreenGroupMutation();
  const [updateGroup] = useUpdateScreenGroupMutation();
  const [deleteGroup] = useDeleteScreenGroupMutation();
  const [pendingDelete, setPendingDelete] = useState<ScreenGroupEntity | null>(null);
  const [kindMenu, setKindMenu] = useState<{ anchor: HTMLElement; group: ScreenGroupEntity } | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const { available: accountLanguages } = useAccountLanguages();

  const kindLabel = (kind: ScreenGroupKind): string =>
    ({ audience: G.KIND_AUDIENCE(), stage: G.KIND_STAGE(), stream: G.KIND_STREAM(), wall: G.KIND_WALL(), custom: G.KIND_CUSTOM() })[kind];
  const layerLabel = (key: keyof ScreenGroupLayers): string =>
    ({
      background: G.LAYER_BACKGROUND(),
      slides: G.LAYER_SLIDES(),
      media: G.LAYER_MEDIA(),
      bibleVerses: G.LAYER_BIBLE(),
      overlays: G.LAYER_OVERLAYS(),
    })[key];

  const run = async (request: Promise<unknown>) => {
    try {
      await request;
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  // A window opened outside the list has no saved config to hold its membership.
  const assignable = useMemo(() => windows.filter((w) => !w.unmanaged), [windows]);
  const unassigned = assignable.filter((w) => w.config.screenGroupId === undefined || !groups.some((g) => g.id === w.config.screenGroupId));

  // Names are unique per account, so a second "Stage" becomes "Stage 2".
  const freeName = (base: string) => {
    const taken = new Set(groups.map((g) => g.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    return name;
  };
  const add = (kind: ScreenGroupKind) =>
    void run(createGroup({ name: freeName(kindLabel(kind)), sort_order: groups.length, data: emptyScreenGroupData(kind) }).unwrap());
  // A second group with the same settings, e.g. "LED right" next to "LED left". Windows stay put.
  const duplicate = (group: ScreenGroupEntity) =>
    void run(
      createGroup({
        name: freeName(group.name),
        sort_order: groups.length,
        data: structuredClone(normaliseScreenGroupData(group.data)),
      }).unwrap(),
    );

  const dropProps = (target: number) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      if (dropTarget !== target) setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((current) => (current === target ? null : current)),
    onDrop: (e: DragEvent) => {
      const id = e.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (id) onAssign(id, target);
    },
  });

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {G.HINT()}
      </Typography>

      {failed && (
        <Alert severity="error" onClose={() => setFailed(false)}>
          {G.SAVE_FAILED()}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: 'stretch' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {groups.length === 0 ? (
            <Stack sx={{ py: 5, alignItems: 'center', gap: 0.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1.5 }}>
              <Typography variant="body2">{G.EMPTY()}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {G.EMPTY_HINT()}
              </Typography>
            </Stack>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 1.25 }}>
              {groups.map((group) => {
                const data = normaliseScreenGroupData(group.data);
                const members = assignable.filter((w) => w.config.screenGroupId === group.id);
                const others = assignable.filter((w) => w.config.screenGroupId !== group.id);
                const dropping = dropTarget === group.id;
                return (
                  <Paper
                    key={group.id}
                    variant="outlined"
                    {...dropProps(group.id)}
                    sx={(theme) => ({
                      p: 1.25,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                      borderRadius: 1.5,
                      bgcolor: dropping ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
                      borderColor: dropping ? 'primary.main' : 'divider',
                    })}
                  >
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                      <GroupName
                        value={group.name}
                        label={G.NAME()}
                        onCommit={(name) => void run(updateGroup({ id: group.id, name }).unwrap())}
                      />
                      <Box
                        component="button"
                        onClick={(e) => setKindMenu({ anchor: e.currentTarget, group })}
                        sx={(theme) => ({
                          border: 0,
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.6rem',
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                          px: 0.75,
                          py: 0.25,
                          borderRadius: 0.5,
                          bgcolor: alpha('#f0a94a', theme.palette.mode === 'dark' ? 0.22 : 0.18),
                          color: theme.palette.mode === 'dark' ? '#ffd49a' : '#8a5300',
                          flexShrink: 0,
                        })}
                      >
                        {kindLabel(data.kind)}
                      </Box>
                      <Tooltip title={G.DUPLICATE()}>
                        <IconButton size="small" aria-label={G.DUPLICATE()} onClick={() => duplicate(group)} sx={{ p: 0.25 }}>
                          <DuplicateIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" aria-label={G.DELETE()} onClick={() => setPendingDelete(group)} sx={{ p: 0.25 }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Stack>

                    {/* The group's outputs side by side. */}
                    <Stack direction="row" spacing={0.4} sx={{ p: 0.75, borderRadius: 1, bgcolor: 'action.hover' }}>
                      {members.length === 0 ? (
                        <Stack
                          sx={{
                            flex: 1,
                            aspectRatio: '16/9',
                            border: '1px dashed',
                            borderColor: 'divider',
                            borderRadius: 0.5,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.62rem', textAlign: 'center', px: 0.5 }}>
                            {G.DROP_HERE()}
                          </Typography>
                        </Stack>
                      ) : (
                        members.map((w) => (
                          <Stack
                            key={w.id}
                            sx={{
                              flex: 1,
                              minWidth: 0,
                              aspectRatio: '16/9',
                              borderRadius: 0.5,
                              border: '1px dashed',
                              borderColor: w.isOpen ? 'success.main' : 'divider',
                              bgcolor: w.isOpen ? '#11151c' : 'transparent',
                              justifyContent: 'flex-end',
                              px: 0.4,
                            }}
                          >
                            <Typography
                              variant="caption"
                              noWrap
                              sx={{ fontSize: '0.58rem', color: w.isOpen ? '#cfd3db' : 'text.secondary' }}
                            >
                              {w.name}
                            </Typography>
                          </Stack>
                        ))
                      )}
                    </Stack>

                    <Stack spacing={0.5}>
                      {members.map((w) => (
                        <WindowRowChip key={w.id} win={w} hint={w.isOpen ? undefined : G.CLOSED()} />
                      ))}
                      {others.length > 0 && (
                        <TextField
                          select
                          size="small"
                          label={G.ADD_WINDOW()}
                          value=""
                          onChange={(e) => onAssign(e.target.value, group.id)}
                          sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem' } }}
                        >
                          {others.map((w) => {
                            const current = groups.find((g) => g.id === w.config.screenGroupId);
                            return (
                              <MenuItem key={w.id} value={w.id}>
                                {w.name}
                                {current && (
                                  <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                                    {G.IN_GROUP({ group: current.name })}
                                  </Typography>
                                )}
                              </MenuItem>
                            );
                          })}
                        </TextField>
                      )}
                    </Stack>

                    <Stack sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
                      {LAYER_KEYS.map((key) => (
                        <Stack key={key} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {layerLabel(key)}
                          </Typography>
                          <Switch
                            size="small"
                            checked={data.layers[key]}
                            onChange={(e) =>
                              void run(
                                updateGroup({
                                  id: group.id,
                                  data: { ...data, layers: { ...data.layers, [key]: e.target.checked } },
                                }).unwrap(),
                              )
                            }
                          />
                        </Stack>
                      ))}
                    </Stack>

                    {/* How the text is laid out, which languages, and a see-through window for keying. */}
                    <Stack spacing={0.75} sx={{ borderTop: 1, borderColor: 'divider', pt: 0.75 }}>
                      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {G.DISPLAY()}
                        </Typography>
                        <Segmented
                          size="small"
                          value={data.display.mode}
                          options={[
                            { value: 'normal', label: G.DISPLAY_NORMAL() },
                            { value: 'stream', label: G.DISPLAY_STREAM_SHORT() },
                          ]}
                          onChange={(mode) =>
                            void run(updateGroup({ id: group.id, data: { ...data, display: { ...data.display, mode } } }).unwrap())
                          }
                        />
                      </Stack>
                      {data.display.mode === 'stream' && (
                        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {G.DISPLAY_LINES()}
                          </Typography>
                          <Segmented
                            size="small"
                            value={String(data.display.lines)}
                            options={STREAM_LINE_CHOICES.map((lines) => ({ value: String(lines), label: lines }))}
                            onChange={(lines) =>
                              void run(
                                updateGroup({
                                  id: group.id,
                                  data: { ...data, display: { ...data.display, lines: Number(lines) } },
                                }).unwrap(),
                              )
                            }
                          />
                        </Stack>
                      )}

                      <Stack spacing={0.5}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                          {G.LANGUAGES()}
                        </Typography>
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                          {data.languages.length === 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={G.LANGUAGES_FROM_THEME()}
                              sx={{ height: 22, fontSize: '0.7rem' }}
                            />
                          )}
                          {data.languages.map((code) => (
                            <Chip
                              key={code}
                              size="small"
                              label={code}
                              onDelete={() =>
                                void run(
                                  updateGroup({
                                    id: group.id,
                                    data: { ...data, languages: data.languages.filter((c) => c !== code) },
                                  }).unwrap(),
                                )
                              }
                              sx={{ height: 22 }}
                            />
                          ))}
                          <LanguagePicker
                            selected={data.languages}
                            suggested={accountLanguages}
                            onAdd={(code) =>
                              void run(updateGroup({ id: group.id, data: { ...data, languages: [...data.languages, code] } }).unwrap())
                            }
                          />
                        </Stack>
                      </Stack>

                      <Tooltip title={G.TRANSPARENT_HINT()}>
                        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                            {G.TRANSPARENT()}
                          </Typography>
                          <Switch
                            size="small"
                            checked={data.transparent}
                            onChange={(e) =>
                              void run(updateGroup({ id: group.id, data: { ...data, transparent: e.target.checked } }).unwrap())
                            }
                          />
                        </Stack>
                      </Tooltip>
                    </Stack>

                    {data.kind === 'stage' && data.stage && (
                      <StageLayoutEditor
                        value={data.stage}
                        onChange={(stage) => void run(updateGroup({ id: group.id, data: { ...data, stage } }).unwrap())}
                      />
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>

        {/* Side tray: adding groups, and windows in no group while there are none to join. */}
        <Stack
          spacing={1}
          sx={{
            width: { xs: '100%', md: 210 },
            flexShrink: 0,
            p: 1.25,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'divider',
          }}
        >
          {unassigned.length > 0 && (
            <>
              <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                {G.UNASSIGNED()}
              </Typography>
              {unassigned.map((w) => (
                <WindowRowChip key={w.id} win={w} dashed hint={G.DRAG_HINT()} />
              ))}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {G.UNASSIGNED_HINT()}
              </Typography>
            </>
          )}

          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6, pt: unassigned.length > 0 ? 1 : 0 }}>
            {G.ADD()}
          </Typography>
          {SCREEN_GROUP_KINDS.map((kind) => (
            <Button
              key={kind}
              size="small"
              variant={kind === 'custom' ? 'text' : 'outlined'}
              color="inherit"
              onClick={() => add(kind)}
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
            >
              + {kindLabel(kind)}
            </Button>
          ))}
          <Typography variant="caption" sx={{ color: 'text.secondary', pt: 1, lineHeight: 1.5 }}>
            {G.NOT_JOINED_HINT()}
          </Typography>
        </Stack>
      </Stack>

      <ScreenSetsSection />

      <Menu anchorEl={kindMenu?.anchor} open={!!kindMenu} onClose={() => setKindMenu(null)}>
        {SCREEN_GROUP_KINDS.map((kind) => (
          <MenuItem
            key={kind}
            selected={kindMenu ? normaliseScreenGroupData(kindMenu.group.data).kind === kind : false}
            onClick={() => {
              if (kindMenu) {
                const data = normaliseScreenGroupData(kindMenu.group.data);
                void run(updateGroup({ id: kindMenu.group.id, data: { ...data, kind } }).unwrap());
              }
              setKindMenu(null);
            }}
          >
            {kindLabel(kind)}
          </MenuItem>
        ))}
      </Menu>

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{G.DELETE()}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2">{G.DELETE_CONFIRM({ name: pendingDelete?.name ?? '' })}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              // Windows of a deleted group join the default group on their own (see usePresentationWindows).
              if (pendingDelete) void run(deleteGroup({ id: pendingDelete.id }).unwrap());
              setPendingDelete(null);
            }}
          >
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
