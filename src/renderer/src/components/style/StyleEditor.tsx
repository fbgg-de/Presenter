import React, { useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  FormControlLabel,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  FolderOpen as FolderOpenIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  ArrowUpward as MoveUpIcon,
  ArrowDownward as MoveDownIcon,
  DragIndicator as DragHandleIcon,
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon,
  FormatAlignJustify as AlignJustifyIcon,
  VerticalAlignTop as VAlignTopIcon,
  VerticalAlignCenter as VAlignMidIcon,
  VerticalAlignBottom as VAlignBotIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Bolt as ApplyIcon,
  Add as AddIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  BrokenImage as BrokenImageIcon,
  CloudOff as CloudOffIcon,
  Code as CodeIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  UnfoldMore as UnfoldMoreIcon,
  UnfoldLess as UnfoldLessIcon,
  Edit as EditIcon,
  Remove as RemoveIcon,
  GTranslate as TranslateIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useGetStylesQuery,
  useCreateStyleMutation,
  useUpdateStyleMutation,
  useDeleteStyleMutation,
  type StyleData,
  type StyleEntity,
  type LanguageStyleEntry,
} from '@/api/styles.api';
import { DEFAULT_STYLE, mergeStyles, resolveStyleData, styleToContainerCss, styleToTextCss, buildFontFamily } from '@/utils/styleUtils';
import { FontPicker } from '@/components/style/FontPicker';
import { ColorSwatchButton } from '@/components/style/ColorPicker';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { CssUnitInput } from '@/components/style/CssUnitInput';
import CompactPositionPicker from '@/components/common/CompactPositionPicker';
import { WEB_SAFE_FONTS } from '@/utils/styleUtils';
import { resolveMediaUrl, probeMediaUrl, type MediaProbeStatus, invalidateMediaProbe } from '@/utils/mediaUrl';
import { useGetLanguageTagsQuery } from '@/api/songs.api';
import { useGetSettings } from '@/store/settingsSlice';
import { formatTime } from '@/utils';

/** Helper: toggle-enabled property row — compact layout: switch | label | children in one line. */
const StylePropRow = ({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
}) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
    <Switch size="small" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
    <Typography variant="body2" sx={{ minWidth: 130, fontWeight: 500, opacity: enabled ? 1 : 0.5 }}>
      {label}
    </Typography>
    <Box sx={{ flex: 1, opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>{children}</Box>
  </Stack>
);

/** Compact media row: same layout as StylePropRow — switch | label 130px | thumb + input + browse */
const MediaPropRow = ({
  label,
  enabled,
  onToggle,
  value,
  onChange,
  onBrowse,
  thumbType,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  onBrowse: () => void;
  thumbType: 'image' | 'video';
}) => (
  <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
    <Switch size="small" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
    <Typography variant="body2" sx={{ minWidth: 130, fontWeight: 500, opacity: enabled ? 1 : 0.5 }}>
      {label}
    </Typography>
    <Box
      sx={{
        flex: 1,
        opacity: enabled ? 1 : 0.4,
        pointerEvents: enabled ? 'auto' : 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
      }}
    >
      {value && <MediaThumb url={value} type={thumbType} />}
      <TextField
        size="small"
        fullWidth
        placeholder="https:// or relative path"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{ flex: 1 }}
      />
      <Tooltip title="Browse…">
        <IconButton onClick={onBrowse} size="small">
          <FolderOpenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  </Stack>
);

/** Section wrapper using MUI Accordion for collapsible groups. */
const Section = ({ title, defaultExpanded = true, children }: { title: string; defaultExpanded?: boolean; children: ReactNode }) => (
  <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ background: (t) => t.palette.action.hover, borderRadius: 1 }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Stack spacing={1}>{children}</Stack>
    </AccordionDetails>
  </Accordion>
);

/** Per-language typography settings editor with per-property enable toggles. */
const LanguageStyleEditor = ({
  entry,
  onChange,
  LL,
}: {
  entry: LanguageStyleEntry;
  onChange: (patch: Partial<LanguageStyleEntry>) => void;
  LL: ReturnType<typeof useI18nContext>['LL'];
}) => {
  const shadowParts = (entry.textShadow || '2px 2px 4px').split(/\s+/);
  const sx = shadowParts[0] || '2px';
  const sy = shadowParts[1] || '2px';
  const sb = shadowParts[2] || '4px';
  const strokeMatch = (entry.textStroke || '1px black').match(/^(-?\d*\.?\d+\s*(?:px|pt|em|rem|vh|vw|vmin|vmax|%))\s+(.+)$/i);
  const sw = strokeMatch ? strokeMatch[1] : '1px';
  const sc = strokeMatch ? strokeMatch[2] : 'black';

  return (
    <Stack spacing={1}>
      <StylePropRow
        label={LL.STYLE.FONT_COLOR()}
        enabled={entry.fontColorEnabled ?? false}
        onToggle={(e) => onChange({ fontColorEnabled: e })}
      >
        <ColorSwatchButton value={entry.fontColor || '#FFFFFF'} onChange={(c) => onChange({ fontColor: c })} />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.FONT_SIZE()}
        enabled={entry.fontSizeEnabled ?? false}
        onToggle={(e) => onChange({ fontSizeEnabled: e })}
      >
        <CssUnitInput value={entry.fontSize || '4vh'} onChange={(v) => onChange({ fontSize: v })} />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.FONT_BOLD_ITALIC()}
        enabled={entry.fontStyleEnabled ?? false}
        onToggle={(e) => onChange({ fontStyleEnabled: e })}
      >
        <ToggleButtonGroup size="small">
          <ToggleButton value="bold" selected={entry.fontBold || false} onClick={() => onChange({ fontBold: !entry.fontBold })}>
            <BoldIcon />
          </ToggleButton>
          <ToggleButton value="italic" selected={entry.fontItalic || false} onClick={() => onChange({ fontItalic: !entry.fontItalic })}>
            <ItalicIcon />
          </ToggleButton>
          <ToggleButton
            value="underline"
            selected={entry.fontUnderline || false}
            onClick={() => onChange({ fontUnderline: !entry.fontUnderline })}
          >
            <UnderlineIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.LETTER_SPACING()}
        enabled={entry.letterSpacingEnabled ?? false}
        onToggle={(e) => onChange({ letterSpacingEnabled: e })}
      >
        <CssUnitInput value={entry.letterSpacing || '0px'} onChange={(v) => onChange({ letterSpacing: v })} />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.TEXT_SHADOW()}
        enabled={entry.textShadowEnabled ?? false}
        onToggle={(e) => onChange({ textShadowEnabled: e })}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CssUnitInput value={sx} onChange={(v) => onChange({ textShadow: `${v} ${sy} ${sb}` })} label={LL.STYLE.SHADOW_X()} />
          <CssUnitInput value={sy} onChange={(v) => onChange({ textShadow: `${sx} ${v} ${sb}` })} label={LL.STYLE.SHADOW_Y()} />
          <CssUnitInput value={sb} onChange={(v) => onChange({ textShadow: `${sx} ${sy} ${v}` })} label={LL.STYLE.SHADOW_BLUR()} />
          <Stack alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25 }}>
              {LL.STYLE.SHADOW_COLOR()}
            </Typography>
            <ColorSwatchButton value={entry.textShadowColor || '#000000'} onChange={(c) => onChange({ textShadowColor: c })} />
          </Stack>
        </Stack>
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.TEXT_STROKE()}
        enabled={entry.textStrokeEnabled ?? false}
        onToggle={(e) => onChange({ textStrokeEnabled: e })}
      >
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <CssUnitInput value={sw} onChange={(v) => onChange({ textStroke: `${v} ${sc}` })} label={LL.STYLE.STROKE_WIDTH()} />
          <Stack alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25 }}>
              {LL.STYLE.STROKE_COLOR()}
            </Typography>
            <ColorSwatchButton value={sc} onChange={(c) => onChange({ textStroke: `${sw} ${c}` })} />
          </Stack>
        </Stack>
      </StylePropRow>
      <StylePropRow label={LL.STYLE.OPACITY()} enabled={entry.opacityEnabled ?? false} onToggle={(e) => onChange({ opacityEnabled: e })}>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={entry.opacity ?? 1}
          onChange={(_, v) => onChange({ opacity: v as number })}
          valueLabelDisplay="auto"
          sx={{ width: 200 }}
        />
      </StylePropRow>
      <StylePropRow
        label={LL.STYLE.NEXT_LINE_PREVIEW()}
        enabled={entry.nextLinePreviewEnabled ?? false}
        onToggle={(e) => onChange({ nextLinePreviewEnabled: e })}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Switch
            size="small"
            checked={entry.nextLinePreview || false}
            onChange={(e2) => onChange({ nextLinePreview: e2.target.checked })}
          />
          <ColorSwatchButton value={entry.nextLinePreviewColor || '#AAAAAA'} onChange={(c) => onChange({ nextLinePreviewColor: c })} />
          <Stack alignItems="center" spacing={0}>
            <Typography variant="caption" color="text.secondary">
              {LL.STYLE.NEXT_LINE_OPACITY()}
            </Typography>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={entry.nextLinePreviewOpacity ?? 0.6}
              onChange={(_, v) => onChange({ nextLinePreviewOpacity: v as number })}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
              sx={{ width: 80 }}
            />
          </Stack>
        </Stack>
      </StylePropRow>
    </Stack>
  );
};

/** Small media thumbnail shown next to URL fields. Surfaces three explicit
 *  states so the user knows whether the file is loading, missing, or whether
 *  the local media server itself isn't running. */
const MediaThumb = ({ url, type }: { url: string; type: 'image' | 'video' }) => {
  const resolved = resolveMediaUrl(url);
  const [status, setStatus] = useState<MediaProbeStatus | 'loading'>('loading');
  const triedRef = useRef(false);

  useEffect(() => {
    if (!resolved) return;
    let cancelled = false;
    setStatus('loading');
    triedRef.current = false;
    probeMediaUrl(resolved).then((s) => {
      if (cancelled) return;
      if (s !== 'ok' && !triedRef.current) {
        // One-shot retry on transient server cold-start (server_down recovers
        // quickly once the renderer triggers startMediaServer).
        triedRef.current = true;
        invalidateMediaProbe(resolved);
        setTimeout(() => {
          if (cancelled) return;
          probeMediaUrl(resolved).then((s2) => {
            if (!cancelled) setStatus(s2);
          });
        }, 800);
        return;
      }
      setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  if (!url || !resolved) return null;

  const boxSx = {
    width: 48,
    height: 28,
    borderRadius: 0.5,
    border: '1px solid',
    borderColor: 'divider',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    bgcolor: 'action.hover',
    color: 'text.disabled',
  } as const;

  if (status === 'loading') {
    return (
      <Box sx={boxSx}>
        <CircularProgress size={14} thickness={5} />
      </Box>
    );
  }
  if (status === 'not_found') {
    return (
      <Tooltip title="File not found in media folder">
        <Box sx={boxSx}>
          <BrokenImageIcon sx={{ fontSize: 16 }} />
        </Box>
      </Tooltip>
    );
  }
  if (status === 'server_down') {
    return (
      <Tooltip title="Media server not running">
        <Box sx={boxSx}>
          <CloudOffIcon sx={{ fontSize: 16, color: 'warning.main' }} />
        </Box>
      </Tooltip>
    );
  }
  return type === 'image' ? (
    <Box
      component="img"
      src={resolved}
      sx={{ width: 48, height: 28, objectFit: 'cover', borderRadius: 0.5, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
    />
  ) : (
    <Box
      component="video"
      src={resolved}
      muted
      sx={{ width: 48, height: 28, objectFit: 'cover', borderRadius: 0.5, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
    />
  );
};

/** Merged font family + fallback editor. */
const FontFamilyEditor = ({
  primary,
  fallbacks,
  onPrimaryChange,
  onFallbacksChange,
}: {
  primary: string;
  fallbacks: string[];
  onPrimaryChange: (v: string) => void;
  onFallbacksChange: (v: string[]) => void;
}) => {
  const [newFont, setNewFont] = useState('');
  const fonts = useMemo(() => [...new Set(WEB_SAFE_FONTS)].sort((a, b) => a.localeCompare(b)), []);
  const handleAdd = () => {
    const f = newFont.trim();
    if (f && !fallbacks.includes(f)) {
      onFallbacksChange([...fallbacks, f]);
      setNewFont('');
    }
  };
  return (
    <Stack spacing={0.75}>
      <FontPicker value={primary} onChange={onPrimaryChange} />
      {fallbacks.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={0.5}>
          {fallbacks.map((f, i) => (
            <Chip
              key={`${f}-${i}`}
              label={f}
              size="small"
              onDelete={() => onFallbacksChange(fallbacks.filter((_, j) => j !== i))}
              sx={{ fontFamily: `"${f}", sans-serif` }}
            />
          ))}
        </Stack>
      )}
      <Stack direction="row" spacing={0.5}>
        <Autocomplete
          value={newFont}
          onChange={(_, val) => setNewFont(val || '')}
          inputValue={newFont}
          onInputChange={(_, val) => setNewFont(val)}
          options={fonts.filter((f) => f !== primary && !fallbacks.includes(f))}
          freeSolo
          size="small"
          sx={{ flex: 1 }}
          renderInput={(params) => <TextField {...params} placeholder="Add fallback font…" size="small" />}
        />
        <IconButton size="small" onClick={handleAdd} disabled={!newFont.trim()} color="primary">
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
};

const createEmptyStyleData = (): StyleData => ({
  backgroundColor: { enabled: true, value: '#000000' },
  fontFamily: { enabled: true, value: 'Roboto' },
  fontFallback: { enabled: true, value: ['Arial'] },
  fontColor: { enabled: true, value: '#FFFFFF' },
  fontSize: { enabled: true, value: '4vw' },
  fontBold: { enabled: true, value: true },
  lineHeight: { enabled: false, value: '120%' },
  textAlign: { enabled: true, value: 'center' },
  padding: { enabled: true, value: '0vw 0vh' },
});

/** Generate a CSS text block from the current StyleData for copying into the Custom CSS field. */
const generateCssFromStyleData = (data: StyleData): string => {
  const r = resolveStyleData(data);
  const containerLines: string[] = [];
  const textLines: string[] = [];

  if (r.backgroundColor) containerLines.push(`  background-color: ${r.backgroundColor};`);
  if (r.backgroundImage) {
    containerLines.push(`  background-image: url("${r.backgroundImage}");`);
    containerLines.push(`  background-size: ${r.backgroundSize || 'cover'};`);
    containerLines.push(`  background-position: ${r.backgroundPosition || 'center'};`);
    containerLines.push(`  background-repeat: no-repeat;`);
  }
  if (r.padding) containerLines.push(`  padding: ${r.padding};`);

  if (r.fontFamily || r.fontFallback) textLines.push(`  font-family: ${buildFontFamily(r.fontFamily, r.fontFallback)};`);
  if (r.textTransform && r.textTransform !== 'none') textLines.push(`  text-transform: ${r.textTransform};`);
  if (r.textAlign) textLines.push(`  text-align: ${r.textAlign};`);
  if (r.lineHeight) textLines.push(`  line-height: ${r.lineHeight};`);

  const parts: string[] = [];
  if (containerLines.length) parts.push(`.presentation {\n${containerLines.join('\n')}\n}`);
  if (textLines.length) parts.push(`.presentation-line {\n${textLines.join('\n')}\n}`);

  // Per-language overrides
  const langEntries = data.languageStyles?.value || [];
  for (const entry of langEntries) {
    const selector = entry.language ? `.presentation-line[data-lang="${entry.language}"]` : '.presentation-line';
    const langLines: string[] = [];
    if (entry.fontColor) langLines.push(`  color: ${entry.fontColor};`);
    if (entry.fontSize) langLines.push(`  font-size: ${entry.fontSize};`);
    if (entry.fontBold) langLines.push(`  font-weight: bold;`);
    if (entry.fontItalic) langLines.push(`  font-style: italic;`);
    if (entry.fontUnderline) langLines.push(`  text-decoration: underline;`);
    if (entry.letterSpacing) langLines.push(`  letter-spacing: ${entry.letterSpacing};`);
    if (entry.textShadow) langLines.push(`  text-shadow: ${entry.textShadow} ${entry.textShadowColor || 'rgba(0,0,0,0.5)'};`);
    if (entry.textStroke) langLines.push(`  -webkit-text-stroke: ${entry.textStroke};`);
    if (entry.opacity !== undefined) langLines.push(`  opacity: ${entry.opacity};`);
    if (langLines.length) parts.push(`${selector} {\n${langLines.join('\n')}\n}`);
  }

  return parts.join('\n\n');
};

interface StyleEditorProps {
  open: boolean;
  onClose: () => void;
  editStyleId?: number;
}

type WindowOverride = { window_name: string; override_style_id: number };

const LAST_EDITED_STYLE_KEY = 'presenter_last_edited_style_id';

/** Small 16:9 canvas that renders a mini-preview of a style. */
const StyleGalleryThumb = ({ style, isNew }: { style?: StyleEntity; isNew?: boolean }) => {
  const resolved = useMemo(() => {
    if (!style) return DEFAULT_STYLE;
    return mergeStyles(DEFAULT_STYLE, resolveStyleData(style.data));
  }, [style]);
  const containerCssRaw = useMemo(() => styleToContainerCss(resolved), [resolved]);
  // Exclude padding so the thumb's 16:9 aspect-ratio box is not offset by style padding
  const { padding: _thumbPadding, ...containerCss } = containerCssRaw as ReturnType<typeof styleToContainerCss> & { padding?: string };
  const textCss = useMemo(() => styleToTextCss(resolved), [resolved]);
  const bgImgSrc = resolved.backgroundImage ? resolveMediaUrl(resolved.backgroundImage) : undefined;
  const bgVideoSrc = resolved.backgroundVideo ? resolveMediaUrl(resolved.backgroundVideo) : undefined;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovered) {
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hovered]);

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        borderRadius: 0.5,
        overflow: 'hidden',
        ...containerCss,
      }}
    >
      {bgImgSrc && (
        <Box
          component="img"
          src={bgImgSrc}
          alt=""
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: (resolved.backgroundSize === 'contain' ? 'contain' : 'cover') as never,
            objectPosition: resolved.backgroundPosition || 'center',
            zIndex: 0,
            ...(resolved.backgroundBlur ? { filter: `blur(${resolved.backgroundBlur}px)` } : {}),
          }}
        />
      )}
      {bgVideoSrc && (
        <Box
          component="video"
          ref={videoRef}
          src={bgVideoSrc}
          muted
          loop
          playsInline
          preload="metadata"
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: (resolved.backgroundVideoSize === 'contain' ? 'contain' : 'cover') as never,
            objectPosition: resolved.backgroundVideoPosition || 'center',
            zIndex: 1,
            ...(resolved.backgroundVideoBlur ? { filter: `blur(${resolved.backgroundVideoBlur}px)` } : {}),
          }}
        />
      )}
      <Stack
        alignItems="center"
        justifyContent={resolved.verticalAlign === 'top' ? 'flex-start' : resolved.verticalAlign === 'bottom' ? 'flex-end' : 'center'}
        sx={{ width: '100%', height: '100%', position: 'relative', zIndex: 2, p: '6%', boxSizing: 'border-box' }}
      >
        {isNew ? (
          <AddIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        ) : (
          <>
            <Typography
              sx={{
                ...textCss,
                fontSize: 'clamp(5px, 1vw, 9px)',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              Amazing Grace
            </Typography>
            <Typography
              sx={{
                ...textCss,
                fontSize: 'clamp(5px, 1vw, 9px)',
                lineHeight: 1.3,
                opacity: 0.7,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              How sweet the sound
            </Typography>
          </>
        )}
      </Stack>
    </Box>
  );
};

/** Gallery-style selector: one row by default, expandable to 4 rows. */
const StyleGallery = ({
  styles,
  selectedId,
  onSelect,
  LL,
}: {
  styles: StyleEntity[];
  selectedId: number | 'new';
  onSelect: (id: number | 'new') => void;
  LL: ReturnType<typeof useI18nContext>['LL'];
}) => {
  const [expanded, setExpanded] = useState(false);
  // Each card ~120px wide; show as many as fit in one row, cap visible rows
  const maxRows = expanded ? 4 : 1;
  const CARD_W = 120;
  const GAP = 8;

  const items: Array<{ id: number | 'new'; style?: StyleEntity; label: string }> = [
    { id: 'new', label: `+ ${LL.STYLE.NEW()}` },
    ...styles.map((s) => ({ id: s.id, style: s, label: s.name })),
  ];

  return (
    <Stack spacing={0.5}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))`,
          gap: `${GAP}px`,
          maxHeight: maxRows * ((CARD_W * 9) / 16 + 28 + GAP) + GAP,
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        {items.map((item) => (
          <Box
            key={item.id}
            onClick={() => onSelect(item.id)}
            sx={{
              cursor: 'pointer',
              borderRadius: 1,
              border: 2,
              borderColor: selectedId === item.id ? 'primary.main' : 'divider',
              overflow: 'hidden',
              transition: 'border-color 0.15s',
              '&:hover': { borderColor: selectedId === item.id ? 'primary.main' : 'action.selected' },
            }}
          >
            <StyleGalleryThumb style={item.style} isNew={item.id === 'new'} />
            <Typography
              variant="caption"
              noWrap
              sx={{
                display: 'block',
                textAlign: 'center',
                px: 0.5,
                py: 0.25,
                fontWeight: selectedId === item.id ? 700 : 400,
                bgcolor: selectedId === item.id ? 'primary.main' : 'transparent',
                color: selectedId === item.id ? 'primary.contrastText' : 'text.secondary',
              }}
            >
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
      {items.length > 4 && (
        <Button
          size="small"
          onClick={() => setExpanded((e) => !e)}
          startIcon={expanded ? <UnfoldLessIcon /> : <UnfoldMoreIcon />}
          sx={{ alignSelf: 'center' }}
        >
          {expanded ? LL.STYLE.GALLERY_COLLAPSE() : LL.STYLE.GALLERY_EXPAND()}
        </Button>
      )}
    </Stack>
  );
};

export const StyleEditor = ({ open, onClose, editStyleId }: StyleEditorProps) => {
  const { LL } = useI18nContext();
  const { data: styles = [] } = useGetStylesQuery();
  const { data: knownLanguageTags = [] } = useGetLanguageTagsQuery();
  const [createStyleMutation] = useCreateStyleMutation();
  const [updateStyleMutation] = useUpdateStyleMutation();
  const [deleteStyleMutation] = useDeleteStyleMutation();

  const [selectedStyleId, setSelectedStyleId] = useState<number | 'new'>('new');
  const [styleName, setStyleName] = useState<string>(LL.STYLE.NEW());
  const [styleEnabled, setStyleEnabled] = useState(true);
  const [styleData, setStyleData] = useState<StyleData>(createEmptyStyleData());
  const [windowOverrides, setWindowOverrides] = useState<WindowOverride[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [showRawCss, setShowRawCss] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [renamePopoverAnchor, setRenamePopoverAnchor] = useState<HTMLElement | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Preview layer visibility & video controls
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImageHidden, setPreviewImageHidden] = useState(false);
  const [previewVideoHidden, setPreviewVideoHidden] = useState(false);
  const [previewVideoHovered, setPreviewVideoHovered] = useState(false);
  const [previewVideoPaused, setPreviewVideoPaused] = useState(false);
  const [previewVideoMuted, setPreviewVideoMuted] = useState(true);
  const [previewVideoTime, setPreviewVideoTime] = useState(0);
  const [previewVideoDuration, setPreviewVideoDuration] = useState(0);
  const [previewVideoVolume, setPreviewVideoVolume] = useState(1);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // Attach time/duration update listeners to the preview video element
  useEffect(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    const onTime = () => setPreviewVideoTime(v.currentTime);
    const onMeta = () => setPreviewVideoDuration(v.duration || 0);
    const onPlay = () => setPreviewVideoPaused(false);
    const onPause = () => setPreviewVideoPaused(true);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('durationchange', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('durationchange', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  });

  // Defensive: ensure the local media server is running whenever the editor is open.
  // The server is also pre-started at app launch (main/index.ts) but if the user
  // changed the media path mid-session this kicks an updatePath. Mirrors the
  // pattern in MediaBrowser so previews of saved background images/videos work
  // immediately.
  const { mediaPath } = useGetSettings();
  useEffect(() => {
    if (!open) return;
    const api = (window as unknown as { api?: { startMediaServer?: (p: string) => Promise<unknown> } }).api;
    if (api?.startMediaServer && mediaPath) {
      api.startMediaServer(mediaPath).catch(() => {
        /* already running */
      });
    }
  }, [open, mediaPath]);

  const loadStyleEntity = useCallback((style: StyleEntity) => {
    setStyleName(style.name);
    setStyleEnabled(style.enabled);
    setStyleData(style.data || createEmptyStyleData());
    setWindowOverrides(style.windowOverrides || []);
    setIsDirty(false);
  }, []);

  useEffect(() => {
    if (open && editStyleId) {
      setSelectedStyleId(editStyleId);
      const found = styles.find((s) => s.id === editStyleId);
      if (found) loadStyleEntity(found);
    }
  }, [open, editStyleId, styles, loadStyleEntity]);

  useEffect(() => {
    if (open && !editStyleId) {
      // Load last-edited style from localStorage
      const lastId = parseInt(localStorage.getItem(LAST_EDITED_STYLE_KEY) || '0', 10);
      const lastEdited = lastId ? styles.find((s) => s.id === lastId) : undefined;
      if (lastEdited) {
        setSelectedStyleId(lastEdited.id);
        loadStyleEntity(lastEdited);
      } else if (styles.length > 0) {
        setSelectedStyleId(styles[0].id);
        loadStyleEntity(styles[0]);
      } else {
        setSelectedStyleId('new');
        setStyleName(LL.STYLE.NEW());
        setStyleData(createEmptyStyleData());
        setWindowOverrides([]);
        setStyleEnabled(true);
      }
      setIsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStyleSelect = (id: number | 'new') => {
    if (isDirty && !confirm(LL.STYLE.UNSAVED_PROMPT())) return;
    setSelectedStyleId(id);
    if (id !== 'new') localStorage.setItem(LAST_EDITED_STYLE_KEY, String(id));
    if (id === 'new') {
      setStyleName(LL.STYLE.NEW());
      setStyleData(createEmptyStyleData());
      setWindowOverrides([]);
      setStyleEnabled(true);
      setIsDirty(false);
    } else {
      const found = styles.find((s) => s.id === id);
      if (found) loadStyleEntity(found);
    }
  };

  const updateProp = useCallback(<K extends keyof StyleData>(key: K, value: StyleData[K]) => {
    setStyleData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }, []);

  const DEFAULT_PROP_VALUES: Partial<Record<keyof StyleData, unknown>> = {
    backgroundColor: '#000000',
    backgroundImage: '',
    backgroundVideo: '',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundZoom: 100,
    backgroundVideoSize: 'cover',
    backgroundBlur: 0,
    backgroundVideoPosition: 'center',
    backgroundVideoZoom: 100,
    backgroundVideoBlur: 0,
    backgroundVideoVolume: 1,
    backgroundVideoEaseIn: 0,
    backgroundVideoEaseOut: 0,
    fontFamily: 'Roboto',
    fontFallback: ['Arial'],
    fontColor: '#FFFFFF',
    fontSize: '4vw',
    fontBold: true,
    fontItalic: false,
    fontUnderline: false,
    textAlign: 'center',
    verticalAlign: 'center',
    textTransform: 'none',
    textShadow: '2px 2px 4px',
    textShadowColor: '#000000',
    textStroke: '1px black',
    lineHeight: '120%',
    letterSpacing: '0px',
    padding: '0vw 0vh',
    opacity: 1,
    nextLinePreviewColor: '#AAAAAA',
    nextLinePreview: false,
    copyrightFontFamily: 'Roboto',
    copyrightFontColor: '#FFFFFF',
    copyrightFontSize: '2vw',
    copyrightFontBold: false,
    copyrightFontItalic: false,
    copyrightFontUnderline: false,
    copyrightTextAlign: 'center',
    copyrightPadding: '2vh 4vw',
    copyrightOpacity: 1,
    copyrightTitleFontSize: '2.5vw',
    copyrightTitleFontBold: false,
    copyrightTitleFontItalic: false,
    copyrightTitleFontUnderline: false,
    copyrightTitleSpacing: '0.5vh',
    copyrightShowSongNumber: false,
  };

  const togglePropEnabled = useCallback((key: keyof StyleData, enabled: boolean) => {
    setStyleData((prev) => {
      const existing = prev[key];
      if (existing && typeof existing === 'object' && 'enabled' in existing) return { ...prev, [key]: { ...existing, enabled } };
      return { ...prev, [key]: { enabled, value: DEFAULT_PROP_VALUES[key] } } as StyleData;
    });
    setIsDirty(true);
  }, []);

  const getProp = <T,>(key: keyof StyleData): { enabled: boolean; value: T } => {
    const prop = styleData[key];
    if (prop && typeof prop === 'object' && 'enabled' in prop) return prop as { enabled: boolean; value: T };
    return { enabled: false, value: '' as unknown as T };
  };

  // Derive image/video enable flags independently — image and video may now
  // both be enabled simultaneously (video overlays the image as a fallback).
  const bgImageEnabled = getProp<string>('backgroundImage').enabled;
  const bgVideoEnabled = getProp<string>('backgroundVideo').enabled;

  const [mediaBrowserOpen, setMediaBrowserOpen] = useState(false);
  const [mediaBrowserPickType, setMediaBrowserPickType] = useState<'image' | 'video'>('image');

  const handlePickImage = useCallback(() => {
    setMediaBrowserPickType('image');
    setMediaBrowserOpen(true);
  }, []);
  const handlePickVideo = useCallback(() => {
    setMediaBrowserPickType('video');
    setMediaBrowserOpen(true);
  }, []);

  const handleSave = async (): Promise<number | null> => {
    try {
      let id: number;
      if (selectedStyleId === 'new') {
        const result = await createStyleMutation({ name: styleName, enabled: styleEnabled, data: styleData }).unwrap();
        id = result.id;
        setSelectedStyleId(id);
        localStorage.setItem(LAST_EDITED_STYLE_KEY, String(id));
        if (windowOverrides.length > 0) await updateStyleMutation({ id, windowOverrides } as never).unwrap();
      } else {
        id = selectedStyleId;
        localStorage.setItem(LAST_EDITED_STYLE_KEY, String(id));
        await updateStyleMutation({ id, name: styleName, enabled: styleEnabled, data: styleData, windowOverrides } as never).unwrap();
      }
      setIsDirty(false);
      setStatusMessage(LL.STYLE.APPLIED());
      setTimeout(() => setStatusMessage(null), 2500);
      return id;
    } catch (error) {
      console.error('Failed to save style:', error);
      return null;
    }
  };

  const handleDuplicate = async () => {
    if (selectedStyleId === 'new') return;
    try {
      const result = await createStyleMutation({ name: `${styleName} (copy)`, enabled: styleEnabled, data: styleData }).unwrap();
      setSelectedStyleId(result.id);
      setStyleName(`${styleName} (copy)`);
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to duplicate style:', error);
    }
  };

  const handleDelete = async () => {
    if (selectedStyleId !== 'new') {
      if (!confirm(LL.STYLE.DELETE_CONFIRM())) return;
      try {
        await deleteStyleMutation({ id: selectedStyleId }).unwrap();
        setSelectedStyleId('new');
        setStyleName(LL.STYLE.NEW());
        setStyleData(createEmptyStyleData());
        setWindowOverrides([]);
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to delete style:', error);
      }
    }
  };

  const resolvedPreview = useMemo(() => mergeStyles(DEFAULT_STYLE, resolveStyleData(styleData)), [styleData]);
  const previewContainerCss = useMemo(() => styleToContainerCss(resolvedPreview), [resolvedPreview]);
  const { padding: previewPadding, ...previewContainerCssNoPadding } = previewContainerCss as ReturnType<typeof styleToContainerCss> & {
    padding?: string;
  };
  const previewTextCss = useMemo(() => styleToTextCss(resolvedPreview), [resolvedPreview]);

  const bgImageVal = getProp<string>('backgroundImage').value || '';
  const bgVideoVal = getProp<string>('backgroundVideo').value || '';

  return (
    <>
      <MediaBrowser
        open={mediaBrowserOpen}
        onClose={() => setMediaBrowserOpen(false)}
        mode="pick"
        pickType={mediaBrowserPickType}
        onAdd={() => {}}
        onPick={(path) => {
          if (mediaBrowserPickType === 'image') updateProp('backgroundImage', { enabled: true, value: path });
          else updateProp('backgroundVideo', { enabled: true, value: path });
        }}
      />
      <Drawer open={open} anchor="right" onClose={onClose}>
        <Stack sx={{ width: 'min(98vw, 900px)', height: '100%' }}>
          {/* Header */}
          <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }} spacing={1}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              {LL.STYLE.EDITOR()}
            </Typography>
            {isDirty && <Chip label={LL.STYLE.UNSAVED()} size="small" color="warning" />}
            {statusMessage && <Chip label={statusMessage} size="small" color="success" />}
            <Box flexGrow={1} />
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>

          {/* Style gallery selector */}
          <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
            <StyleGallery styles={styles} selectedId={selectedStyleId} onSelect={handleStyleSelect} LL={LL} />
            {/* Style name with inline actions */}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
              {selectedStyleId === 'new' ? (
                <TextField
                  size="small"
                  autoFocus
                  value={styleName}
                  onChange={(e) => {
                    setStyleName(e.target.value);
                    setIsDirty(true);
                  }}
                  placeholder={LL.STYLE.NAME()}
                  label={LL.STYLE.NAME()}
                  sx={{ flex: 1 }}
                />
              ) : (
                <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
                  {styleName}
                </Typography>
              )}
              {selectedStyleId !== 'new' && (
                <>
                  <Tooltip title={LL.STYLE.RENAME()}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        setRenameValue(styleName);
                        setRenamePopoverAnchor(e.currentTarget);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={LL.STYLE.DUPLICATE()}>
                    <IconButton size="small" onClick={handleDuplicate}>
                      <DuplicateIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={LL.COMMON.DELETE()}>
                    <IconButton size="small" color="error" onClick={handleDelete}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
            {/* Rename popover */}
            <Popover
              open={Boolean(renamePopoverAnchor)}
              anchorEl={renamePopoverAnchor}
              onClose={() => setRenamePopoverAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
              <Stack direction="row" spacing={0.5} sx={{ p: 1 }}>
                <TextField
                  size="small"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setStyleName(renameValue);
                      setIsDirty(true);
                      setRenamePopoverAnchor(null);
                    }
                  }}
                  placeholder={LL.STYLE.NAME()}
                  sx={{ width: 220 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    setStyleName(renameValue);
                    setIsDirty(true);
                    setRenamePopoverAnchor(null);
                  }}
                >
                  {LL.COMMON.SAVE()}
                </Button>
              </Stack>
            </Popover>
          </Box>

          {/* Scrollable form */}
          <Stack sx={{ flex: 1, overflow: 'auto', p: 2 }} spacing={1}>
            <Section title={LL.STYLE.SECTION_BACKGROUND()}>
              {/* Background color — always available as a base layer */}
              <StylePropRow
                label={LL.STYLE.BACKGROUND_COLOR()}
                enabled={getProp<string>('backgroundColor').enabled}
                onToggle={(e) => togglePropEnabled('backgroundColor', e)}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <ColorSwatchButton
                    value={getProp<string>('backgroundColor').value || '#000000'}
                    onChange={(c) => updateProp('backgroundColor', { enabled: true, value: c })}
                  />
                  <Button
                    size="small"
                    variant={getProp<string>('backgroundColor').value === 'transparent' ? 'contained' : 'outlined'}
                    onClick={() => updateProp('backgroundColor', { enabled: true, value: 'transparent' })}
                    sx={{ fontSize: '0.7rem', py: 0.25, px: 1, minWidth: 0 }}
                  >
                    {LL.STYLE.BACKGROUND_TRANSPARENT()}
                  </Button>
                </Stack>
              </StylePropRow>

              {/* Image — compact: toggle + path input in one row */}
              <MediaPropRow
                label={LL.STYLE.BACKGROUND_IMAGE()}
                enabled={bgImageEnabled}
                onToggle={(e) => {
                  togglePropEnabled('backgroundImage', e);
                  if (e) updateProp('backgroundImage', { enabled: true, value: bgImageVal });
                }}
                value={bgImageVal}
                onChange={(v) => updateProp('backgroundImage', { enabled: true, value: v })}
                onBrowse={handlePickImage}
                thumbType="image"
              />
              <StylePropRow
                label={LL.STYLE.BACKGROUND_IMAGE_NONE()}
                enabled={!!styleData.suppressBackgroundImage}
                onToggle={(e) => {
                  setStyleData((prev) => ({ ...prev, suppressBackgroundImage: e }));
                  setIsDirty(true);
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Overrides inherited image
                </Typography>
              </StylePropRow>
              {bgImageEnabled && (
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ pl: '184px', py: 0.5 }}>
                  <Select
                    size="small"
                    value={getProp<string>('backgroundSize').value || 'cover'}
                    onChange={(e) => updateProp('backgroundSize', { enabled: true, value: e.target.value as never })}
                    sx={{ width: 120 }}
                  >
                    <MenuItem value="cover">Cover</MenuItem>
                    <MenuItem value="contain">Contain</MenuItem>
                    <MenuItem value="100% auto">Fit W</MenuItem>
                    <MenuItem value="auto 100%">Fit H</MenuItem>
                    <MenuItem value="auto">Original</MenuItem>
                  </Select>
                  <CompactPositionPicker
                    value={getProp<string>('backgroundPosition').value || 'center'}
                    onChange={(v) => updateProp('backgroundPosition', { enabled: true, value: v })}
                  />
                  <Stack alignItems="center" spacing={0}>
                    <Typography variant="caption" color="text.secondary">
                      {LL.STYLE.BG_ZOOM()}
                    </Typography>
                    <Slider
                      size="small"
                      min={100}
                      max={200}
                      step={5}
                      value={getProp<number>('backgroundZoom').value || 100}
                      onChange={(_, val) => updateProp('backgroundZoom', { enabled: true, value: val as number })}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}%`}
                      sx={{ width: 80 }}
                    />
                  </Stack>
                  <Stack alignItems="center" spacing={0}>
                    <Typography variant="caption" color="text.secondary">
                      {LL.STYLE.BG_BLUR()}
                    </Typography>
                    <Slider
                      size="small"
                      min={0}
                      max={40}
                      step={1}
                      value={getProp<number>('backgroundBlur').value || 0}
                      onChange={(_, val) => updateProp('backgroundBlur', { enabled: true, value: val as number })}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}px`}
                      sx={{ width: 80 }}
                    />
                  </Stack>
                </Stack>
              )}

              {/* Video — compact: toggle + path input in one row */}
              <MediaPropRow
                label={LL.STYLE.BACKGROUND_VIDEO()}
                enabled={bgVideoEnabled}
                onToggle={(e) => {
                  togglePropEnabled('backgroundVideo', e);
                  if (e) updateProp('backgroundVideo', { enabled: true, value: bgVideoVal });
                }}
                value={bgVideoVal}
                onChange={(v) => updateProp('backgroundVideo', { enabled: true, value: v })}
                onBrowse={handlePickVideo}
                thumbType="video"
              />
              <StylePropRow
                label={LL.STYLE.BACKGROUND_VIDEO_NONE()}
                enabled={!!styleData.suppressBackgroundVideo}
                onToggle={(e) => {
                  setStyleData((prev) => ({ ...prev, suppressBackgroundVideo: e }));
                  setIsDirty(true);
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Overrides inherited video
                </Typography>
              </StylePropRow>
              {bgVideoEnabled && (
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ pl: '184px', py: 0.5 }}>
                  <Select
                    size="small"
                    value={getProp<string>('backgroundVideoSize').value || 'cover'}
                    onChange={(e) => updateProp('backgroundVideoSize', { enabled: true, value: e.target.value as never })}
                    sx={{ width: 120 }}
                  >
                    <MenuItem value="cover">Cover</MenuItem>
                    <MenuItem value="contain">Contain</MenuItem>
                    <MenuItem value="100% auto">Fit W</MenuItem>
                    <MenuItem value="auto 100%">Fit H</MenuItem>
                    <MenuItem value="auto">Original</MenuItem>
                  </Select>
                  <CompactPositionPicker
                    value={getProp<string>('backgroundVideoPosition').value || 'center'}
                    onChange={(v) => updateProp('backgroundVideoPosition', { enabled: true, value: v })}
                  />
                  <Stack alignItems="center" spacing={0}>
                    <Typography variant="caption" color="text.secondary">
                      {LL.STYLE.BG_ZOOM()}
                    </Typography>
                    <Slider
                      size="small"
                      min={100}
                      max={200}
                      step={5}
                      value={getProp<number>('backgroundVideoZoom').value || 100}
                      onChange={(_, val) => updateProp('backgroundVideoZoom', { enabled: true, value: val as number })}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}%`}
                      sx={{ width: 80 }}
                    />
                  </Stack>
                  <Stack alignItems="center" spacing={0}>
                    <Typography variant="caption" color="text.secondary">
                      {LL.STYLE.BG_BLUR()}
                    </Typography>
                    <Slider
                      size="small"
                      min={0}
                      max={40}
                      step={1}
                      value={getProp<number>('backgroundVideoBlur').value || 0}
                      onChange={(_, val) => updateProp('backgroundVideoBlur', { enabled: true, value: val as number })}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${v}px`}
                      sx={{ width: 80 }}
                    />
                  </Stack>
                  <Stack alignItems="center" spacing={0}>
                    <Typography variant="caption" color="text.secondary">
                      {LL.VIDEO.VOLUME()}
                    </Typography>
                    <Slider
                      size="small"
                      min={0}
                      max={1}
                      step={0.05}
                      value={getProp<number>('backgroundVideoVolume').value ?? 1}
                      onChange={(_, val) => updateProp('backgroundVideoVolume', { enabled: true, value: val as number })}
                      valueLabelDisplay="auto"
                      valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
                      sx={{ width: 80 }}
                    />
                  </Stack>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={getProp<boolean>('backgroundVideoAutoplay').value !== false}
                        onChange={(e) => updateProp('backgroundVideoAutoplay', { enabled: true, value: e.target.checked })}
                      />
                    }
                    label={<Typography variant="caption">{LL.VIDEO.AUTOPLAY()}</Typography>}
                    sx={{ ml: 0 }}
                  />
                </Stack>
              )}
            </Section>

            <Section title={LL.STYLE.SECTION_GENERAL()}>
              <StylePropRow
                label={LL.STYLE.VIDEO_EASE_IN()}
                enabled={getProp<number>('backgroundVideoEaseIn').enabled}
                onToggle={(e) => togglePropEnabled('backgroundVideoEaseIn', e)}
              >
                <Slider
                  size="small"
                  min={0}
                  max={5}
                  step={0.5}
                  value={getProp<number>('backgroundVideoEaseIn').value || 0}
                  onChange={(_, val) => updateProp('backgroundVideoEaseIn', { enabled: true, value: val as number })}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${v}s`}
                  sx={{ width: 120 }}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.VIDEO_EASE_OUT()}
                enabled={getProp<number>('backgroundVideoEaseOut').enabled}
                onToggle={(e) => togglePropEnabled('backgroundVideoEaseOut', e)}
              >
                <Slider
                  size="small"
                  min={0}
                  max={5}
                  step={0.5}
                  value={getProp<number>('backgroundVideoEaseOut').value || 0}
                  onChange={(_, val) => updateProp('backgroundVideoEaseOut', { enabled: true, value: val as number })}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${v}s`}
                  sx={{ width: 120 }}
                />
              </StylePropRow>
            </Section>

            <Section title={LL.STYLE.SECTION_PARAGRAPH()}>
              <StylePropRow
                label={LL.STYLE.FONT_FAMILY()}
                enabled={getProp<string>('fontFamily').enabled || getProp<string[]>('fontFallback').enabled}
                onToggle={(e) => {
                  togglePropEnabled('fontFamily', e);
                  togglePropEnabled('fontFallback', e);
                }}
              >
                <FontFamilyEditor
                  primary={getProp<string>('fontFamily').value || 'Arial'}
                  fallbacks={getProp<string[]>('fontFallback').value || []}
                  onPrimaryChange={(font) => updateProp('fontFamily', { enabled: true, value: font })}
                  onFallbacksChange={(list) => updateProp('fontFallback', { enabled: true, value: list })}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.ALIGNMENT()}
                enabled={getProp<string>('textAlign').enabled || getProp<string>('verticalAlign').enabled}
                onToggle={(e) => {
                  togglePropEnabled('textAlign', e);
                  togglePropEnabled('verticalAlign', e);
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={getProp<string>('textAlign').value || 'center'}
                    onChange={(_, val) => val && updateProp('textAlign', { enabled: true, value: val })}
                  >
                    <ToggleButton value="left">
                      <AlignLeftIcon />
                    </ToggleButton>
                    <ToggleButton value="center">
                      <AlignCenterIcon />
                    </ToggleButton>
                    <ToggleButton value="right">
                      <AlignRightIcon />
                    </ToggleButton>
                    <ToggleButton value="justify">
                      <AlignJustifyIcon />
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Box sx={{ width: 1, height: 28, bgcolor: 'divider' }} />
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={getProp<string>('verticalAlign').value || 'center'}
                    onChange={(_, val) => val && updateProp('verticalAlign', { enabled: true, value: val })}
                  >
                    <Tooltip title={LL.STYLE.VERTICAL_ALIGN() + ': Top'}>
                      <ToggleButton value="top">
                        <VAlignTopIcon />
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title={LL.STYLE.VERTICAL_ALIGN() + ': Center'}>
                      <ToggleButton value="center">
                        <VAlignMidIcon />
                      </ToggleButton>
                    </Tooltip>
                    <Tooltip title={LL.STYLE.VERTICAL_ALIGN() + ': Bottom'}>
                      <ToggleButton value="bottom">
                        <VAlignBotIcon />
                      </ToggleButton>
                    </Tooltip>
                  </ToggleButtonGroup>
                </Stack>
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.TRANSFORM()}
                enabled={getProp<string>('textTransform').enabled}
                onToggle={(e) => togglePropEnabled('textTransform', e)}
              >
                <Select
                  size="small"
                  value={getProp<string>('textTransform').value || 'none'}
                  onChange={(e) => updateProp('textTransform', { enabled: true, value: e.target.value as never })}
                  sx={{ width: 150 }}
                >
                  <MenuItem value="none">None</MenuItem>
                  <MenuItem value="uppercase">UPPERCASE</MenuItem>
                  <MenuItem value="lowercase">lowercase</MenuItem>
                  <MenuItem value="capitalize">Capitalize</MenuItem>
                </Select>
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.LINE_HEIGHT()}
                enabled={getProp<string>('lineHeight').enabled}
                onToggle={(e) => togglePropEnabled('lineHeight', e)}
              >
                <CssUnitInput
                  value={getProp<string>('lineHeight').value || '1.4'}
                  onChange={(v) => updateProp('lineHeight', { enabled: true, value: v })}
                  units={['em', 'px', 'rem', '%']}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.PADDING()}
                enabled={getProp<string>('padding').enabled}
                onToggle={(e) => togglePropEnabled('padding', e)}
              >
                {(() => {
                  const raw = getProp<string>('padding').value || '5% 10%';
                  const parts = raw.split(/\s+/);
                  const pV = parts[0] || '5%';
                  const pH = parts[1] || parts[0] || '10%';
                  return (
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <CssUnitInput
                        value={pV}
                        onChange={(v) => updateProp('padding', { enabled: true, value: `${v} ${pH}` })}
                        label="Vertical"
                      />
                      <CssUnitInput
                        value={pH}
                        onChange={(v) => updateProp('padding', { enabled: true, value: `${pV} ${v}` })}
                        label="Horizontal"
                      />
                    </Stack>
                  );
                })()}
              </StylePropRow>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                <Switch
                  size="small"
                  checked={styleData.hideText || false}
                  onChange={(e) => {
                    setStyleData((prev) => ({ ...prev, hideText: e.target.checked }));
                    setIsDirty(true);
                  }}
                />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {styleData.hideText ? (
                    <VisibilityOffIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                  ) : (
                    <VisibilityIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                  )}
                  {LL.STYLE.HIDE_TEXT()}
                </Typography>
              </Stack>
            </Section>

            {/* Language/Translation section — per-language typography */}
            {(() => {
              const langStyles: LanguageStyleEntry[] = getProp<LanguageStyleEntry[]>('languageStyles').value || [{ language: '' }];
              const updateLangEntry = (idx: number, patch: Partial<LanguageStyleEntry>) => {
                const updated = [...langStyles];
                updated[idx] = { ...updated[idx], ...patch };
                updateProp('languageStyles', { enabled: true, value: updated });
              };
              const addLang = (tag: string) => {
                if (langStyles.some((e) => e.language === tag)) return;
                updateProp('languageStyles', { enabled: true, value: [...langStyles, { language: tag }] });
              };
              const removeLang = (idx: number) => {
                const updated = langStyles.filter((_, i) => i !== idx);
                updateProp('languageStyles', { enabled: true, value: updated.length ? updated : [{ language: '' }] });
              };
              const moveLang = (idx: number, direction: -1 | 1) => {
                // All entries (including default) can be reordered freely
                const newIdx = idx + direction;
                if (newIdx < 0 || newIdx >= langStyles.length) return;
                const reordered = [...langStyles];
                [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
                updateProp('languageStyles', { enabled: true, value: reordered });
              };
              // Ensure there is always at least a default entry
              const entries = langStyles.some((e) => e.language === '') ? langStyles : [{ language: '' }, ...langStyles];
              const [addLangInput, setAddLangInput] = React.useState('');
              // Drag-and-drop state
              const dragIndexRef = React.useRef<number | null>(null);
              const [dragOver, setDragOver] = React.useState<number | null>(null);

              return (
                <Section title={LL.STYLE.SECTION_TYPOGRAPHY()} defaultExpanded={false}>
                  {entries.map((entry, idx) => {
                    const isDefault = entry.language === '';
                    const canMoveUp = idx > 0;
                    const canMoveDown = idx < entries.length - 1;
                    return (
                      <Accordion
                        key={entry.language || 'default'}
                        defaultExpanded={idx === 0}
                        disableGutters
                        elevation={0}
                        draggable
                        onDragStart={() => {
                          dragIndexRef.current = idx;
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(idx);
                        }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          const from = dragIndexRef.current;
                          if (from === null || from === idx) return;
                          const reordered = [...langStyles];
                          const [item] = reordered.splice(from, 1);
                          reordered.splice(idx, 0, item);
                          updateProp('languageStyles', { enabled: true, value: reordered });
                          dragIndexRef.current = null;
                        }}
                        sx={{
                          border: 1,
                          borderColor: dragOver === idx ? 'primary.main' : 'divider',
                          borderRadius: 1,
                          '&:before': { display: 'none' },
                          mb: 0.5,
                          opacity: dragIndexRef.current === idx ? 0.5 : 1,
                        }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreIcon />}
                          sx={{ bgcolor: isDefault ? 'action.hover' : 'background.paper', borderRadius: 1 }}
                        >
                          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flex: 1, mr: 1 }}>
                            <DragHandleIcon fontSize="small" sx={{ color: 'action.active', cursor: 'grab', mr: 0.5 }} />
                            <TranslateIcon fontSize="small" color={isDefault ? 'primary' : 'action'} />
                            <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>
                              {isDefault ? LL.STYLE.LANG_DEFAULT() : entry.language.toUpperCase()}
                            </Typography>
                            {entry.fontColor && (
                              <Box
                                sx={{
                                  width: 14,
                                  height: 14,
                                  borderRadius: 0.5,
                                  bgcolor: entry.fontColor,
                                  border: '1px solid',
                                  borderColor: 'divider',
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </Stack>
                          {!isDefault && (
                            <Stack direction="row" spacing={0} onClick={(e) => e.stopPropagation()}>
                              <Tooltip title={LL.STYLE.LANG_MOVE_UP()}>
                                <span>
                                  <IconButton component="div" size="small" disabled={!canMoveUp} onClick={() => moveLang(idx, -1)}>
                                    <MoveUpIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={LL.STYLE.LANG_MOVE_DOWN()}>
                                <span>
                                  <IconButton component="div" size="small" disabled={!canMoveDown} onClick={() => moveLang(idx, 1)}>
                                    <MoveDownIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={LL.STYLE.LANG_REMOVE()}>
                                <IconButton component="div" size="small" onClick={() => removeLang(idx)} color="error">
                                  <RemoveIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          )}
                        </AccordionSummary>
                        <AccordionDetails>
                          <LanguageStyleEditor entry={entry} onChange={(patch) => updateLangEntry(idx, patch)} LL={LL} />
                        </AccordionDetails>
                      </Accordion>
                    );
                  })}
                  {/* Add language row + show other languages */}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                    <Autocomplete
                      freeSolo
                      options={knownLanguageTags.filter((t) => !entries.some((e) => e.language === t.toLowerCase()))}
                      inputValue={addLangInput}
                      onInputChange={(_, v) => setAddLangInput(v)}
                      size="small"
                      sx={{ width: 150 }}
                      renderInput={(params) => <TextField {...params} label={LL.STYLE.LANG_TAG()} size="small" />}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      disabled={!addLangInput.trim()}
                      onClick={() => {
                        addLang(addLangInput.trim().toLowerCase());
                        setAddLangInput('');
                      }}
                    >
                      {LL.STYLE.LANG_ADD()}
                    </Button>
                    <Box sx={{ flexGrow: 1 }} />
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={styleData.showAllLanguages ?? false}
                          onChange={(e) => {
                            setStyleData((prev) => ({ ...prev, showAllLanguages: e.target.checked }));
                            setIsDirty(true);
                          }}
                        />
                      }
                      label={<Typography variant="caption">{LL.STYLE.SHOW_OTHER_LANGUAGES()}</Typography>}
                      sx={{ ml: 0 }}
                    />
                  </Stack>
                </Section>
              );
            })()}

            <Section title={LL.STYLE.SECTION_COPYRIGHT()} defaultExpanded={false}>
              {/* 1. Font */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_FONT()}
                enabled={getProp<string>('copyrightFontFamily').enabled}
                onToggle={(e) => togglePropEnabled('copyrightFontFamily', e)}
              >
                <FontFamilyEditor
                  primary={getProp<string>('copyrightFontFamily').value || 'Arial'}
                  fallbacks={[]}
                  onPrimaryChange={(font) => updateProp('copyrightFontFamily', { enabled: true, value: font })}
                  onFallbacksChange={() => {}}
                />
              </StylePropRow>
              {/* 2. Padding */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_PADDING()}
                enabled={getProp<string>('copyrightPadding').enabled}
                onToggle={(e) => togglePropEnabled('copyrightPadding', e)}
              >
                {(() => {
                  const raw = getProp<string>('copyrightPadding').value || '2vh 4vw';
                  const parts = raw.split(/\s+/);
                  const pV = parts[0] || '2vh';
                  const pH = parts[1] || parts[0] || '4vw';
                  return (
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <CssUnitInput
                        value={pV}
                        onChange={(v) => updateProp('copyrightPadding', { enabled: true, value: `${v} ${pH}` })}
                        label="Vertical"
                      />
                      <CssUnitInput
                        value={pH}
                        onChange={(v) => updateProp('copyrightPadding', { enabled: true, value: `${pV} ${v}` })}
                        label="Horizontal"
                      />
                    </Stack>
                  );
                })()}
              </StylePropRow>
              {/* 3. Alignment */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_ALIGNMENT()}
                enabled={getProp<string>('copyrightTextAlign').enabled}
                onToggle={(e) => togglePropEnabled('copyrightTextAlign', e)}
              >
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={getProp<string>('copyrightTextAlign').value || 'center'}
                  onChange={(_, val) => val && updateProp('copyrightTextAlign', { enabled: true, value: val })}
                >
                  <ToggleButton value="left">
                    <AlignLeftIcon />
                  </ToggleButton>
                  <ToggleButton value="center">
                    <AlignCenterIcon />
                  </ToggleButton>
                  <ToggleButton value="right">
                    <AlignRightIcon />
                  </ToggleButton>
                </ToggleButtonGroup>
              </StylePropRow>
              {/* 4. Opacity */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_OPACITY()}
                enabled={getProp<number>('copyrightOpacity').enabled}
                onToggle={(e) => togglePropEnabled('copyrightOpacity', e)}
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={getProp<number>('copyrightOpacity').value ?? 1}
                  onChange={(_, v) => updateProp('copyrightOpacity', { enabled: true, value: v as number })}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => `${Math.round((v as number) * 100)}%`}
                  sx={{ width: 200 }}
                />
              </StylePropRow>
              {/* 5. Title Font Size */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_TITLE_SIZE()}
                enabled={getProp<string>('copyrightTitleFontSize').enabled}
                onToggle={(e) => togglePropEnabled('copyrightTitleFontSize', e)}
              >
                <CssUnitInput
                  value={getProp<string>('copyrightTitleFontSize').value || '2.5vh'}
                  onChange={(v) => updateProp('copyrightTitleFontSize', { enabled: true, value: v })}
                />
              </StylePropRow>
              {/* 6. Title Text Style */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_TITLE_BOLD_ITALIC()}
                enabled={
                  getProp<boolean>('copyrightTitleFontBold').enabled ||
                  getProp<boolean>('copyrightTitleFontItalic').enabled ||
                  getProp<boolean>('copyrightTitleFontUnderline').enabled
                }
                onToggle={(e) => {
                  togglePropEnabled('copyrightTitleFontBold', e);
                  togglePropEnabled('copyrightTitleFontItalic', e);
                  togglePropEnabled('copyrightTitleFontUnderline', e);
                }}
              >
                <ToggleButtonGroup size="small">
                  <ToggleButton
                    value="bold"
                    selected={getProp<boolean>('copyrightTitleFontBold').value || false}
                    onClick={() =>
                      updateProp('copyrightTitleFontBold', { enabled: true, value: !getProp<boolean>('copyrightTitleFontBold').value })
                    }
                  >
                    <BoldIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="italic"
                    selected={getProp<boolean>('copyrightTitleFontItalic').value || false}
                    onClick={() =>
                      updateProp('copyrightTitleFontItalic', { enabled: true, value: !getProp<boolean>('copyrightTitleFontItalic').value })
                    }
                  >
                    <ItalicIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="underline"
                    selected={getProp<boolean>('copyrightTitleFontUnderline').value || false}
                    onClick={() =>
                      updateProp('copyrightTitleFontUnderline', {
                        enabled: true,
                        value: !getProp<boolean>('copyrightTitleFontUnderline').value,
                      })
                    }
                  >
                    <UnderlineIcon />
                  </ToggleButton>
                </ToggleButtonGroup>
              </StylePropRow>
              {/* 7. Title Spacing */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_TITLE_SPACING()}
                enabled={getProp<string>('copyrightTitleSpacing').enabled}
                onToggle={(e) => togglePropEnabled('copyrightTitleSpacing', e)}
              >
                <CssUnitInput
                  value={getProp<string>('copyrightTitleSpacing').value || '0.5vh'}
                  onChange={(v) => updateProp('copyrightTitleSpacing', { enabled: true, value: v })}
                />
              </StylePropRow>
              {/* 8. Show Song Number in Title */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_SHOW_SONG_NUMBER()}
                enabled={getProp<boolean>('copyrightShowSongNumber').enabled}
                onToggle={(e) => togglePropEnabled('copyrightShowSongNumber', e)}
              >
                <Switch
                  size="small"
                  checked={getProp<boolean>('copyrightShowSongNumber').value || false}
                  onChange={(e) => updateProp('copyrightShowSongNumber', { enabled: true, value: e.target.checked })}
                />
              </StylePropRow>
              {/* 9. Size */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_SIZE()}
                enabled={getProp<string>('copyrightFontSize').enabled}
                onToggle={(e) => togglePropEnabled('copyrightFontSize', e)}
              >
                <CssUnitInput
                  value={getProp<string>('copyrightFontSize').value || '2vh'}
                  onChange={(v) => updateProp('copyrightFontSize', { enabled: true, value: v })}
                />
              </StylePropRow>
              {/* 10. Color */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_COLOR()}
                enabled={getProp<string>('copyrightFontColor').enabled}
                onToggle={(e) => togglePropEnabled('copyrightFontColor', e)}
              >
                <ColorSwatchButton
                  value={getProp<string>('copyrightFontColor').value || '#FFFFFF'}
                  onChange={(c) => updateProp('copyrightFontColor', { enabled: true, value: c })}
                />
              </StylePropRow>
              {/* 11. Text Style (Bold / Italic / Underline) */}
              <StylePropRow
                label={LL.STYLE.COPYRIGHT_BOLD_ITALIC()}
                enabled={
                  getProp<boolean>('copyrightFontBold').enabled ||
                  getProp<boolean>('copyrightFontItalic').enabled ||
                  getProp<boolean>('copyrightFontUnderline').enabled
                }
                onToggle={(e) => {
                  togglePropEnabled('copyrightFontBold', e);
                  togglePropEnabled('copyrightFontItalic', e);
                  togglePropEnabled('copyrightFontUnderline', e);
                }}
              >
                <ToggleButtonGroup size="small">
                  <ToggleButton
                    value="bold"
                    selected={getProp<boolean>('copyrightFontBold').value || false}
                    onClick={() => updateProp('copyrightFontBold', { enabled: true, value: !getProp<boolean>('copyrightFontBold').value })}
                  >
                    <BoldIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="italic"
                    selected={getProp<boolean>('copyrightFontItalic').value || false}
                    onClick={() =>
                      updateProp('copyrightFontItalic', { enabled: true, value: !getProp<boolean>('copyrightFontItalic').value })
                    }
                  >
                    <ItalicIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="underline"
                    selected={getProp<boolean>('copyrightFontUnderline').value || false}
                    onClick={() =>
                      updateProp('copyrightFontUnderline', { enabled: true, value: !getProp<boolean>('copyrightFontUnderline').value })
                    }
                  >
                    <UnderlineIcon />
                  </ToggleButton>
                </ToggleButtonGroup>
              </StylePropRow>
            </Section>

            <Section title={LL.STYLE.SECTION_CUSTOM_CSS()} defaultExpanded={false}>
              {' '}
              <Stack direction="row" alignItems="center" spacing={1}>
                <Switch checked={showRawCss} onChange={(e) => setShowRawCss(e.target.checked)} size="small" />
                <Typography variant="body2">{LL.STYLE.CUSTOM_CSS()}</Typography>
                <Box flexGrow={1} />
                <Tooltip title="Insert current style settings as CSS">
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<CodeIcon />}
                    onClick={() => {
                      const generated = generateCssFromStyleData(styleData);
                      setStyleData((prev) => ({ ...prev, css: prev.css ? `${prev.css}\n\n${generated}` : generated }));
                      setShowRawCss(true);
                      setIsDirty(true);
                    }}
                  >
                    Insert as CSS
                  </Button>
                </Tooltip>
              </Stack>
              {showRawCss && (
                <TextField
                  multiline
                  rows={6}
                  fullWidth
                  value={styleData.css || ''}
                  onChange={(e) => {
                    setStyleData((prev) => ({ ...prev, css: e.target.value }));
                    setIsDirty(true);
                  }}
                  placeholder=".presentation-line { /* custom styles */ }"
                  sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              )}
            </Section>
          </Stack>

          {/* ── Live preview — collapsible, default collapsed ── */}
          <Box sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, bgcolor: (t) => t.palette.action.hover }}>
            {/* Header row — not a button itself, so icon buttons won't be nested inside a button */}
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ px: 2, py: 1, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setPreviewOpen((v) => !v)}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
                Preview — {styleName}
              </Typography>
              {resolvedPreview.backgroundImage && (
                <Tooltip title={previewImageHidden ? LL.STYLE.PREVIEW_SHOW_IMAGE() : LL.STYLE.PREVIEW_HIDE_IMAGE()}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewImageHidden((h) => !h);
                    }}
                    color={previewImageHidden ? 'warning' : 'default'}
                  >
                    <ImageIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {resolvedPreview.backgroundVideo && (
                <Tooltip title={previewVideoHidden ? LL.STYLE.PREVIEW_SHOW_VIDEO() : LL.STYLE.PREVIEW_HIDE_VIDEO()}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewVideoHidden((h) => !h);
                    }}
                    color={previewVideoHidden ? 'warning' : 'default'}
                  >
                    <VideoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {previewOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </Stack>
            {previewOpen && (
              <Box sx={{ px: '20%', py: 1 }}>
                <Box
                  sx={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16/9',
                    borderRadius: 1,
                    overflow: 'hidden',
                    border: 1,
                    borderColor: 'divider',
                    ...previewContainerCssNoPadding,
                  }}
                >
                  {/* Image layer with fit / position / zoom / blur */}
                  {resolvedPreview.backgroundImage &&
                    !previewImageHidden &&
                    (() => {
                      const imgFit = resolvedPreview.backgroundSize === 'contain' ? 'contain' : 'cover';
                      const imgPos = resolvedPreview.backgroundPosition || 'center';
                      const imgZoom = resolvedPreview.backgroundZoom ?? 100;
                      return (
                        <Box
                          component="img"
                          src={resolveMediaUrl(resolvedPreview.backgroundImage)}
                          alt=""
                          sx={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: imgFit as never,
                            objectPosition: imgPos,
                            zIndex: 0,
                            ...(imgZoom !== 100 ? { transform: `scale(${imgZoom / 100})`, transformOrigin: imgPos } : {}),
                            ...(resolvedPreview.backgroundBlur ? { filter: `blur(${resolvedPreview.backgroundBlur}px)` } : {}),
                          }}
                        />
                      );
                    })()}
                  {/* Video layer with hover controls, fit / position / zoom / blur */}
                  {resolvedPreview.backgroundVideo &&
                    !previewVideoHidden &&
                    (() => {
                      const videoSizeVal = resolvedPreview.backgroundVideoSize ?? resolvedPreview.backgroundSize;
                      const videoFit = videoSizeVal === 'contain' ? 'contain' : 'cover';
                      const videoPos = (resolvedPreview.backgroundVideoPosition ?? resolvedPreview.backgroundPosition) || 'center';
                      const videoZoom = resolvedPreview.backgroundVideoZoom ?? resolvedPreview.backgroundZoom ?? 100;
                      const videoBlur = resolvedPreview.backgroundVideoBlur ?? 0;
                      const videoSrc = resolveMediaUrl(resolvedPreview.backgroundVideo);
                      return (
                        <Box
                          sx={{ position: 'absolute', inset: 0, zIndex: 1 }}
                          onMouseEnter={() => setPreviewVideoHovered(true)}
                          onMouseLeave={() => setPreviewVideoHovered(false)}
                        >
                          <video
                            key={videoSrc}
                            ref={previewVideoRef}
                            src={videoSrc}
                            autoPlay
                            loop
                            muted={previewVideoMuted}
                            playsInline
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: videoFit,
                              objectPosition: videoPos,
                              ...(videoZoom !== 100 ? { transform: `scale(${videoZoom / 100})`, transformOrigin: videoPos } : {}),
                              ...(videoBlur ? { filter: `blur(${videoBlur}px)` } : {}),
                            }}
                          />
                          {/* Hover overlay — play/pause, mute, seek, time, volume */}
                          <Stack
                            direction="row"
                            spacing={0.5}
                            alignItems="center"
                            sx={{
                              position: 'absolute',
                              bottom: 4,
                              left: 4,
                              right: 4,
                              opacity: previewVideoHovered ? 1 : 0,
                              transition: 'opacity 0.2s',
                              bgcolor: 'rgba(0,0,0,0.6)',
                              borderRadius: 1,
                              px: 0.75,
                              py: 0.4,
                              pointerEvents: previewVideoHovered ? 'auto' : 'none',
                            }}
                          >
                            {/* Play/Pause */}
                            <IconButton
                              size="small"
                              sx={{ color: 'white', p: 0.25, flexShrink: 0 }}
                              onClick={() => {
                                const v = previewVideoRef.current;
                                if (!v) return;
                                if (v.paused) {
                                  v.play();
                                  setPreviewVideoPaused(false);
                                } else {
                                  v.pause();
                                  setPreviewVideoPaused(true);
                                }
                              }}
                            >
                              {previewVideoPaused ? <PlayIcon sx={{ fontSize: 16 }} /> : <PauseIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                            {/* Time */}
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.6rem', flexShrink: 0 }}>
                              {formatTime(previewVideoTime)}
                            </Typography>
                            {/* Seek */}
                            <Slider
                              size="small"
                              min={0}
                              max={previewVideoDuration || 100}
                              value={previewVideoTime}
                              onChange={(_, v) => {
                                const vid = previewVideoRef.current;
                                if (vid) vid.currentTime = v as number;
                                setPreviewVideoTime(v as number);
                              }}
                              sx={{ flex: 1, color: 'white', '& .MuiSlider-thumb': { width: 10, height: 10 } }}
                            />
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.6rem', flexShrink: 0 }}>
                              {formatTime(previewVideoDuration)}
                            </Typography>
                            {/* Mute */}
                            <IconButton
                              size="small"
                              sx={{ color: 'white', p: 0.25, flexShrink: 0 }}
                              onClick={() => {
                                setPreviewVideoMuted((m) => {
                                  const next = !m;
                                  const vid = previewVideoRef.current;
                                  if (next) {
                                    // Muting: set volume to 0 so the slider reflects muted state
                                    setPreviewVideoVolume(0);
                                    if (vid) {
                                      vid.volume = 0;
                                      vid.muted = true;
                                    }
                                  } else {
                                    // Unmuting: clear muted flag; do not change volume here
                                    if (vid) vid.muted = false;
                                  }
                                  return next;
                                });
                              }}
                            >
                              {previewVideoMuted ? <VolumeOffIcon sx={{ fontSize: 16 }} /> : <VolumeUpIcon sx={{ fontSize: 16 }} />}
                            </IconButton>
                            {/* Volume */}
                            <Slider
                              size="small"
                              min={0}
                              max={1}
                              step={0.05}
                              value={previewVideoMuted ? 0 : previewVideoVolume}
                              onChange={(_, v) => {
                                const vol = v as number;
                                setPreviewVideoVolume(vol);
                                setPreviewVideoMuted(vol === 0);
                                const vid = previewVideoRef.current;
                                if (vid) {
                                  vid.volume = vol;
                                  vid.muted = vol === 0;
                                }
                              }}
                              sx={{ width: 50, color: 'white', '& .MuiSlider-thumb': { width: 10, height: 10 } }}
                            />
                          </Stack>
                        </Box>
                      );
                    })()}
                  <Stack
                    alignItems="center"
                    justifyContent={
                      resolvedPreview.verticalAlign === 'top'
                        ? 'flex-start'
                        : resolvedPreview.verticalAlign === 'bottom'
                          ? 'flex-end'
                          : 'center'
                    }
                    sx={{
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      zIndex: 2,
                      padding: previewPadding || 0,
                      boxSizing: 'border-box',
                      pointerEvents: 'none',
                    }}
                  >
                    <Typography sx={{ ...previewTextCss, fontSize: `calc(${previewTextCss.fontSize || '4vh'} * 0.45)` }}>
                      Amazing Grace
                    </Typography>
                    <Typography sx={{ ...previewTextCss, fontSize: `calc(${previewTextCss.fontSize || '4vh'} * 0.45)`, opacity: 0.7 }}>
                      How sweet the sound
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            )}
          </Box>

          {/* Footer actions */}
          <Stack direction="row" spacing={2} sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={!isDirty && selectedStyleId !== 'new'}>
              {selectedStyleId === 'new' ? LL.STYLE.CREATE() : LL.COMMON.SAVE()}
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={<ApplyIcon />}
              onClick={async () => {
                const id = await handleSave();
                if (id != null) setStatusMessage(LL.STYLE.APPLIED());
              }}
              disabled={!isDirty && selectedStyleId !== 'new'}
            >
              {LL.STYLE.SAVE_AND_APPLY()}
            </Button>
            <Box flexGrow={1} />
            <Button variant="outlined" onClick={onClose}>
              {LL.COMMON.CANCEL()}
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    </>
  );
};
