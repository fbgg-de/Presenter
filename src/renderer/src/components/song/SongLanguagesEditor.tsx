import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DragIndicator as DragIcon,
  Delete as DeleteIcon,
  KeyboardArrowUp as UpIcon,
  KeyboardArrowDown as DownIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { languageName } from '@/song/languageNames';
import { LanguagePicker } from '@/components/common/LanguagePicker';
import type { LyricEffect } from '@/song';

export type SongLanguagesEditorProps = {
  /** Ordered song languages; the first is the default. */
  languages: string[];
  /** Codes the account offers, plus anything already used in this library. */
  available: string[];
  /** Code → number of lyric lines carrying text in it, for the removal warning. */
  usage: Record<string, number>;
  /**
   * The new list, plus the rewrites of the stored lyrics it implies. Effects are empty for a
   * change that only reorders translations, which is purely a display order.
   */
  onChange: (languages: string[], effects: LyricEffect[]) => void;
};

const SortableRow = ({ code, children }: { code: string; children: React.ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: code });

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: 'background.default',
        opacity: isDragging ? 0.6 : 1,
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{ display: 'flex', alignItems: 'center', cursor: 'grab', touchAction: 'none', color: 'text.disabled' }}
      >
        <DragIcon fontSize="small" />
      </Box>
      {children}
    </Stack>
  );
};

/**
 * The song's language list: which translations the lyric editor offers, and in what order they
 * are shown. The first entry is the default language.
 *
 * Promoting a language to default rewrites the stored lyrics rather than just relabelling a
 * column — storage marks the default by the absence of a language tag — so that move is called
 * out in the UI and reported back through `effects`.
 */
export const SongLanguagesEditor = ({ languages, available, usage, onChange }: SongLanguagesEditorProps) => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings();
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const label = (code: string) => {
    const name = languageName(code, uiLanguage);
    return name === code ? code : name;
  };

  /** Reordering only matters structurally when it changes which language sits at index 0. */
  const commitOrder = (next: string[]) => {
    const effects: LyricEffect[] = next[0] !== languages[0] ? [{ kind: 'promote', from: languages[0], to: next[0] }] : [];
    onChange(next, effects);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= languages.length) return;
    commitOrder(arrayMove(languages, from, to));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commitOrder(arrayMove(languages, languages.indexOf(String(active.id)), languages.indexOf(String(over.id))));
  };

  const remove = (code: string) => {
    const next = languages.filter((entry) => entry !== code);
    const effects: LyricEffect[] = [];

    // Removing the default first hands the untagged slot to whatever becomes the new default,
    // otherwise dropping it would take the untagged lyrics with it.
    if (code === languages[0] && next.length > 0) effects.push({ kind: 'promote', from: code, to: next[0] });
    effects.push({ kind: 'drop', code });

    onChange(next, effects);
    setPendingRemoval(null);
  };

  const requestRemove = (code: string) => {
    if ((usage[code] ?? 0) > 0) setPendingRemoval(code);
    else remove(code);
  };

  const add = (code: string) => {
    const normalised = code.trim().toUpperCase();
    if (!normalised || languages.includes(normalised)) return;

    // The first language added to a song that had none becomes the default, and the lyrics
    // already sitting in the untagged slot are exactly what it describes — no rewrite needed.
    onChange([...languages, normalised], []);
  };

  return (
    <Stack sx={{ gap: 1 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {LL.SONG_EDITOR.LANGUAGES()}
      </Typography>

      {languages.length === 0 ? (
        <Alert severity="info" variant="outlined">
          {LL.SONG_EDITOR.NO_LANGUAGES()}
        </Alert>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={languages} strategy={verticalListSortingStrategy}>
            <Stack sx={{ gap: 0.5 }}>
              {languages.map((code, index) => (
                <SortableRow key={code} code={code}>
                  <Chip
                    size="small"
                    label={code}
                    color={index === 0 ? 'primary' : 'default'}
                    icon={index === 0 ? <StarIcon sx={{ fontSize: 14 }} /> : undefined}
                    sx={{ fontFamily: 'monospace', minWidth: 64 }}
                  />
                  <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
                    {label(code)}
                  </Typography>
                  {index === 0 && (
                    <Typography variant="caption" color="primary" sx={{ whiteSpace: 'nowrap' }}>
                      {LL.SONG_EDITOR.DEFAULT_LANGUAGE()}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                    {LL.SONG_EDITOR.LANGUAGE_LINE_COUNT({ count: usage[code] ?? 0 })}
                  </Typography>
                  <IconButton size="small" disabled={index === 0} onClick={() => move(index, index - 1)} title={LL.COMMON.MOVE_UP()}>
                    <UpIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={index === languages.length - 1}
                    onClick={() => move(index, index + 1)}
                    title={LL.COMMON.MOVE_DOWN()}
                  >
                    <DownIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => requestRemove(code)} title={LL.COMMON.DELETE()}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </SortableRow>
              ))}
            </Stack>
          </SortableContext>
        </DndContext>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { sm: 'center' } }}>
        <LanguagePicker selected={languages} suggested={available} onAdd={add} />
        {languages.length > 1 && (
          <Tooltip title={LL.SONG_EDITOR.DEFAULT_LANGUAGE_HINT()}>
            <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
              {LL.SONG_EDITOR.LANGUAGE_ORDER_HINT()}
            </Typography>
          </Tooltip>
        )}
      </Stack>

      <Dialog open={pendingRemoval !== null} onClose={() => setPendingRemoval(null)}>
        <DialogTitle>{LL.SONG_EDITOR.REMOVE_LANGUAGE_TITLE({ code: pendingRemoval ?? '' })}</DialogTitle>
        <DialogContent>
          <Typography>
            {LL.SONG_EDITOR.REMOVE_LANGUAGE_MESSAGE({
              name: pendingRemoval ? label(pendingRemoval) : '',
              count: pendingRemoval ? (usage[pendingRemoval] ?? 0) : 0,
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRemoval(null)}>{LL.COMMON.CANCEL()}</Button>
          <Button color="error" variant="contained" onClick={() => pendingRemoval && remove(pendingRemoval)}>
            {LL.COMMON.DELETE()}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
