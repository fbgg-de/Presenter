import { useState, useEffect, useMemo, ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
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
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  FormatBold as BoldIcon,
  FormatItalic as ItalicIcon,
  FormatUnderlined as UnderlineIcon,
  FormatAlignLeft as AlignLeftIcon,
  FormatAlignCenter as AlignCenterIcon,
  FormatAlignRight as AlignRightIcon,
  FormatAlignJustify as AlignJustifyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Code as CodeIcon,
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
import { DEFAULT_STYLE, mergeStyles, resolveStyleData, styleToContainerCss, styleToTextCss } from '@/utils/styleUtils';
import { FontPicker, FontFallbackEditor } from '@/components/FontPicker';

/**
 * Helper component: toggle-enabled property row.
 * Shows a switch (enabled), label, and the editor content.
 */
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
}) => {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
      <Switch size="small" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
      <Typography variant="body2" sx={{ minWidth: 120, fontWeight: 500, opacity: enabled ? 1 : 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, opacity: enabled ? 1 : 0.3, pointerEvents: enabled ? 'auto' : 'none' }}>{children}</Box>
    </Stack>
  );
};

/**
 * Create a new empty StyleData object.
 */
const createEmptyStyleData = (): StyleData => {
  return {
    backgroundColor: { enabled: true, value: '#000000' },
    fontFamily: { enabled: true, value: 'Arial' },
    fontColor: { enabled: true, value: '#FFFFFF' },
    fontSize: { enabled: true, value: '4vh' },
    lineHeight: { enabled: true, value: '1.4' },
    textAlign: { enabled: true, value: 'center' },
    padding: { enabled: true, value: '5% 10%' },
  };
};

interface StyleEditorProps {
  open: boolean;
  onClose: () => void;
  /** ID of a style to load for editing. If undefined, shows the selector. */
  editStyleId?: number;
}

export const StyleEditor = ({ open, onClose, editStyleId }: StyleEditorProps) => {
  const { LL } = useI18nContext();
  const { data: styles = [] } = useGetStylesQuery();
  const [createStyleMutation] = useCreateStyleMutation();
  const [updateStyleMutation] = useUpdateStyleMutation();
  const [deleteStyleMutation] = useDeleteStyleMutation();

  // Editor state
  const [selectedStyleId, setSelectedStyleId] = useState<number | 'new'>('new');
  const [styleName, setStyleName] = useState<string>(LL.STYLE_NEW());
  const [styleEnabled, setStyleEnabled] = useState(true);
  const [styleData, setStyleData] = useState<StyleData>(createEmptyStyleData());
  const [isDirty, setIsDirty] = useState(false);
  const [showRawCss, setShowRawCss] = useState(false);

  // Load style when editStyleId changes
  useEffect(() => {
    if (open && editStyleId) {
      setSelectedStyleId(editStyleId);
      loadStyle(editStyleId);
    }
  }, [open, editStyleId]);

  // Reset when opening fresh
  useEffect(() => {
    if (open && !editStyleId) {
      if (styles.length > 0) {
        setSelectedStyleId(styles[0].id);
        loadStyleEntity(styles[0]);
      } else {
        setSelectedStyleId('new');
        setStyleName(LL.STYLE_NEW());
        setStyleData(createEmptyStyleData());
        setStyleEnabled(true);
      }
      setIsDirty(false);
    }
  }, [open]);

  const loadStyle = (id: number) => {
    const style = styles.find((s) => s.id === id);
    if (style) {
      loadStyleEntity(style);
    }
  };

  const loadStyleEntity = (style: StyleEntity) => {
    setStyleName(style.name);
    setStyleEnabled(style.enabled);
    setStyleData(style.data || createEmptyStyleData());
    setIsDirty(false);
  };

  const handleStyleSelect = (id: number | 'new') => {
    setSelectedStyleId(id);
    if (id === 'new') {
      setStyleName(LL.STYLE_NEW());
      setStyleData(createEmptyStyleData());
      setStyleEnabled(true);
      setIsDirty(false);
    } else {
      loadStyle(id);
    }
  };

  // Update a style property
  const updateProp = <K extends keyof StyleData>(key: K, value: StyleData[K]) => {
    setStyleData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  // Toggle enabled on a property
  const togglePropEnabled = (key: keyof StyleData, enabled: boolean) => {
    setStyleData((prev) => {
      const existing = prev[key];
      if (existing && typeof existing === 'object' && 'enabled' in existing) {
        return { ...prev, [key]: { ...existing, enabled } };
      }
      return prev;
    });
    setIsDirty(true);
  };

  // Get property value helper
  const getProp = <T,>(key: keyof StyleData): { enabled: boolean; value: T } => {
    const prop = styleData[key];
    if (prop && typeof prop === 'object' && 'enabled' in prop) {
      return prop as { enabled: boolean; value: T };
    }
    return { enabled: false, value: '' as unknown as T };
  };

  // Save handler
  const handleSave = async () => {
    try {
      if (selectedStyleId === 'new') {
        const result = await createStyleMutation({
          name: styleName,
          enabled: styleEnabled,
          data: styleData,
        }).unwrap();
        setSelectedStyleId(result.id);
      } else {
        await updateStyleMutation({
          id: selectedStyleId,
          name: styleName,
          enabled: styleEnabled,
          data: styleData,
        }).unwrap();
      }
      setIsDirty(false);
    } catch (error) {
      console.error('Failed to save style:', error);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (selectedStyleId !== 'new') {
      try {
        await deleteStyleMutation({ id: selectedStyleId }).unwrap();
        setSelectedStyleId('new');
        setStyleName(LL.STYLE_NEW());
        setStyleData(createEmptyStyleData());
        setIsDirty(false);
      } catch (error) {
        console.error('Failed to delete style:', error);
      }
    }
  };

  // Preview: resolve the style
  const resolvedPreview = useMemo(() => {
    const resolved = resolveStyleData(styleData);
    return mergeStyles(DEFAULT_STYLE, resolved);
  }, [styleData]);

  const previewContainerCss = useMemo(() => styleToContainerCss(resolvedPreview), [resolvedPreview]);
  const previewTextCss = useMemo(() => styleToTextCss(resolvedPreview), [resolvedPreview]);

  return (
    <Drawer open={open} anchor="right" onClose={onClose}>
      <Stack sx={{ width: 'min(90vw, 800px)', height: '100%' }}>
        {/* Header */}
        <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {LL.STYLE_EDITOR()}
          </Typography>
          {isDirty && <Chip label={LL.STYLE_UNSAVED()} size="small" color="warning" sx={{ ml: 1 }} />}
          <Box flexGrow={1} />
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Stack>

        <Stack sx={{ flex: 1, overflow: 'auto', p: 2 }} spacing={2}>
          {/* Style Selector */}
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Style</InputLabel>
              <Select value={selectedStyleId} label="Style" onChange={(e) => handleStyleSelect(e.target.value as number | 'new')}>
                <MenuItem value="new">
                  <em>+ {LL.STYLE_NEW()}</em>
                </MenuItem>
                {styles.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {selectedStyleId !== 'new' && (
              <IconButton size="small" color="error" onClick={handleDelete}>
                <DeleteIcon />
              </IconButton>
            )}
          </Stack>

          {/* Style Name */}
          <TextField
            label={LL.STYLE_NAME()}
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
            label={LL.STYLE_ENABLED()}
          />

          <Divider />

          {/* ── Background Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_BACKGROUND()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_BACKGROUND_COLOR()}
            enabled={getProp<string>('backgroundColor').enabled}
            onToggle={(e) => togglePropEnabled('backgroundColor', e)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <input
                type="color"
                value={getProp<string>('backgroundColor').value || '#000000'}
                onChange={(e) => updateProp('backgroundColor', { enabled: true, value: e.target.value })}
                style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
              />
              <TextField
                size="small"
                value={getProp<string>('backgroundColor').value || ''}
                onChange={(e) =>
                  updateProp('backgroundColor', { enabled: getProp<string>('backgroundColor').enabled, value: e.target.value })
                }
                sx={{ width: 120 }}
              />
            </Stack>
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_BACKGROUND_IMAGE()}
            enabled={getProp<string>('backgroundImage').enabled}
            onToggle={(e) => togglePropEnabled('backgroundImage', e)}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="https://example.com/bg.jpg"
              value={getProp<string>('backgroundImage').value || ''}
              onChange={(e) => updateProp('backgroundImage', { enabled: true, value: e.target.value })}
            />
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_BACKGROUND_VIDEO()}
            enabled={getProp<string>('backgroundVideo').enabled}
            onToggle={(e) => togglePropEnabled('backgroundVideo', e)}
          >
            <TextField
              size="small"
              fullWidth
              placeholder="https://example.com/bg.mp4"
              value={getProp<string>('backgroundVideo').value || ''}
              onChange={(e) => updateProp('backgroundVideo', { enabled: true, value: e.target.value })}
            />
          </StylePropRow>

          <Divider />

          {/* ── Font Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_FONT()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_FONT_FAMILY()}
            enabled={getProp<string>('fontFamily').enabled}
            onToggle={(e) => togglePropEnabled('fontFamily', e)}
          >
            <FontPicker
              value={getProp<string>('fontFamily').value || 'Arial'}
              onChange={(font) => updateProp('fontFamily', { enabled: true, value: font })}
            />
          </StylePropRow>

          <StylePropRow
            label="Font Fallback"
            enabled={getProp<string[]>('fontFallback').enabled}
            onToggle={(e) => togglePropEnabled('fontFallback', e)}
          >
            <FontFallbackEditor
              fallbacks={getProp<string[]>('fontFallback').value || []}
              onChange={(fallbacks) => updateProp('fontFallback', { enabled: true, value: fallbacks })}
            />
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_FONT_COLOR()}
            enabled={getProp<string>('fontColor').enabled}
            onToggle={(e) => togglePropEnabled('fontColor', e)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <input
                type="color"
                value={getProp<string>('fontColor').value || '#FFFFFF'}
                onChange={(e) => updateProp('fontColor', { enabled: true, value: e.target.value })}
                style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
              />
              <TextField
                size="small"
                value={getProp<string>('fontColor').value || ''}
                onChange={(e) => updateProp('fontColor', { enabled: getProp<string>('fontColor').enabled, value: e.target.value })}
                sx={{ width: 120 }}
              />
            </Stack>
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_FONT_SIZE()}
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
            label={LL.STYLE_FONT_BOLD_ITALIC()}
            enabled={
              getProp<boolean>('fontBold').enabled || getProp<boolean>('fontItalic').enabled || getProp<boolean>('fontUnderline').enabled
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

          <Divider />

          {/* ── Spacing Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_SPACING()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_LINE_HEIGHT()}
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
            label={LL.STYLE_LETTER_SPACING()}
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
            label={LL.STYLE_PADDING()}
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

          <Divider />

          {/* ── Text Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_TEXT()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_ALIGNMENT()}
            enabled={getProp<string>('textAlign').enabled}
            onToggle={(e) => togglePropEnabled('textAlign', e)}
          >
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
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_TRANSFORM()}
            enabled={getProp<string>('textTransform').enabled}
            onToggle={(e) => togglePropEnabled('textTransform', e)}
          >
            <Select
              size="small"
              value={getProp<string>('textTransform').value || 'none'}
              onChange={(e) =>
                updateProp('textTransform', { enabled: true, value: e.target.value as 'none' | 'uppercase' | 'lowercase' | 'capitalize' })
              }
              sx={{ width: 150 }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="uppercase">UPPERCASE</MenuItem>
              <MenuItem value="lowercase">lowercase</MenuItem>
              <MenuItem value="capitalize">Capitalize</MenuItem>
            </Select>
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_TEXT_SHADOW()}
            enabled={getProp<string>('textShadow').enabled}
            onToggle={(e) => togglePropEnabled('textShadow', e)}
          >
            <TextField
              size="small"
              value={getProp<string>('textShadow').value || '2px 2px 4px'}
              onChange={(e) => updateProp('textShadow', { enabled: true, value: e.target.value })}
              placeholder="2px 2px 4px"
              sx={{ width: 160 }}
            />
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_SHADOW_COLOR()}
            enabled={getProp<string>('textShadowColor').enabled}
            onToggle={(e) => togglePropEnabled('textShadowColor', e)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <input
                type="color"
                value={getProp<string>('textShadowColor').value || '#000000'}
                onChange={(e) => updateProp('textShadowColor', { enabled: true, value: e.target.value })}
                style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
              />
            </Stack>
          </StylePropRow>

          <StylePropRow
            label={LL.STYLE_TEXT_STROKE()}
            enabled={getProp<string>('textStroke').enabled}
            onToggle={(e) => togglePropEnabled('textStroke', e)}
          >
            <TextField
              size="small"
              value={getProp<string>('textStroke').value || '1px black'}
              onChange={(e) => updateProp('textStroke', { enabled: true, value: e.target.value })}
              placeholder="1px black"
              sx={{ width: 160 }}
            />
          </StylePropRow>

          <Divider />

          {/* ── Effects Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_EFFECTS()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_OPACITY()}
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

          <Divider />

          {/* ── Visibility Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_VISIBILITY()}
          </Typography>

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
                <Typography variant="body2">{LL.STYLE_HIDE_TEXT()}</Typography>
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
                <Typography variant="body2">{LL.STYLE_HIDE_BACKGROUND()}</Typography>
              </Stack>
            }
          />

          <Divider />

          {/* ── Next-Line Preview Section ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_NEXT_LINE_PREVIEW()}
          </Typography>

          <StylePropRow
            label={LL.STYLE_NEXT_LINE_COLOR()}
            enabled={getProp<string>('nextLinePreviewColor').enabled}
            onToggle={(e) => togglePropEnabled('nextLinePreviewColor', e)}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <input
                type="color"
                value={getProp<string>('nextLinePreviewColor').value || '#AAAAAA'}
                onChange={(e) => updateProp('nextLinePreviewColor', { enabled: true, value: e.target.value })}
                style={{ width: 36, height: 28, border: 'none', cursor: 'pointer' }}
              />
            </Stack>
          </StylePropRow>

          <Divider />

          {/* ── Window-Name Style Overrides Section (§14.8) ── */}
          {selectedStyleId !== 'new' && (
            <>
              <Typography variant="subtitle2" fontWeight={700}>
                Window Overrides
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Assign additional styles to specific presentation window names
              </Typography>
              {(styleData as StyleData & { windowOverrides?: { windowName: string; overrideStyleId: number }[] }).windowOverrides?.map(
                (ov, idx) => (
                  <Stack key={idx} direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      label="Window Name"
                      value={ov.windowName}
                      onChange={(e) => {
                        const overrides = [
                          ...((styleData as StyleData & { windowOverrides?: { windowName: string; overrideStyleId: number }[] })
                            .windowOverrides || []),
                        ];
                        overrides[idx] = { ...overrides[idx], windowName: e.target.value };
                        setStyleData((prev) => ({ ...prev, windowOverrides: overrides }));
                        setIsDirty(true);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel>Override Style</InputLabel>
                      <Select
                        value={ov.overrideStyleId}
                        label="Override Style"
                        onChange={(e) => {
                          const overrides = [
                            ...((styleData as StyleData & { windowOverrides?: { windowName: string; overrideStyleId: number }[] })
                              .windowOverrides || []),
                          ];
                          overrides[idx] = { ...overrides[idx], overrideStyleId: Number(e.target.value) };
                          setStyleData((prev) => ({ ...prev, windowOverrides: overrides }));
                          setIsDirty(true);
                        }}
                      >
                        {styles
                          .filter((s) => s.id !== selectedStyleId)
                          .map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        const overrides = (
                          (styleData as StyleData & { windowOverrides?: { windowName: string; overrideStyleId: number }[] })
                            .windowOverrides || []
                        ).filter((_, i) => i !== idx);
                        setStyleData((prev) => ({ ...prev, windowOverrides: overrides }));
                        setIsDirty(true);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ),
              ) ?? null}
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const existing =
                    (styleData as StyleData & { windowOverrides?: { windowName: string; overrideStyleId: number }[] }).windowOverrides ||
                    [];
                  const firstOtherStyle = styles.find((s) => s.id !== selectedStyleId);
                  setStyleData((prev) => ({
                    ...prev,
                    windowOverrides: [...existing, { windowName: '', overrideStyleId: firstOtherStyle?.id ?? 0 }],
                  }));
                  setIsDirty(true);
                }}
              >
                + Add Window Override
              </Button>
              <Divider />
            </>
          )}

          {/* ── Raw CSS Section ── */}
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2" fontWeight={700}>
              {LL.STYLE_CUSTOM_CSS()}
            </Typography>
            <IconButton size="small" onClick={() => setShowRawCss(!showRawCss)}>
              <CodeIcon fontSize="small" />
            </IconButton>
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

          <Divider />

          {/* ── Live Preview ── */}
          <Typography variant="subtitle2" fontWeight={700}>
            {LL.STYLE_PREVIEW()}
          </Typography>
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
            <Stack alignItems="center" justifyContent="center" sx={{ width: '100%', height: '100%' }}>
              <Typography sx={{ ...previewTextCss }}>Amazing Grace</Typography>
              <Typography sx={{ ...previewTextCss, opacity: 0.7 }}>How sweet the sound</Typography>
            </Stack>
          </Box>
        </Stack>

        {/* Footer actions */}
        <Stack direction="row" spacing={2} sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={!isDirty && selectedStyleId !== 'new'}>
            {selectedStyleId === 'new' ? LL.STYLE_CREATE() : LL.SAVE()}
          </Button>
          <Button variant="outlined" onClick={onClose}>
            {LL.CANCEL()}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
};
