import { useState, useEffect, useMemo, useRef, useContext, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Popover,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  FolderOpen as FolderOpenIcon,
  RestartAlt as ResetIcon,
  Edit as EditIcon,
  BrokenImage as BrokenImageIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { FontPicker } from '@/components/style/FontPicker';
import { WEB_SAFE_FONTS } from '@/utils/styleUtils';
import { resolveMediaUrl, probeMediaUrl, type MediaProbeStatus, invalidateMediaProbe } from '@/utils/mediaUrl';
import { StyleInheritanceContext, type InheritedSource } from '@/components/style/styleFormContext';
import type { StyleData } from '@/api/styles.api';

/**
 * The building blocks every style form is made of: the cascade-aware property row, the
 * panels that group rows, and the two composite controls (media path, font family) that
 * more than one section needs.
 */

/** Values that read better than `String(value)` on their own. */
const formatInheritedValue = (value: unknown): string => {
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value)) return value.join(', ');
  if (value === '' || value === undefined || value === null) return '—';
  return String(value);
};

const isColourValue = (value: unknown): value is string =>
  typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(value.trim());

/**
 * What a property resolves to when this style leaves it alone, and which level supplies it.
 *
 * Sources arrive in cascade order, so the last one wins — it is marked rather than being the
 * only one shown, because seeing that the app default is being overridden by the global style
 * is the part that is otherwise invisible.
 */
const InheritedValuePopover = ({
  anchorEl,
  onClose,
  label,
  sources,
  onOverride,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  label: string;
  sources: InheritedSource[];
  onOverride: () => void;
}) => {
  const { LL } = useI18nContext();
  const effective = sources.length - 1;

  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <Stack spacing={1} sx={{ p: 1.5, minWidth: 240, maxWidth: 340 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
          {label}
        </Typography>

        {sources.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {LL.STYLE.INHERITED_NOWHERE()}
          </Typography>
        )}

        {sources.map((entry, index) => (
          <Stack key={entry.source} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', flexGrow: 1, minWidth: 0 }}>
              {entry.source}
            </Typography>
            {isColourValue(entry.value) && (
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: 0.5,
                  bgcolor: entry.value,
                  border: '1px solid',
                  borderColor: 'divider',
                  flexShrink: 0,
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{
                fontFamily: 'monospace',
                // The winning level is the one that actually shows; the rest are context.
                color: index === effective ? 'text.primary' : 'text.disabled',
                fontWeight: index === effective ? 600 : 400,
                textDecoration: index === effective ? 'none' : 'line-through',
              }}
            >
              {formatInheritedValue(entry.value)}
            </Typography>
          </Stack>
        ))}

        {/* A show or item style sits below both of these at presentation time, and the editor
            cannot know which shows this style will be used by. Better to say so than to imply
            the list is exhaustive. */}
        <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1.4 }}>
          {LL.STYLE.INHERITED_CAVEAT()}
        </Typography>

        <Button size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 16 }} />} onClick={onOverride}>
          {LL.STYLE.INHERITED_OVERRIDE()}
        </Button>
      </Stack>
    </Popover>
  );
};

/**
 * Property row for cascade-overridable style props. No per-row switch:
 * - set here → label | control (right-aligned; `block` = own line) | subtle reset icon
 * - inherited → label | "Inherited" caption + edit (pencil) button to override here
 * `plainSwitch` keeps a real switch for genuine on/off settings (not cascade overrides).
 */
export const StylePropRow = ({
  label,
  enabled,
  onToggle,
  children,
  block = false,
  plainSwitch = false,
  propKeys,
  inherited,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: ReactNode;
  block?: boolean;
  plainSwitch?: boolean;
  /**
   * Which style properties this row controls. Given these, the "Inherited" caption becomes a
   * button that shows what is actually applied — otherwise the only way to find out was to
   * override the value, look, and undo.
   */
  propKeys?: (keyof StyleData)[];
  /**
   * Where this row's value comes from, when the cascade cannot answer it.
   *
   * Language-slot rows are not cascade properties — they inherit from the main slot rather than
   * from a parent style — so they supply their own chain instead of going through the context.
   */
  inherited?: InheritedSource[];
}) => {
  const { LL } = useI18nContext();
  const inheritedFromCascade = useContext(StyleInheritanceContext);
  const [inheritedAnchor, setInheritedAnchor] = useState<HTMLElement | null>(null);
  const sources = inherited ?? (propKeys && inheritedFromCascade ? inheritedFromCascade(propKeys) : []);
  // Offered whenever the row knows what it controls. It used to need a non-empty chain, which
  // meant the many properties with no app default were simply not clickable — indistinguishable
  // from the feature being broken.
  const canExplain = !!inherited || !!propKeys;

  return (
    <Box sx={{ py: 0.25, px: 1, borderRadius: 1, '&:hover': { bgcolor: 'action.hover' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minHeight: 38 }}>
        {plainSwitch && <Switch size="small" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />}
        <Typography
          variant="body2"
          onClick={() => onToggle(!enabled)}
          sx={{ fontWeight: 500, opacity: enabled ? 1 : 0.6, cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
        >
          {label}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {enabled && !block && <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', minWidth: 0 }}>{children}</Box>}
        {!plainSwitch && enabled && (
          <Tooltip title={LL.STYLE.RESET_TO_INHERITED()}>
            <IconButton size="small" onClick={() => onToggle(false)} sx={{ ml: 0.5, opacity: 0.35, '&:hover': { opacity: 1 } }}>
              <ResetIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
        {!plainSwitch && !enabled && (
          <>
            {canExplain ? (
              <Tooltip title={LL.STYLE.INHERITED_SHOW()}>
                <Typography
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={(event) => setInheritedAnchor(event.currentTarget)}
                  sx={{
                    color: 'text.disabled',
                    background: 'none',
                    border: 'none',
                    p: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline dotted',
                    textUnderlineOffset: 3,
                    font: 'inherit',
                    '&:hover': { color: 'text.secondary' },
                  }}
                >
                  {LL.STYLE.INHERITED()}
                </Typography>
              </Tooltip>
            ) : (
              <Typography variant="caption" sx={{ color: 'text.disabled', userSelect: 'none' }}>
                {LL.STYLE.INHERITED()}
              </Typography>
            )}
            <Tooltip title={LL.COMMON.EDIT()}>
              <IconButton size="small" onClick={() => onToggle(true)} sx={{ ml: 0.5 }}>
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <InheritedValuePopover
              anchorEl={inheritedAnchor}
              onClose={() => setInheritedAnchor(null)}
              label={label}
              sources={sources}
              onOverride={() => {
                setInheritedAnchor(null);
                onToggle(true);
              }}
            />
          </>
        )}
        {plainSwitch && !block && !enabled && <Box sx={{ opacity: 0.4, pointerEvents: 'none' }}>{children}</Box>}
      </Stack>
      {block && enabled && <Box sx={{ pl: 0.5, pb: 0.75 }}>{children}</Box>}
    </Box>
  );
};

/** Indented wrap-row for sub-controls that belong to the row above (image/video options). */
export const SubControlsRow = ({ children }: { children: ReactNode }) => (
  <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', pl: 2, py: 0.5, rowGap: 1 }}>
    {children}
  </Stack>
);

/** Flat paper panel grouping related properties — matches the Song Editor's panel look. */
export const PropCard = ({
  title,
  action,
  span = false,
  dimmed = false,
  children,
}: {
  title?: string;
  /** Controls pinned to the right of the heading (visibility, remove). */
  action?: ReactNode;
  span?: boolean;
  /** Fades the body while keeping it usable — for a section that is switched off. */
  dimmed?: boolean;
  children: ReactNode;
}) => (
  <Stack
    spacing={0.25}
    sx={{
      borderRadius: 1,
      p: '10px 15px',
      minWidth: 0,
      gridColumn: span ? '1 / -1' : undefined,
      bgcolor: 'background.paper',
    }}
  >
    {(title || action) && (
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 0.5 }}>
        {title && (
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1.6, flexGrow: 1, minWidth: 0 }}>
            {title}
          </Typography>
        )}
        {action}
      </Stack>
    )}
    <Box sx={{ opacity: dimmed ? 0.5 : 1 }}>{children}</Box>
  </Stack>
);

/** Single-column stack of property cards — the form column is narrow next to the large preview. */
export const CardGrid = ({ children }: { children: ReactNode }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1.5, alignItems: 'start' }}>{children}</Box>
);

/** Media path row: switch | label on top, thumb + path input + browse on its own line. */
export const MediaPropRow = ({
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
}) => {
  const { LL } = useI18nContext();
  return (
    <StylePropRow label={label} enabled={enabled} onToggle={onToggle} block>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        {value && <MediaThumb url={value} type={thumbType} />}
        <TextField
          size="small"
          fullWidth
          placeholder={LL.STYLE.MEDIA_PATH_PLACEHOLDER()}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          sx={{ flex: 1 }}
        />
        <Tooltip title={LL.STYLE.BROWSE()}>
          <IconButton onClick={onBrowse} size="small">
            <FolderOpenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </StylePropRow>
  );
};

/** Small media thumbnail shown next to URL fields. Surfaces three explicit
 *  states so the user knows whether the file is loading, missing, or whether
 *  the local media server itself isn't running. */
export const MediaThumb = ({ url, type }: { url: string; type: 'image' | 'video' }) => {
  const { LL } = useI18nContext();
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
      <Tooltip title={LL.STYLE.MEDIA_NOT_FOUND()}>
        <Box sx={boxSx}>
          <BrokenImageIcon sx={{ fontSize: 16 }} />
        </Box>
      </Tooltip>
    );
  }
  if (status === 'server_down') {
    return (
      <Tooltip title={LL.STYLE.MEDIA_SERVER_DOWN()}>
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
export const FontFamilyEditor = ({
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
  const { LL } = useI18nContext();
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
        <Stack
          direction="row"
          sx={{
            flexWrap: 'wrap',
            gap: 0.5,
          }}
        >
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
          renderInput={(params) => <TextField {...params} placeholder={LL.STYLE.ADD_FALLBACK_FONT()} size="small" />}
        />
        <IconButton size="small" onClick={handleAdd} disabled={!newFont.trim()} color="primary">
          <AddIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
};
