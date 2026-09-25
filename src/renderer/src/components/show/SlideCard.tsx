/**
 * The operator view's slides, shared by songs, Bible verses and media: a grid of 16:9 cards
 * drawn in the item's look, with one size for all of them. Only the live card is marked (red);
 * there is deliberately no "next" marker.
 */
import { memo, useCallback, useLayoutEffect, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { styleBackground } from '@/look/styleBackground';
import { styleToTextCss, type ResolvedStyle } from '@/utils/styleUtils';
import { usePreviewScale } from '@/components/style/styleFormUtils';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { SizeButton } from '@/components/operator/SizeControl';
import { SLIDE_DEFAULT, SLIDE_RANGE, clampSize, useCtrlWheelSize } from '@/components/operator/tileSize';
import { useIsMobile } from '@/hooks/useIsMobile';
import { SectionLabel } from '@/components/operator/SectionLabel';
import { sectionColor } from '@/utils/sectionColor';

interface SlideCardProps {
  blockIndex: number;
  name: string;
  /** Text lines, fitted to the card. Ignored when `children` draws the card instead. */
  lines?: string[];
  style?: ResolvedStyle;
  selected: boolean;
  /** Picked for the preview but not live yet (preview before live): a dashed outline. */
  previewed?: boolean;
  /** Line to highlight inside the live card; -1 or undefined for none. */
  activeLineIndex?: number;
  label: string;
  onBlockClick?: (blockIndex: number) => void;
  onBlockDoubleClick?: (blockIndex: number) => void;
  onLineClick?: (blockIndex: number, lineIndex: number) => void;
  forwardRef?: Ref<HTMLDivElement>;
  /** CSS aspect ratio of the card; 16/9 unless the item is framed for another screen shape. */
  aspectRatio?: string;
  /** Draws the card's content instead of background and text — a media preview. */
  children?: ReactNode;
}

/** One slide, drawn the way the audience screen shows it. Re-renders only when its own props change. */
export const SlideCard = memo(function SlideCard({
  blockIndex,
  name,
  lines,
  style,
  selected,
  previewed = false,
  activeLineIndex = -1,
  label,
  onBlockClick,
  onBlockDoubleClick,
  onLineClick,
  forwardRef,
  aspectRatio = '16/9',
  children,
}: SlideCardProps) {
  const { measureRef, scale, size } = usePreviewScale();
  // The theme's font, colours and alignment — but not its size: the operator has to read the slide
  // at a glance, so the text is fitted to the card below instead.
  const textCss = useMemo(() => {
    if (!style) return {};
    const css = { ...scale(styleToTextCss(style)) };
    delete css.fontSize;
    return css;
  }, [style, scale]);
  const background = useMemo(() => (style ? styleBackground(style) : null), [style]);
  const groupColor = sectionColor(name);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Fit to the block: the largest font size at which every line fits the card without overlapping.
  // Written straight to the element (binary search over forced layouts), so fitting never re-renders.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content || size.height === 0 || !lines) return;
    const padding = getComputedStyle(frame);
    const available = frame.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
    const fits = () => content.scrollHeight <= available && content.scrollWidth <= content.clientWidth + 1;
    // Upper bound: every line on one row, and no giant text on a slide with a single short line.
    let high = Math.max(8, Math.min(available / (Math.max(1, lines.length) * 1.2), size.height * 0.16));
    let low = 6;
    content.style.fontSize = `${high}px`;
    if (fits()) return;
    for (let i = 0; i < 10 && high - low > 0.5; i++) {
      const mid = (low + high) / 2;
      content.style.fontSize = `${mid}px`;
      if (fits()) low = mid;
      else high = mid;
    }
    content.style.fontSize = `${low}px`;
  }, [size.width, size.height, lines, textCss, selected, activeLineIndex]);

  return (
    <Stack spacing={0.5} ref={forwardRef} sx={{ minWidth: 0 }}>
      <Box
        ref={measureRef}
        onClick={() => onBlockClick?.(blockIndex)}
        onDoubleClick={() => onBlockDoubleClick?.(blockIndex)}
        sx={{
          position: 'relative',
          aspectRatio,
          maxWidth: '100%',
          borderRadius: 1,
          overflow: 'hidden',
          cursor: onBlockClick || onBlockDoubleClick ? 'pointer' : 'default',
          bgcolor: '#000',
          border: 2,
          borderStyle: previewed && !selected ? 'dashed' : 'solid',
          borderColor: selected ? 'error.main' : previewed ? 'primary.main' : 'transparent',
          boxShadow: selected ? 3 : 1,
        }}
      >
        {children ?? (
          <>
            {style && !style.hideBackground && (
              <Box sx={{ position: 'absolute', inset: 0, '& > div': { border: 0, borderRadius: 0, height: '100%', aspectRatio: 'auto' } }}>
                <BackgroundThumb data={background} />
              </Box>
            )}
            <Stack
              ref={frameRef}
              sx={{
                position: 'absolute',
                inset: 0,
                p: '4%',
                justifyContent: style?.verticalAlign === 'top' ? 'flex-start' : style?.verticalAlign === 'bottom' ? 'flex-end' : 'center',
                overflow: 'hidden',
                textShadow: '0 1px 3px rgba(0,0,0,0.7)',
              }}
            >
              {/* Measured by the fit above; a plain block, so its height is exactly what the lines need. */}
              <Box ref={contentRef} sx={{ width: '100%', flexShrink: 0, textAlign: textCss.textAlign ?? 'center', color: '#fff' }}>
                {(lines ?? []).map((line, lineIndex) => {
                  const picked = selected && lineIndex === activeLineIndex;
                  return (
                    <Typography
                      key={lineIndex}
                      onClick={(e) => {
                        if (!onLineClick) return;
                        e.stopPropagation();
                        onLineClick(blockIndex, lineIndex);
                      }}
                      sx={{
                        ...textCss,
                        fontSize: 'inherit',
                        lineHeight: 1.2,
                        overflowWrap: 'anywhere',
                        px: 0.75,
                        borderRadius: 0.75,
                        // The picked line has to be found at a glance: solid live red, white bold text.
                        ...(picked
                          ? {
                              bgcolor: 'error.main',
                              color: '#fff',
                              fontWeight: 700,
                              textShadow: 'none',
                              boxShadow: '0 0 0 2px rgba(255,255,255,0.85)',
                            }
                          : { bgcolor: 'transparent' }),
                      }}
                    >
                      {line}
                    </Typography>
                  );
                })}
              </Box>
            </Stack>
          </>
        )}
        {/* The section's colour as a bar along the bottom — the song's shape at a glance. */}
        {groupColor && <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, bgcolor: groupColor }} />}
      </Box>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            color: selected ? 'error.main' : 'text.secondary',
            fontWeight: selected ? 600 : 400,
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {label}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{ color: groupColor ?? 'text.secondary', fontWeight: groupColor ? 600 : 400, minWidth: 0 }}
        >
          {name}
        </Typography>
      </Stack>
    </Stack>
  );
});

/**
 * Header (title, look pills, slide size) over a scrolling grid of slide cards. `footer` scrolls
 * with the grid — the media item's transport and display options sit there.
 */
export const SlideGrid = ({
  title,
  subtitle,
  pills,
  children,
  footer,
  single,
}: {
  /** One wide card instead of a grid of slides — a media entry's viewer. */
  single?: boolean;
  /** What is shown — content, so it keeps its own casing. */
  title: ReactNode;
  /** Arrangement, translation…: a section label after the title. */
  subtitle?: ReactNode;
  pills?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const { operatorSlideSize } = useGetSettings('operatorSlideSize');
  const updateSetting = useUpdateSetting();
  const slideWidth = clampSize(operatorSlideSize, SLIDE_RANGE, SLIDE_DEFAULT);
  // The desktop operator view sizes slides from its View menu; phones have no top bar for that.
  const isMobile = useIsMobile();
  const setSlideWidth = useCallback((width: number) => updateSetting('operatorSlideSize', width), [updateSetting]);
  const wheelRef = useCtrlWheelSize(slideWidth, SLIDE_RANGE, setSlideWidth);

  return (
    <Stack sx={{ flexGrow: 1, minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
            {title}
          </Typography>
          {subtitle && <SectionLabel sx={{ flexShrink: 0 }}>{subtitle}</SectionLabel>}
        </Stack>
        {pills}
        {isMobile && (
          <SizeButton title={O.SLIDE_SIZE()} hint={O.SLIDE_SIZE_HINT()} range={SLIDE_RANGE} value={slideWidth} onChange={setSlideWidth} />
        )}
      </Stack>

      <Box ref={wheelRef} sx={{ flexGrow: 1, overflowY: 'auto', userSelect: 'none' }}>
        <Box
          sx={
            single
              ? { p: 1.5, maxWidth: 1040 }
              : {
                  p: 1.5,
                  display: 'grid',
                  // `min(…, 100%)` keeps a large size from overflowing a narrow pane (phones).
                  gridTemplateColumns: `repeat(auto-fill, minmax(min(${slideWidth}px, 100%), 1fr))`,
                  gap: 1.5,
                  alignContent: 'start',
                }
          }
        >
          {children}
        </Box>
        {footer}
      </Box>
    </Stack>
  );
};
