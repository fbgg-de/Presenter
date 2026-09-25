import { useState, useMemo, type ReactNode } from 'react';
import { Box, Checkbox, IconButton, Menu, Stack, Tooltip, Typography } from '@mui/material';
import {
  Tune as PanesIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  DragIndicator as DragIcon,
  UnfoldMore as ExpandIcon,
  UnfoldLess as CollapseIcon,
  CropFree as GuidesIcon,
} from '@mui/icons-material';
import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useI18nContext } from '@/i18n/i18n-react';
import { MonitorFrame, SafeAreaGuides } from '@/components/media/Viewer';
import type { StyleData } from '@/api/styles.api';
import {
  DEFAULT_STYLE,
  mergeStyles,
  resolveNextLinePreview,
  resolveStyleData,
  styleToContainerCss,
  styleToTextCss,
} from '@/utils/styleUtils';
import { languageEntryCss, previewSlotStyles, splitSampleAtSeparator, usePreviewScale } from '@/components/style/styleFormUtils';
import { MAIN_LANGUAGE_SLOT } from '@/utils/languageSlots';
import { useGetSettings, useUpdateSetting, type StylePreviewPaneId } from '@/store/settingsSlice';
import { withoutBackgroundMedia } from '@/look/resolveLook';

/**
 * Which preview canvases are shown, and in what order.
 *
 * Reordering lives here rather than on the canvases themselves: the canvases are the thing you
 * are judging, so putting drag handles on them would clutter exactly the surface that is meant
 * to look like a presentation screen.
 */
const PreviewPaneMenu = ({
  anchorEl,
  onClose,
  panes,
  onChange,
  title,
  LL,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  panes: { id: StylePreviewPaneId; visible: boolean }[];
  onChange: (next: { id: StylePreviewPaneId; visible: boolean }[]) => void;
  title: (id: StylePreviewPaneId) => string;
  LL: ReturnType<typeof useI18nContext>['LL'];
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = panes.findIndex((pane) => pane.id === active.id);
    const to = panes.findIndex((pane) => pane.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(panes, from, to));
  };

  const toggle = (id: StylePreviewPaneId) => onChange(panes.map((pane) => (pane.id === id ? { ...pane, visible: !pane.visible } : pane)));

  return (
    <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={onClose} slotProps={{ paper: { sx: { minWidth: 240 } } }}>
      <Typography variant="overline" sx={{ color: 'text.secondary', px: 2, lineHeight: 2 }}>
        {LL.STYLE.PREVIEW_PANES()}
      </Typography>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={panes.map((pane) => pane.id)} strategy={verticalListSortingStrategy}>
          {panes.map((pane) => (
            <SortablePaneRow key={pane.id} id={pane.id}>
              <Checkbox size="small" checked={pane.visible} onChange={() => toggle(pane.id)} />
              <Typography variant="body2" sx={{ flexGrow: 1, opacity: pane.visible ? 1 : 0.6 }}>
                {title(pane.id)}
              </Typography>
            </SortablePaneRow>
          ))}
        </SortableContext>
      </DndContext>
      <Typography variant="caption" sx={{ color: 'text.disabled', px: 2, py: 1, display: 'block', maxWidth: 260 }}>
        {LL.STYLE.PREVIEW_PANES_HINT()}
      </Typography>
    </Menu>
  );
};

/** A menu row that can be dragged by its handle without the checkbox stealing the gesture. */
const SortablePaneRow = ({ id, children }: { id: string; children: ReactNode }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      sx={{
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? CSS.Transform.toString(transform) : undefined,
        transition,
      }}
    >
      <Box {...attributes} {...listeners} sx={{ display: 'flex', cursor: 'grab', touchAction: 'none', color: 'text.disabled' }}>
        <DragIcon fontSize="small" />
      </Box>
      {children}
    </Stack>
  );
};

/**
 * The live preview. It sits under the category list in the sidebar and fills whatever
 * width that column has been dragged to, so one handle sizes the nav and the preview
 * together and the form keeps the whole rest of the drawer.
 */
export const StylePreviewPanel = ({
  styleData,
  expanded,
  onToggleExpanded,
}: {
  styleData: StyleData;
  /** Whether the sidebar is already widened for the preview. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}) => {
  const { LL } = useI18nContext();
  const {
    stylePreview,
    nextLinePreview: nextLinePreviewDefault,
    operatorPreviewGuides,
  } = useGetSettings('stylePreview', 'nextLinePreview', 'operatorPreviewGuides');
  const updateSetting = useUpdateSetting();

  const [paneMenuAnchor, setPaneMenuAnchor] = useState<HTMLElement | null>(null);

  // All canvases are the same width (they stack in a fixed column), so measuring whichever one
  // mounts first is enough to re-base viewport units against.
  const { measureRef: measureCanvas, scale, scaleLength } = usePreviewScale();

  const resolvedPreview = useMemo(() => {
    // Pictures and videos behind the text are agenda entries; a theme brings its colour.
    return withoutBackgroundMedia(mergeStyles(DEFAULT_STYLE, resolveStyleData(styleData)));
  }, [styleData]);
  const previewContainerCss = useMemo(() => scale(styleToContainerCss(resolvedPreview)), [resolvedPreview, scale]);
  const { padding: previewPadding, ...previewContainerCssNoPadding } = previewContainerCss as ReturnType<typeof styleToContainerCss> & {
    padding?: string;
  };
  const previewTextCss = useMemo(() => scale(styleToTextCss(resolvedPreview)), [resolvedPreview, scale]);
  // The main slot doubles as the baseline every line inherits, so the next-block strip still
  // needs it even when the main language itself is not drawn.
  const previewMainCss = useMemo(
    () => scale(languageEntryCss(resolvedPreview.languageStyles, MAIN_LANGUAGE_SLOT)),
    [resolvedPreview, scale],
  );
  /**
   * Every slot the style actually draws, each with the css the presentation gives it.
   *
   * The main slot is in here on the same terms as the rest, so hiding it hides it. It used to
   * be prepended unconditionally, which quietly made "show only the translation" impossible to
   * see in the preview even though the presentation honoured it.
   */
  const allSlots = useMemo(
    () => previewSlotStyles(resolvedPreview.languageStyles).map(({ slot, css }) => ({ slot, css: scale(css) })),
    [resolvedPreview, scale],
  );

  /** The "labels" pane: one row per slot, naming itself. Shows the design without any content. */
  const labelRows = useMemo(
    () =>
      allSlots.map(({ slot, css }) => ({
        key: `label-${slot}`,
        css,
        text: slot === MAIN_LANGUAGE_SLOT ? LL.STYLE.SLOT_MAIN() : LL.STYLE.SLOT_LABEL({ n: slot }),
      })),
    [allSlots, LL],
  );

  /**
   * The "sample" pane: the lyric lines, stacked the way the presentation stacks them — line 1
   * in every language, then line 2 — because that is what shows whether a translation reads
   * well underneath its own line rather than beside it.
   *
   * A `---` line splits each language's sample into the block being shown and the one after it,
   * the same separator a real song block uses. Both halves are built here so the next-block
   * strip is written in the same box as the lyrics it follows.
   */
  const { sampleRows, nextRows } = useMemo(() => {
    const halves = stylePreview.languages.map((entry) => splitSampleAtSeparator(entry.lines));

    const build = (pick: 'current' | 'next', keyPrefix: string) => {
      const lineCount = Math.max(0, ...halves.map((half) => half[pick].length));
      const rows: { key: string; css: typeof previewMainCss; text: string; slot: number }[] = [];

      for (let line = 0; line < lineCount; line++) {
        for (const { slot, css } of allSlots) {
          // A slot the sample has no language for still shows something on its first line, or
          // a style with four slots would silently render three and look like a bug.
          const half = halves[slot - 1];
          const text = half?.[pick][line] ?? (line === 0 && pick === 'current' ? LL.STYLE.SLOT_LABEL({ n: slot }) : '');
          if (text) rows.push({ key: `${keyPrefix}-${slot}-${line}`, css, text, slot });
        }
      }

      return rows;
    };

    return { sampleRows: build('current', 'now'), nextRows: build('next', 'next') };
  }, [stylePreview.languages, allSlots, LL]);

  const panes = stylePreview.panes;
  const visiblePanes = panes.filter((pane) => pane.visible);
  const writePanes = (next: typeof panes) => updateSetting('stylePreview', { ...stylePreview, panes: next });

  const paneTitle = (id: StylePreviewPaneId) =>
    id === 'labels' ? LL.STYLE.PREVIEW_PANE_LABELS() : id === 'sample' ? LL.STYLE.PREVIEW_PANE_SAMPLE() : LL.STYLE.PREVIEW_PANE_COPYRIGHT();

  /**
   * Step the shown set forward or back through the ordered list, keeping how many are shown.
   *
   * With one pane shown this simply pages through them; with two, it slides the pair along.
   * It exists so switching what you are looking at does not mean opening the menu every time,
   * and it is hidden when everything is already shown — there would be nothing to move to.
   */
  const rotatePanes = (direction: 1 | -1) => {
    const count = visiblePanes.length;
    if (count === 0 || count === panes.length) return;

    const firstShown = panes.findIndex((pane) => pane.visible);
    const start = (firstShown + direction + panes.length) % panes.length;
    const shown = new Set(Array.from({ length: count }, (_, i) => (start + i) % panes.length));

    writePanes(panes.map((pane, index) => ({ ...pane, visible: shown.has(index) })));
  };

  return (
    <Stack
      spacing={1}
      sx={{ flex: 1, minHeight: 0, p: 1.5, overflow: 'auto', borderTop: 1, borderColor: 'divider', bgcolor: (t) => t.palette.action.hover }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
          {LL.STYLE.PREVIEW()}
        </Typography>
        {visiblePanes.length < panes.length && (
          <>
            <Tooltip title={LL.STYLE.PREVIEW_PANE_PREV()}>
              <IconButton size="small" onClick={() => rotatePanes(-1)}>
                <PrevIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.STYLE.PREVIEW_PANE_NEXT()}>
              <IconButton size="small" onClick={() => rotatePanes(1)}>
                <NextIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title={LL.PREVIEW.GUIDES()}>
          <IconButton
            size="small"
            aria-pressed={operatorPreviewGuides}
            color={operatorPreviewGuides ? 'warning' : 'default'}
            onClick={() => updateSetting('operatorPreviewGuides', !operatorPreviewGuides)}
          >
            <GuidesIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={LL.STYLE.PREVIEW_PANES()}>
          <IconButton size="small" onClick={(e) => setPaneMenuAnchor(e.currentTarget)}>
            <PanesIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        {onToggleExpanded && (
          <Tooltip title={expanded ? LL.STYLE.PREVIEW_COLLAPSE() : LL.STYLE.PREVIEW_EXPAND()}>
            <IconButton size="small" onClick={onToggleExpanded}>
              {expanded ? <CollapseIcon sx={{ fontSize: 18 }} /> : <ExpandIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}
        <PreviewPaneMenu
          anchorEl={paneMenuAnchor}
          onClose={() => setPaneMenuAnchor(null)}
          panes={panes}
          onChange={writePanes}
          title={paneTitle}
          LL={LL}
        />
      </Stack>
      {visiblePanes.length === 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {LL.STYLE.PREVIEW_PANES_EMPTY()}
        </Typography>
      )}
      {visiblePanes.map(({ id }, paneIndex) => (
        <MonitorFrame key={id} label={paneTitle(id)}>
          <Box
            ref={paneIndex === 0 ? measureCanvas : undefined}
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16/9',
              overflow: 'hidden',
              ...previewContainerCssNoPadding,
            }}
          >
            <Stack
              sx={{
                alignItems: 'center',

                justifyContent:
                  resolvedPreview.verticalAlign === 'top'
                    ? 'flex-start'
                    : resolvedPreview.verticalAlign === 'bottom'
                      ? 'flex-end'
                      : 'center',

                width: '100%',
                height: '100%',
                position: 'relative',
                zIndex: 2,
                padding: previewPadding || 0,
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}
            >
              {/* Full-width lines (like real presentation lines) so textAlign is visible, with each
                slot's css applied exactly as the presentation does. */}
              {(id === 'labels' ? labelRows : id === 'sample' ? sampleRows : []).map((row) => (
                <Typography
                  key={row.key}
                  sx={{
                    ...previewTextCss,
                    fontSize: previewTextCss.fontSize,
                    ...row.css,
                    width: '100%',
                  }}
                >
                  {row.text}
                </Typography>
              ))}

              {id === 'sample' &&
                nextRows.length > 0 &&
                (() => {
                  // The same decision, defaults and layout as the presentation (see NextBlockPreview), so
                  // the preview never shows a strip the screen will not. It used to draw one even when
                  // switched off, and at a hard-coded 70% size the presentation never used.
                  const preview = resolveNextLinePreview(resolvedPreview, nextLinePreviewDefault);
                  if (!preview.enabled) return null;
                  const pinned = preview.position === 'bottom';

                  const strip = (
                    <Stack
                      sx={{
                        width: '100%',
                        opacity: preview.opacity,
                        ...(!pinned && preview.spacing ? { marginTop: scaleLength(preview.spacing) } : {}),
                      }}
                    >
                      {nextRows.map((row) => (
                        <Typography
                          key={row.key}
                          sx={{
                            ...previewTextCss,
                            ...row.css,
                            ...(row.slot !== MAIN_LANGUAGE_SLOT ? { fontStyle: 'italic' } : {}),
                            ...(preview.fontSize ? { fontSize: scaleLength(preview.fontSize) } : {}),
                            ...(preview.textAlign ? { textAlign: preview.textAlign } : {}),
                            color: preview.color,
                            width: '100%',
                          }}
                        >
                          {row.text}
                        </Typography>
                      ))}
                    </Stack>
                  );

                  return pinned ? (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: preview.spacing ? scaleLength(preview.spacing) : 0,
                        padding: previewPadding || 0,
                        boxSizing: 'border-box',
                      }}
                    >
                      {strip}
                    </Box>
                  ) : (
                    strip
                  );
                })()}
            </Stack>

            {id === 'copyright' && (
              <Stack
                sx={{
                  position: 'absolute',
                  inset: 'auto 0 0 0',
                  zIndex: 3,
                  padding: scaleLength(resolvedPreview.copyrightPadding || '0 1%'),
                  pointerEvents: 'none',
                  textAlign: (resolvedPreview.copyrightTextAlign || 'center') as never,
                  opacity: resolvedPreview.copyrightOpacity ?? 0.8,
                }}
              >
                {[stylePreview.title, stylePreview.authors, stylePreview.copyright].filter(Boolean).map((line, index) => (
                  <Typography
                    key={index}
                    sx={{
                      fontFamily: resolvedPreview.copyrightFontFamily || previewTextCss.fontFamily,
                      color: resolvedPreview.copyrightFontColor || previewMainCss.color || previewTextCss.color,
                      fontSize: scaleLength(
                        (index === 0 ? resolvedPreview.copyrightTitleFontSize : resolvedPreview.copyrightFontSize) || '1.5vh',
                      ),
                      fontWeight: (index === 0 ? resolvedPreview.copyrightTitleFontBold : resolvedPreview.copyrightFontBold)
                        ? 'bold'
                        : undefined,
                      fontStyle: (index === 0 ? resolvedPreview.copyrightTitleFontItalic : resolvedPreview.copyrightFontItalic)
                        ? 'italic'
                        : undefined,
                      lineHeight: 1.3,
                    }}
                  >
                    {line}
                  </Typography>
                ))}
              </Stack>
            )}
            {operatorPreviewGuides && <SafeAreaGuides />}
          </Box>
        </MonitorFrame>
      ))}
    </Stack>
  );
};
