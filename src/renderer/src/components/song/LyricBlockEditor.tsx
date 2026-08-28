import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Box, Chip, Divider, IconButton, InputBase, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import {
  DragIndicator as DragIcon,
  Delete as DeleteIcon,
  AddCircleOutlined as AddLineIcon,
  InsertPageBreak as PageBreakIcon,
  Notes as RawIcon,
  ViewAgenda as BlocksIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { languageName } from '@/song/languageNames';
import {
  SONG_BLOCK_SEPARATOR,
  PRIMARY_LANGUAGE_KEY,
  createLyricLine,
  itemsToPages,
  lyricItemId,
  nextLyricId,
  pagesToItems,
  pagesToRawText,
  rawTextToPages,
  type LyricItem,
  type LyricPage,
} from '@/song';

export type LyricBlockEditorProps = {
  pages: LyricPage[];
  /** Ordered song languages; the first is the default, held untagged. Empty for an untagged song. */
  languages: string[];
  /** Which of `languages` to show while editing. Purely a view filter — nothing is discarded. */
  visibleLanguages: string[];
  onVisibleLanguagesChange: (visible: string[]) => void;
  onChange: (pages: LyricPage[]) => void;
};

/** The key a language occupies on a lyric line: the default language holds the untagged text. */
const columnKey = (languages: string[], index: number) => (index === 0 ? PRIMARY_LANGUAGE_KEY : languages[index]);

const focusKey = (lineId: string, key: string) => `${lineId}|${key}`;

/**
 * One lyric line: the default-language text with its translations stacked underneath, kept
 * together in a single card so a line and its translations move, and read, as one thing.
 */
const LyricRow = ({
  line,
  columns,
  pageLineNumber,
  registerInput,
  onText,
  onKeyDown,
  onPaste,
  onInsertAfter,
  onDelete,
  labels,
}: {
  line: { id: string; texts: Record<string, string> };
  columns: { key: string; code: string; name: string; isDefault: boolean }[];
  pageLineNumber: number;
  registerInput: (key: string, element: HTMLInputElement | null) => void;
  onText: (lineId: string, key: string, value: string) => void;
  onKeyDown: (event: KeyboardEvent<Element>, lineId: string, key: string) => void;
  onPaste: (event: ClipboardEvent<Element>, lineId: string, key: string) => void;
  onInsertAfter: (lineId: string) => void;
  onDelete: (lineId: string) => void;
  labels: { addLine: string; deleteLine: string; placeholder: string; translationPlaceholder: (name: string) => string };
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: line.id });

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        alignItems: 'stretch',
        gap: 0.5,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        transition,
        // The row actions are noise until you are working on that line — but only where
        // hovering is a real thing. iOS leaves a simulated hover behind after a tap, so every
        // row you had touched stayed lit up, which is not how it behaves with a mouse.
        // Touch devices get them permanently instead: always there beats sometimes stuck.
        '@media (hover: hover)': {
          '& .lyric-row-actions': { opacity: 0 },
          '&:hover .lyric-row-actions, &:focus-within .lyric-row-actions': { opacity: 1 },
        },
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <Stack
        {...attributes}
        {...listeners}
        sx={{
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 34,
          cursor: 'grab',
          touchAction: 'none',
          color: 'text.disabled',
          borderRight: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" sx={{ fontFamily: 'monospace', lineHeight: 1 }}>
          {pageLineNumber}
        </Typography>
        <DragIcon sx={{ fontSize: 16 }} />
      </Stack>

      <Stack sx={{ flexGrow: 1, minWidth: 0, py: 0.25 }}>
        {columns.map((column) => (
          <Stack key={column.key} direction="row" sx={{ alignItems: 'center', gap: 1, px: 1, py: 0.25 }}>
            {columns.length > 1 && (
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  minWidth: 26,
                  textAlign: 'right',
                  color: column.isDefault ? 'primary.main' : 'text.disabled',
                  flexShrink: 0,
                }}
              >
                {column.code}
              </Typography>
            )}
            <InputBase
              fullWidth
              inputRef={(element: HTMLInputElement | null) => registerInput(focusKey(line.id, column.key), element)}
              value={line.texts[column.key] ?? ''}
              onChange={({ target }) => onText(line.id, column.key, target.value)}
              onKeyDown={(event) => onKeyDown(event, line.id, column.key)}
              onPaste={(event) => onPaste(event, line.id, column.key)}
              placeholder={column.isDefault ? labels.placeholder : labels.translationPlaceholder(column.name)}
              sx={{
                fontSize: column.isDefault ? '0.95rem' : '0.85rem',
                color: column.isDefault ? 'text.primary' : 'text.secondary',
                fontStyle: column.isDefault ? 'normal' : 'italic',
              }}
            />
          </Stack>
        ))}
      </Stack>

      <Stack className="lyric-row-actions" direction="row" sx={{ alignItems: 'center', transition: 'opacity 120ms ease', flexShrink: 0 }}>
        <IconButton size="small" onClick={() => onInsertAfter(line.id)} title={labels.addLine}>
          <AddLineIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" color="error" onClick={() => onDelete(line.id)} title={labels.deleteLine}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
};

/** A page break, draggable like a line so moving one re-splits the block. */
const BreakRow = ({ id, label, onRemove, removeLabel }: { id: string; label: string; onRemove: () => void; removeLabel: string }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        opacity: isDragging ? 0.5 : 1,
        // Translate, not Transform: dnd-kit's transform also carries a scale that squares the
        // dragged row up to the height of the one it is passing. A break is the short row in a
        // list of taller ones, so that scale stretched its chip and rules while it moved.
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        transition,
        '&:hover .break-remove': { opacity: 1 },
      }}
    >
      <Box {...attributes} {...listeners} sx={{ display: 'flex', cursor: 'grab', touchAction: 'none', color: 'text.disabled' }}>
        <DragIcon fontSize="small" />
      </Box>
      <Divider sx={{ flexGrow: 1, borderStyle: 'dashed' }} />
      <Chip size="small" variant="outlined" icon={<PageBreakIcon sx={{ fontSize: 14 }} />} label={label} />
      <Divider sx={{ flexGrow: 1, borderStyle: 'dashed' }} />
      <IconButton size="small" className="break-remove" sx={{ opacity: 0 }} onClick={onRemove} title={removeLabel}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};

/**
 * Block lyrics as a list of lines rather than one textarea.
 *
 * Each line owns its translations, so they stay together when the line moves and there is no
 * way to leave a translation stranded under the wrong line. What is stored does not change:
 * the lines are serialised back to the same flat `string[]` the presentation reads (see
 * `song/lyrics.ts`), and the raw mode below hands that exact text over for bulk edits.
 */
export const LyricBlockEditor = ({ pages, languages, visibleLanguages, onVisibleLanguagesChange, onChange }: LyricBlockEditorProps) => {
  const { LL } = useI18nContext();
  const { uiLanguage } = useGetSettings();
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const rawRef = useRef<HTMLTextAreaElement | null>(null);

  const inputs = useRef(new Map<string, HTMLInputElement>());
  // Focus has to wait for the row to exist, so an edit records where the caret should go and
  // the effect below moves it once React has committed the new list.
  const pendingFocus = useRef<{ key: string; caret?: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const items = useMemo(() => pagesToItems(pages), [pages]);

  const columns = useMemo(() => {
    const source = languages.length > 0 ? languages : [''];

    return source
      .map((code, index) => ({
        key: columnKey(source, index),
        code: code || '',
        name: code ? languageName(code, uiLanguage) : '',
        isDefault: index === 0,
      }))
      .filter((column) => column.code === '' || visibleLanguages.includes(column.code));
  }, [languages, visibleLanguages, uiLanguage]);

  useEffect(() => {
    if (!pendingFocus.current) return;

    const { key, caret } = pendingFocus.current;
    pendingFocus.current = null;

    const element = inputs.current.get(key);
    if (!element) return;

    element.focus();
    if (caret !== undefined) element.setSelectionRange(caret, caret);
  });

  const commit = (next: LyricItem[]) => onChange(itemsToPages(next, pages[0]?.id));

  const registerInput = (key: string, element: HTMLInputElement | null) => {
    if (element) inputs.current.set(key, element);
    else inputs.current.delete(key);
  };

  const lineIds = useMemo(() => items.filter((item) => item.kind === 'line').map((item) => lyricItemId(item)), [items]);

  const setText = (lineId: string, key: string, value: string) =>
    commit(
      items.map((item) =>
        item.kind === 'line' && item.line.id === lineId
          ? { ...item, line: { ...item.line, texts: { ...item.line.texts, [key]: value } } }
          : item,
      ),
    );

  const insertAfter = (lineId: string) => {
    const line = createLyricLine();
    const index = items.findIndex((item) => lyricItemId(item) === lineId);
    const next = [...items];
    next.splice(index + 1, 0, { kind: 'line', line });

    pendingFocus.current = { key: focusKey(line.id, columns[0]?.key ?? PRIMARY_LANGUAGE_KEY), caret: 0 };
    commit(next);
  };

  const deleteLine = (lineId: string) => {
    const index = lineIds.indexOf(lineId);
    // Never leave a block with nothing to type into.
    if (lineIds.length <= 1) {
      commit(items.map((item) => (item.kind === 'line' && item.line.id === lineId ? { kind: 'line', line: createLyricLine() } : item)));
      return;
    }

    const focusOn = lineIds[index > 0 ? index - 1 : 1];
    pendingFocus.current = { key: focusKey(focusOn, columns[0]?.key ?? PRIMARY_LANGUAGE_KEY) };
    commit(items.filter((item) => lyricItemId(item) !== lineId));
  };

  const breakAfter = (lineId: string) => {
    const index = items.findIndex((item) => lyricItemId(item) === lineId);
    const next = [...items];
    next.splice(index + 1, 0, { kind: 'break', id: nextLyricId('page') });
    commit(next);
  };

  const removeBreak = (id: string) => commit(items.filter((item) => lyricItemId(item) !== id));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    const from = items.findIndex((item) => lyricItemId(item) === active.id);
    const to = items.findIndex((item) => lyricItemId(item) === over.id);
    if (from < 0 || to < 0) return;

    commit(arrayMove(items, from, to));
  };

  /**
   * Enter walks down the column and only adds a line at the end of it, Backspace at the start of
   * an empty line joins, and the arrows walk the same language column up and down — so the block
   * still types like the textarea it replaced.
   */
  const handleKeyDown = (event: KeyboardEvent<Element>, lineId: string, key: string) => {
    const input = event.target as HTMLInputElement;
    const index = lineIds.indexOf(lineId);

    if (event.key === 'Enter') {
      event.preventDefault();
      // Text to the right of the caret moves down with the new line, as in any text editor.
      const tail = input.value.slice(input.selectionStart ?? input.value.length);
      const head = input.value.slice(0, input.selectionStart ?? input.value.length);

      // Nothing to carry down and a line already below: Enter goes there instead of adding one.
      // Filling a block is mostly moving through lines that exist — a translation beside a verse,
      // a pasted stanza — so Enter reaching the next one beats it inserting a blank every time.
      // A new line is still what you get at the end of the column, which is where you write.
      const lineBelow = lineIds[index + 1];
      const below = tail === '' && lineBelow ? inputs.current.get(focusKey(lineBelow, key)) : undefined;

      if (below) {
        below.focus();
        below.setSelectionRange(below.value.length, below.value.length);
        return;
      }

      const line = createLyricLine(tail ? { [key]: tail } : {});
      const at = items.findIndex((item) => lyricItemId(item) === lineId);
      const next = items.map((item) =>
        item.kind === 'line' && item.line.id === lineId
          ? { ...item, line: { ...item.line, texts: { ...item.line.texts, [key]: head } } }
          : item,
      );
      next.splice(at + 1, 0, { kind: 'line', line });

      pendingFocus.current = { key: focusKey(line.id, key), caret: 0 };
      commit(next);
      return;
    }

    // Backspace at the very start of an empty field walks back to the line above, and takes
    // this line with it when nothing else on it holds text. With text still in the field it
    // stays an ordinary delete.
    if (
      event.key === 'Backspace' &&
      input.value === '' &&
      (input.selectionStart ?? 0) === 0 &&
      (input.selectionEnd ?? 0) === 0 &&
      index > 0
    ) {
      event.preventDefault();

      const previous = lineIds[index - 1];
      const caret = inputs.current.get(focusKey(previous, key))?.value.length;
      const item = items.find((entry) => entry.kind === 'line' && entry.line.id === lineId);
      const lineIsEmpty = item?.kind === 'line' && Object.values(item.line.texts).every((text) => text === '');

      pendingFocus.current = { key: focusKey(previous, key), caret };

      if (lineIsEmpty) commit(items.filter((entry) => lyricItemId(entry) !== lineId));
      else inputs.current.get(focusKey(previous, key))?.focus();

      return;
    }

    // The arrows walk the same language column, so holding a translation column and moving
    // down stays in that column instead of falling into the next line's default text.
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;

    if (step !== 0) {
      const target = lineIds[index + step];
      const element = target ? inputs.current.get(focusKey(target, key)) : undefined;

      if (element) {
        event.preventDefault();
        element.focus();
        element.setSelectionRange(element.value.length, element.value.length);
      }
    }
  };

  /** Pasting a verse creates one line per pasted line instead of cramming it into one field. */
  const handlePaste = (event: ClipboardEvent<Element>, lineId: string, key: string) => {
    const text = event.clipboardData.getData('text');
    if (!text.includes('\n')) return;

    event.preventDefault();

    const input = event.target as HTMLInputElement;
    const parts = text.split(/\r?\n/);
    const head = input.value.slice(0, input.selectionStart ?? 0);
    const tail = input.value.slice(input.selectionEnd ?? 0);

    const at = items.findIndex((item) => lyricItemId(item) === lineId);
    const first = `${head}${parts[0]}`;
    const created = parts.slice(1).map((part, i) => createLyricLine({ [key]: i === parts.length - 2 ? `${part}${tail}` : part }));

    const next = items.map((item) =>
      item.kind === 'line' && item.line.id === lineId
        ? { ...item, line: { ...item.line, texts: { ...item.line.texts, [key]: first } } }
        : item,
    );
    next.splice(at + 1, 0, ...created.map((line) => ({ kind: 'line' as const, line })));

    const last = created[created.length - 1];
    if (last) pendingFocus.current = { key: focusKey(last.id, key), caret: (last.texts[key]?.length ?? 0) - tail.length };

    commit(next);
  };

  /**
   * Put the caret back where the edit left it.
   *
   * The textarea is controlled, so React re-renders with the new value and the browser drops the
   * selection to the end. Restoring it after the commit is what makes the insert buttons feel
   * like typing rather than like a paste that loses your place.
   */
  const restoreCaret = (element: HTMLTextAreaElement, at: number) => {
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(at, at);
    });
  };

  /**
   * Put a language tag at the start of the caret's line, replacing one already there.
   *
   * A tag only means anything at the start of a line, so the button places it there rather than
   * wherever the caret happens to sit — and swapping a line from one language to another is then
   * the same single click as tagging it in the first place.
   */
  const insertLanguageTag = (code: string) => {
    const element = rawRef.current;
    if (!element) return;

    const caret = element.selectionStart ?? rawText.length;
    const lineStart = rawText.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
    const existing = rawText.slice(lineStart).match(/^\[[A-Za-z]{2,5}\] ?/);
    const tag = `[${code}] `;

    const next = rawText.slice(0, lineStart) + tag + rawText.slice(lineStart + (existing?.[0].length ?? 0));
    setRawText(next);
    restoreCaret(element, caret + tag.length - (existing?.[0].length ?? 0));
  };

  /** Open a new page after the caret's line, the way the block view's page break does. */
  const insertSeparator = () => {
    const element = rawRef.current;
    if (!element) return;

    const caret = element.selectionStart ?? rawText.length;
    const lineEnd = rawText.indexOf('\n', caret);
    const at = lineEnd === -1 ? rawText.length : lineEnd;
    const snippet = `\n${SONG_BLOCK_SEPARATOR}`;

    setRawText(rawText.slice(0, at) + snippet + rawText.slice(at));
    restoreCaret(element, at + snippet.length);
  };

  const toggleRaw = (next: boolean) => {
    if (next) setRawText(pagesToRawText(pages, languages));
    else onChange(rawTextToPages(rawText, languages[0]));

    setRaw(next);
  };

  const pageCount = items.filter((item) => item.kind === 'break').length + 1;
  let pageIndex = 0;
  let lineNumber = 0;

  return (
    <Stack sx={{ gap: 1 }}>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {languages.length > 1 && (
          <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary">
              {LL.SONG_EDITOR.SHOW_LANGUAGES()}
            </Typography>
            {languages.map((code) => {
              const shown = visibleLanguages.includes(code);

              return (
                <Chip
                  key={code}
                  size="small"
                  label={code}
                  variant={shown ? 'filled' : 'outlined'}
                  color={shown ? 'primary' : 'default'}
                  onClick={() =>
                    onVisibleLanguagesChange(
                      // Hiding the last visible language would leave nothing to edit.
                      shown
                        ? visibleLanguages.length > 1
                          ? visibleLanguages.filter((entry) => entry !== code)
                          : visibleLanguages
                        : [...visibleLanguages, code],
                    )
                  }
                  sx={{ fontFamily: 'monospace', opacity: shown ? 1 : 0.6 }}
                />
              );
            })}
          </Stack>
        )}

        <Box sx={{ flexGrow: 1 }} />

        <ToggleButtonGroup
          size="small"
          exclusive
          value={raw ? 'raw' : 'blocks'}
          onChange={(_, value) => value && toggleRaw(value === 'raw')}
        >
          <ToggleButton value="blocks" title={LL.SONG_EDITOR.BLOCK_MODE()}>
            <BlocksIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="raw" title={LL.SONG_EDITOR.RAW_MODE()}>
            <RawIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {raw ? (
        <Stack sx={{ gap: 0.5 }}>
          <InputBase
            multiline
            minRows={10}
            inputRef={rawRef}
            value={rawText}
            onChange={({ target }) => setRawText(target.value)}
            onBlur={() => onChange(rawTextToPages(rawText, languages[0]))}
            sx={{ fontFamily: 'monospace', fontSize: '0.85rem', border: 1, borderColor: 'divider', borderRadius: 1, p: 1 }}
          />
          {/* The same two things the block view offers as structure, offered here as text — in
              the same place and shape, so switching modes does not move the controls. A button
              that writes the syntax also beats a sentence describing it. */}
          <Stack direction="row" sx={{ gap: 0.5, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {languages.map((code) => (
              <Tooltip key={code} title={LL.SONG_EDITOR.RAW_TAG_HINT({ code })}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={code}
                  onClick={() => insertLanguageTag(code)}
                  sx={{ fontFamily: 'monospace' }}
                />
              </Tooltip>
            ))}
            <Tooltip title={LL.SONG_EDITOR.RAW_SEPARATOR_HINT()}>
              <Chip
                size="small"
                variant="outlined"
                icon={<PageBreakIcon sx={{ fontSize: 14 }} />}
                label={SONG_BLOCK_SEPARATOR}
                onClick={insertSeparator}
                sx={{ fontFamily: 'monospace' }}
              />
            </Tooltip>
          </Stack>
        </Stack>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(lyricItemId)} strategy={verticalListSortingStrategy}>
            <Stack sx={{ gap: 0.5 }}>
              {items.map((item) => {
                if (item.kind === 'break') {
                  pageIndex += 1;
                  lineNumber = 0;

                  return (
                    <BreakRow
                      key={item.id}
                      id={item.id}
                      label={LL.SONG_EDITOR.PAGE_OF({ number: pageIndex + 1, total: pageCount })}
                      onRemove={() => removeBreak(item.id)}
                      removeLabel={LL.SONG_EDITOR.REMOVE_PAGE_BREAK()}
                    />
                  );
                }

                lineNumber += 1;

                return (
                  <LyricRow
                    key={item.line.id}
                    line={item.line}
                    columns={columns}
                    pageLineNumber={lineNumber}
                    registerInput={registerInput}
                    onText={setText}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onInsertAfter={insertAfter}
                    onDelete={deleteLine}
                    labels={{
                      addLine: LL.SONG_EDITOR.ADD_LINE(),
                      deleteLine: LL.SONG_EDITOR.DELETE_LINE(),
                      placeholder: LL.SONG_EDITOR.LINE_PLACEHOLDER(),
                      translationPlaceholder: (name: string) => LL.SONG_EDITOR.TRANSLATION_PLACEHOLDER({ language: name }),
                    }}
                  />
                );
              })}
            </Stack>
          </SortableContext>

          {/* Same place and same shape as the raw view's chips: both modes add to the end of
              the block, so both offer it in one row underneath. */}
          <Stack direction="row" sx={{ gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              variant="outlined"
              icon={<AddLineIcon sx={{ fontSize: 14 }} />}
              label={LL.SONG_EDITOR.ADD_LINE()}
              onClick={() => lineIds.length > 0 && insertAfter(lineIds[lineIds.length - 1])}
            />
            <Chip
              size="small"
              variant="outlined"
              icon={<PageBreakIcon sx={{ fontSize: 14 }} />}
              label={LL.COMMON.PAGE_BREAK()}
              onClick={() => lineIds.length > 0 && breakAfter(lineIds[lineIds.length - 1])}
            />
          </Stack>
        </DndContext>
      )}
    </Stack>
  );
};
