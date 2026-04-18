import { useState, useEffect, useMemo, useCallback, ReactNode, type ElementType } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
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
  BlockOutlined as NoneIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  NorthWest as NWIcon,
  North as NIcon,
  NorthEast as NEIcon,
  West as WIcon,
  OpenWith as CenterIcon,
  East as EIcon,
  SouthWest as SWIcon,
  South as SIcon,
  SouthEast as SEIcon,
  Code as CodeIcon,
  ZoomIn as ZoomInIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import {
  useGetStylesQuery,
  useCreateStyleMutation,
  useUpdateStyleMutation,
  useDeleteStyleMutation,
  type StyleData,
  type StyleEntity,
} from '@/api/styles.api';
import { DEFAULT_STYLE, mergeStyles, resolveStyleData, styleToContainerCss, styleToTextCss, buildFontFamily } from '@/utils/styleUtils';
import { FontPicker } from '@/components/FontPicker';
import { ColorSwatchButton } from '@/components/ColorPicker';
import { MediaBrowser } from '@/components/MediaBrowser';
import { WEB_SAFE_FONTS } from '@/utils/styleUtils';

type BackgroundMode = 'none' | 'color' | 'image' | 'video';

/** Helper: toggle-enabled property row. */
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

/** Resolve a relative path to absolute media server URL for previews */
const resolvePreviewUrl = (path: string): string => {
  if (!path) return path;
  if (path.startsWith('http') || path.startsWith('file') || path.startsWith('/')) return path;
  return `http://localhost:9100/${path.split('/').map(encodeURIComponent).join('/')}`;
};

/** Small media thumbnail shown next to URL fields */
const MediaThumb = ({ url, type }: { url: string; type: 'image' | 'video' }) => {
  const resolved = resolvePreviewUrl(url);
  if (!url) return null;
  return type === 'image' ? (
    <Box
      component="img"
      src={resolved}
      sx={{ width: 48, height: 28, objectFit: 'cover', borderRadius: 0.5, border: '1px solid', borderColor: 'divider', flexShrink: 0 }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
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

/** Background position picker — 3×3 directional arrow grid */
const PositionPicker = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const cells: { pos: string; Icon: ElementType }[] = [
    { pos: 'top left', Icon: NWIcon },
    { pos: 'top center', Icon: NIcon },
    { pos: 'top right', Icon: NEIcon },
    { pos: 'center left', Icon: WIcon },
    { pos: 'center', Icon: CenterIcon },
    { pos: 'center right', Icon: EIcon },
    { pos: 'bottom left', Icon: SWIcon },
    { pos: 'bottom center', Icon: SIcon },
    { pos: 'bottom right', Icon: SEIcon },
  ];
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 0.3 }}>
      {cells.map(({ pos, Icon }) => (
        <Tooltip key={pos} title={pos}>
          <Box
            onClick={() => onChange(pos)}
            sx={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 0.5,
              cursor: 'pointer',
              bgcolor: value === pos ? 'primary.main' : 'action.hover',
              color: value === pos ? 'primary.contrastText' : 'text.secondary',
              '&:hover': { bgcolor: value === pos ? 'primary.dark' : 'action.selected' },
            }}
          >
            <Icon sx={{ fontSize: 16 }} />
          </Box>
        </Tooltip>
      ))}
    </Box>
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
  fontFamily: { enabled: true, value: 'Arial' },
  fontColor: { enabled: true, value: '#FFFFFF' },
  fontSize: { enabled: true, value: '4vh' },
  lineHeight: { enabled: true, value: '1.4' },
  textAlign: { enabled: true, value: 'center' },
  padding: { enabled: true, value: '5% 10%' },
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
  if (r.opacity !== undefined) containerLines.push(`  opacity: ${r.opacity};`);

  if (r.fontFamily || r.fontFallback) textLines.push(`  font-family: ${buildFontFamily(r.fontFamily, r.fontFallback)};`);
  if (r.fontColor) textLines.push(`  color: ${r.fontColor};`);
  if (r.fontSize) textLines.push(`  font-size: ${r.fontSize};`);
  if (r.fontBold) textLines.push(`  font-weight: bold;`);
  if (r.fontItalic) textLines.push(`  font-style: italic;`);
  if (r.fontUnderline) textLines.push(`  text-decoration: underline;`);
  if (r.lineHeight) textLines.push(`  line-height: ${r.lineHeight};`);
  if (r.letterSpacing) textLines.push(`  letter-spacing: ${r.letterSpacing};`);
  if (r.textTransform && r.textTransform !== 'none') textLines.push(`  text-transform: ${r.textTransform};`);
  if (r.textAlign) textLines.push(`  text-align: ${r.textAlign};`);
  if (r.textShadow) textLines.push(`  text-shadow: ${r.textShadow} ${r.textShadowColor || 'rgba(0,0,0,0.5)'};`);
  if (r.textStroke) textLines.push(`  -webkit-text-stroke: ${r.textStroke};`);

  const parts: string[] = [];
  if (containerLines.length) parts.push(`.presentation {\n${containerLines.join('\n')}\n}`);
  if (textLines.length) parts.push(`.presentation-line {\n${textLines.join('\n')}\n}`);
  return parts.join('\n\n');
};

interface StyleEditorProps {
  open: boolean;
  onClose: () => void;
  editStyleId?: number;
}

type WindowOverride = { window_name: string; override_style_id: number };

export const StyleEditor = ({ open, onClose, editStyleId }: StyleEditorProps) => {
  const { LL } = useI18nContext();
  const { data: styles = [] } = useGetStylesQuery();
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
      if (styles.length > 0) {
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
    fontFamily: 'Arial',
    fontFallback: [],
    fontColor: '#FFFFFF',
    fontSize: '4vh',
    fontBold: false,
    fontItalic: false,
    fontUnderline: false,
    textAlign: 'center',
    verticalAlign: 'center',
    textTransform: 'none',
    textShadow: '2px 2px 4px',
    textShadowColor: '#000000',
    textStroke: '1px black',
    lineHeight: '1.4',
    letterSpacing: '0px',
    padding: '5% 10%',
    opacity: 1,
    nextLinePreviewColor: '#AAAAAA',
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

  // Derive the current background media mode (image/video/none — color is independent)
  const bgMode: BackgroundMode = useMemo(() => {
    if (getProp<string>('backgroundImage').enabled) return 'image';
    if (getProp<string>('backgroundVideo').enabled) return 'video';
    return 'none';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleData]);

  const handleBgModeChange = useCallback((mode: BackgroundMode) => {
    setStyleData((prev) => ({
      ...prev,
      // Only toggle image/video exclusive of each other; color is always independent
      backgroundImage: { ...(prev.backgroundImage || { value: '' }), enabled: mode === 'image' } as StyleData['backgroundImage'],
      backgroundVideo: { ...(prev.backgroundVideo || { value: '' }), enabled: mode === 'video' } as StyleData['backgroundVideo'],
    }));
    setIsDirty(true);
  }, []);

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
        if (windowOverrides.length > 0) await updateStyleMutation({ id, windowOverrides } as never).unwrap();
      } else {
        id = selectedStyleId;
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

          {/* Style selector */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>{LL.STYLE.STYLE()}</InputLabel>
              <Select
                value={selectedStyleId}
                label={LL.STYLE.STYLE()}
                onChange={(e) => handleStyleSelect(e.target.value as number | 'new')}
              >
                <MenuItem value="new">
                  <em>+ {LL.STYLE.NEW()}</em>
                </MenuItem>
                {styles.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedStyleId !== 'new' && (
              <>
                <Tooltip title={LL.STYLE.DUPLICATE()}>
                  <IconButton size="small" onClick={handleDuplicate}>
                    <DuplicateIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.COMMON.DELETE()}>
                  <IconButton size="small" color="error" onClick={handleDelete}>
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Stack>

          {/* Scrollable form */}
          <Stack sx={{ flex: 1, overflow: 'auto', p: 2 }} spacing={1}>
            <Section title={LL.STYLE.SECTION_GENERAL()}>
              <TextField
                label={LL.STYLE.NAME()}
                value={styleName}
                onChange={(e) => {
                  setStyleName(e.target.value);
                  setIsDirty(true);
                }}
                size="small"
                fullWidth
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={styleEnabled}
                    onChange={(e) => {
                      setStyleEnabled(e.target.checked);
                      setIsDirty(true);
                    }}
                  />
                }
                label={LL.STYLE.ENABLED()}
              />
            </Section>

            <Section title={LL.STYLE.SECTION_BACKGROUND()}>
              {/* Background color — always available as a base layer */}
              <StylePropRow
                label={LL.STYLE.BACKGROUND_COLOR()}
                enabled={getProp<string>('backgroundColor').enabled}
                onToggle={(e) => togglePropEnabled('backgroundColor', e)}
              >
                <ColorSwatchButton
                  value={getProp<string>('backgroundColor').value || '#000000'}
                  onChange={(c) => updateProp('backgroundColor', { enabled: true, value: c })}
                />
              </StylePropRow>

              {/* Image / Video mode selector */}
              <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                <Typography variant="body2" sx={{ minWidth: 130, fontWeight: 500 }}>
                  {LL.STYLE.BACKGROUND_IMAGE()} / Video
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={bgMode}
                  onChange={(_, val) => val && handleBgModeChange(val as BackgroundMode)}
                >
                  <Tooltip title="None">
                    <ToggleButton value="none">
                      <NoneIcon fontSize="small" />
                    </ToggleButton>
                  </Tooltip>
                  <Tooltip title={LL.STYLE.BACKGROUND_IMAGE()}>
                    <ToggleButton value="image">
                      <ImageIcon fontSize="small" />
                    </ToggleButton>
                  </Tooltip>
                  <Tooltip title={LL.STYLE.BACKGROUND_VIDEO()}>
                    <ToggleButton value="video">
                      <VideoIcon fontSize="small" />
                    </ToggleButton>
                  </Tooltip>
                </ToggleButtonGroup>
              </Stack>

              {bgMode === 'image' && (
                <Stack spacing={1} sx={{ pl: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {bgImageVal && <MediaThumb url={bgImageVal} type="image" />}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="https:// or relative path"
                      value={bgImageVal}
                      onChange={(e) => updateProp('backgroundImage', { enabled: true, value: e.target.value })}
                    />
                    <Tooltip title={LL.STYLE.BROWSE()}>
                      <IconButton onClick={handlePickImage} size="small">
                        <FolderOpenIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {LL.STYLE.BG_FIT()}
                      </Typography>
                      <Select
                        size="small"
                        value={getProp<string>('backgroundSize').value || 'cover'}
                        onChange={(e) => updateProp('backgroundSize', { enabled: true, value: e.target.value as never })}
                        sx={{ width: 150 }}
                      >
                        <MenuItem value="cover">Cover (fill)</MenuItem>
                        <MenuItem value="contain">Contain (fit)</MenuItem>
                        <MenuItem value="100% auto">Fit Width</MenuItem>
                        <MenuItem value="auto 100%">Fit Height</MenuItem>
                        <MenuItem value="auto">Original</MenuItem>
                      </Select>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {LL.STYLE.BG_POSITION()}
                      </Typography>
                      <PositionPicker
                        value={getProp<string>('backgroundPosition').value || 'center'}
                        onChange={(v) => updateProp('backgroundPosition', { enabled: true, value: v })}
                      />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                      <Typography variant="caption" color="text.secondary">
                        Zoom ({getProp<number>('backgroundZoom').value || 100}%)
                      </Typography>
                      <Slider
                        min={100}
                        max={200}
                        step={5}
                        value={getProp<number>('backgroundZoom').value || 100}
                        onChange={(_, val) => updateProp('backgroundZoom', { enabled: true, value: val as number })}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => `${v}%`}
                        sx={{ width: 150 }}
                      />
                    </Stack>
                  </Stack>
                </Stack>
              )}

              {bgMode === 'video' && (
                <Stack spacing={1} sx={{ pl: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {bgVideoVal && <MediaThumb url={bgVideoVal} type="video" />}
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="https:// or relative path"
                      value={bgVideoVal}
                      onChange={(e) => updateProp('backgroundVideo', { enabled: true, value: e.target.value })}
                    />
                    <Tooltip title={LL.STYLE.BROWSE()}>
                      <IconButton onClick={handlePickVideo} size="small">
                        <FolderOpenIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={getProp<boolean>('backgroundVideoAutoplay').enabled ? getProp<boolean>('backgroundVideoAutoplay').value !== false : true}
                        onChange={(e) => updateProp('backgroundVideoAutoplay', { enabled: true, value: e.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">{LL.VIDEO.AUTOPLAY()}</Typography>}
                  />
                  <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {LL.STYLE.BG_FIT()}
                      </Typography>
                      <Select
                        size="small"
                        value={getProp<string>('backgroundSize').value || 'cover'}
                        onChange={(e) => updateProp('backgroundSize', { enabled: true, value: e.target.value as never })}
                        sx={{ width: 150 }}
                      >
                        <MenuItem value="cover">Cover (fill)</MenuItem>
                        <MenuItem value="contain">Contain (fit)</MenuItem>
                        <MenuItem value="100% auto">Fit Width</MenuItem>
                        <MenuItem value="auto 100%">Fit Height</MenuItem>
                        <MenuItem value="auto">Original</MenuItem>
                      </Select>
                    </Stack>
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {LL.STYLE.BG_POSITION()}
                      </Typography>
                      <PositionPicker
                        value={getProp<string>('backgroundPosition').value || 'center'}
                        onChange={(v) => updateProp('backgroundPosition', { enabled: true, value: v })}
                      />
                    </Stack>
                    <Stack spacing={0.5} sx={{ minWidth: 160 }}>
                      <Typography variant="caption" color="text.secondary">
                        Zoom ({getProp<number>('backgroundZoom').value || 100}%)
                      </Typography>
                      <Slider
                        min={100}
                        max={200}
                        step={5}
                        value={getProp<number>('backgroundZoom').value || 100}
                        onChange={(_, val) => updateProp('backgroundZoom', { enabled: true, value: val as number })}
                        valueLabelDisplay="auto"
                        valueLabelFormat={(v) => `${v}%`}
                        sx={{ width: 150 }}
                      />
                    </Stack>
                  </Stack>
                </Stack>
              )}
            </Section>

            <Section title={LL.STYLE.SECTION_TYPOGRAPHY()}>
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
                label={LL.STYLE.FONT_COLOR()}
                enabled={getProp<string>('fontColor').enabled}
                onToggle={(e) => togglePropEnabled('fontColor', e)}
              >
                <ColorSwatchButton
                  value={getProp<string>('fontColor').value || '#FFFFFF'}
                  onChange={(c) => updateProp('fontColor', { enabled: true, value: c })}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.FONT_SIZE()}
                enabled={getProp<string>('fontSize').enabled}
                onToggle={(e) => togglePropEnabled('fontSize', e)}
              >
                <TextField
                  size="small"
                  value={getProp<string>('fontSize').value || '4vh'}
                  onChange={(e) => updateProp('fontSize', { enabled: true, value: e.target.value })}
                  sx={{ width: 120 }}
                  placeholder="4vh"
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.FONT_BOLD_ITALIC()}
                enabled={
                  getProp<boolean>('fontBold').enabled ||
                  getProp<boolean>('fontItalic').enabled ||
                  getProp<boolean>('fontUnderline').enabled
                }
                onToggle={(e) => {
                  togglePropEnabled('fontBold', e);
                  togglePropEnabled('fontItalic', e);
                  togglePropEnabled('fontUnderline', e);
                }}
              >
                <ToggleButtonGroup size="small">
                  <ToggleButton
                    value="bold"
                    selected={getProp<boolean>('fontBold').value}
                    onClick={() => updateProp('fontBold', { enabled: true, value: !getProp<boolean>('fontBold').value })}
                  >
                    <BoldIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="italic"
                    selected={getProp<boolean>('fontItalic').value}
                    onClick={() => updateProp('fontItalic', { enabled: true, value: !getProp<boolean>('fontItalic').value })}
                  >
                    <ItalicIcon />
                  </ToggleButton>
                  <ToggleButton
                    value="underline"
                    selected={getProp<boolean>('fontUnderline').value}
                    onClick={() => updateProp('fontUnderline', { enabled: true, value: !getProp<boolean>('fontUnderline').value })}
                  >
                    <UnderlineIcon />
                  </ToggleButton>
                </ToggleButtonGroup>
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
                label={LL.STYLE.TEXT_SHADOW()}
                enabled={getProp<string>('textShadow').enabled}
                onToggle={(e) => togglePropEnabled('textShadow', e)}
              >
                <TextField
                  size="small"
                  value={getProp<string>('textShadow').value || '2px 2px 4px'}
                  onChange={(e) => updateProp('textShadow', { enabled: true, value: e.target.value })}
                  placeholder="2px 2px 4px"
                  sx={{ width: 180 }}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.SHADOW_COLOR()}
                enabled={getProp<string>('textShadowColor').enabled}
                onToggle={(e) => togglePropEnabled('textShadowColor', e)}
              >
                <ColorSwatchButton
                  value={getProp<string>('textShadowColor').value || '#000000'}
                  onChange={(c) => updateProp('textShadowColor', { enabled: true, value: c })}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.TEXT_STROKE()}
                enabled={getProp<string>('textStroke').enabled}
                onToggle={(e) => togglePropEnabled('textStroke', e)}
              >
                <TextField
                  size="small"
                  value={getProp<string>('textStroke').value || '1px black'}
                  onChange={(e) => updateProp('textStroke', { enabled: true, value: e.target.value })}
                  placeholder="1px black"
                  sx={{ width: 180 }}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.OPACITY()}
                enabled={getProp<number>('opacity').enabled}
                onToggle={(e) => togglePropEnabled('opacity', e)}
              >
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={getProp<number>('opacity').value ?? 1}
                  onChange={(_, val) => updateProp('opacity', { enabled: true, value: val as number })}
                  valueLabelDisplay="auto"
                  sx={{ width: 200 }}
                />
              </StylePropRow>
            </Section>

            <Section title={LL.STYLE.SECTION_LAYOUT()}>
              <StylePropRow
                label={LL.STYLE.LINE_HEIGHT()}
                enabled={getProp<string>('lineHeight').enabled}
                onToggle={(e) => togglePropEnabled('lineHeight', e)}
              >
                <TextField
                  size="small"
                  value={getProp<string>('lineHeight').value || '1.4'}
                  onChange={(e) => updateProp('lineHeight', { enabled: true, value: e.target.value })}
                  sx={{ width: 100 }}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.LETTER_SPACING()}
                enabled={getProp<string>('letterSpacing').enabled}
                onToggle={(e) => togglePropEnabled('letterSpacing', e)}
              >
                <TextField
                  size="small"
                  value={getProp<string>('letterSpacing').value || '0px'}
                  onChange={(e) => updateProp('letterSpacing', { enabled: true, value: e.target.value })}
                  sx={{ width: 100 }}
                />
              </StylePropRow>
              <StylePropRow
                label={LL.STYLE.PADDING()}
                enabled={getProp<string>('padding').enabled}
                onToggle={(e) => togglePropEnabled('padding', e)}
              >
                <TextField
                  size="small"
                  fullWidth
                  value={getProp<string>('padding').value || '5% 10%'}
                  onChange={(e) => updateProp('padding', { enabled: true, value: e.target.value })}
                  placeholder="5% 10%"
                />
              </StylePropRow>
            </Section>

            <Section title={LL.STYLE.SECTION_VISIBILITY()} defaultExpanded={false}>
              <FormControlLabel
                control={
                  <Switch
                    checked={styleData.hideText || false}
                    onChange={(e) => {
                      setStyleData((prev) => ({ ...prev, hideText: e.target.checked }));
                      setIsDirty(true);
                    }}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    {styleData.hideText ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    <Typography variant="body2">{LL.STYLE.HIDE_TEXT()}</Typography>
                  </Stack>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={styleData.hideBackground || false}
                    onChange={(e) => {
                      setStyleData((prev) => ({ ...prev, hideBackground: e.target.checked }));
                      setIsDirty(true);
                    }}
                  />
                }
                label={
                  <Stack direction="row" spacing={1} alignItems="center">
                    {styleData.hideBackground ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    <Typography variant="body2">{LL.STYLE.HIDE_BACKGROUND()}</Typography>
                  </Stack>
                }
              />
            </Section>

            <Section title={LL.STYLE.SECTION_CUSTOM_CSS()} defaultExpanded={false}>
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
          <Accordion
            defaultExpanded={false}
            disableGutters
            elevation={0}
            sx={{ borderTop: 1, borderColor: 'divider', '&:before': { display: 'none' }, flexShrink: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandLessIcon />} sx={{ px: 2, background: (t) => t.palette.action.hover }}>
              <Typography variant="subtitle2" fontWeight={700}>
                Preview — {styleName}
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: '20%', py: 1 }}>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/9',
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: 1,
                  borderColor: 'divider',
                  ...previewContainerCss,
                }}
              >
                {resolvedPreview.backgroundVideo && (
                  <video
                    src={resolvePreviewUrl(resolvedPreview.backgroundVideo)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: resolvedPreview.backgroundSize === 'contain' ? 'contain' : 'cover',
                    }}
                  />
                )}
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
                    zIndex: 1,
                    padding: previewContainerCss.padding || 0,
                    boxSizing: 'border-box',
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
            </AccordionDetails>
          </Accordion>

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
