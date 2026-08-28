import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  ArrowBack as BackIcon,
  MoreVert as MoreIcon,
  Public as GlobalIcon,
  Slideshow as ShowIcon,
  Bolt as ApplyIcon,
  Add as AddIcon,
  Edit as EditIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  useGetStylesQuery,
  useCreateStyleMutation,
  useUpdateStyleMutation,
  useDeleteStyleMutation,
  type StyleData,
  type StyleEntity,
} from '@/api/styles.api';
import { DEFAULT_STYLE, mergeStyles, resolveStyleData, styleToContainerCss, styleToTextCss } from '@/utils/styleUtils';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useGetSettings, useUpdateSetting } from '@/store/settingsSlice';
import { useAppDispatch } from '@/store';
import { useGetShow, setShowStyleId, setDirty } from '@/store/showSlice';
import { useSaveShowMutation } from '@/api/shows.api';
import { useUpdateAccountSettingsMutation } from '@/api/session.api';

import { createEmptyStyleData, previewSlotStyles, splitSampleAtSeparator, usePreviewScale } from '@/components/style/styleFormUtils';
import { StylePreviewPanel } from '@/components/style/StylePreviewPanel';
import { buildStyleCategories, filterStyleCategories } from '@/components/style/styleCategories';
import { StyleInheritanceContext, type InheritedSource, type StyleFormCtx } from '@/components/style/styleFormContext';

/** Sidebar (category list + preview) sizing, remembered across sessions. */
const SIDEBAR_WIDTH_KEY = 'presenter_style_sidebar_width';
const MIN_SIDEBAR = 240;
const MAX_SIDEBAR = 720;

interface StyleEditorProps {
  open: boolean;
  onClose: () => void;
  editStyleId?: number;
}

type WindowOverride = { window_name: string; override_style_id: number };

/** How many rows a thumbnail shows before it stops being readable at card size. */
const THUMB_ROWS = 4;

/**
 * Small 16:9 canvas that renders a mini-preview of a style.
 *
 * Draws the same sample text as the sidebar preview and scales lengths the same way, so a card
 * in the gallery and the canvas you designed against are the same picture at two sizes. It used
 * to show two fixed English lines at a clamped font size, which meant the gallery could not show
 * you a style's actual proportions at all.
 */
export const StyleGalleryThumb = ({ style, isNew }: { style?: StyleEntity; isNew?: boolean }) => {
  const { stylePreview } = useGetSettings();
  const { measureRef, scale } = usePreviewScale();

  const resolved = useMemo(() => {
    if (!style) return DEFAULT_STYLE;
    return mergeStyles(DEFAULT_STYLE, resolveStyleData(style.data));
  }, [style]);
  // Exclude padding so the thumb's 16:9 aspect-ratio box is not offset by style padding
  const containerCss = useMemo(() => {
    const css: Record<string, unknown> = { ...styleToContainerCss(resolved) };
    delete css.padding;
    return css;
  }, [resolved]);
  const textCss = useMemo(() => scale(styleToTextCss(resolved)), [resolved, scale]);

  /** The slots this style draws, honouring their visibility exactly as the preview does. */
  const slots = useMemo(
    () => previewSlotStyles(resolved.languageStyles).map(({ slot, css }) => ({ slot, css: scale(css) })),
    [resolved, scale],
  );

  /** The first few sample rows, stacked line-by-line across languages like the presentation. */
  const rows = useMemo(() => {
    const halves = stylePreview.languages.map((entry) => splitSampleAtSeparator(entry.lines));
    const lineCount = Math.max(0, ...halves.map((half) => half.current.length));
    const out: { key: string; css: CSSProperties; text: string }[] = [];

    for (let line = 0; line < lineCount && out.length < THUMB_ROWS; line++) {
      for (const { slot, css } of slots) {
        const text = halves[slot - 1]?.current[line];
        if (text) out.push({ key: `${slot}-${line}`, css, text });
        if (out.length >= THUMB_ROWS) break;
      }
    }

    return out;
  }, [stylePreview.languages, slots]);
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
      ref={measureRef}
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
        sx={{
          alignItems: 'center',
          justifyContent: resolved.verticalAlign === 'top' ? 'flex-start' : resolved.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 2,
          p: '6%',
          boxSizing: 'border-box',
        }}
      >
        {isNew ? (
          <AddIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        ) : (
          rows.map((row) => (
            <Typography
              key={row.key}
              sx={{
                ...textCss,
                ...row.css,
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {row.text}
            </Typography>
          ))
        )}
      </Stack>
    </Box>
  );
};

export const StyleEditor = ({ open, onClose, editStyleId }: StyleEditorProps) => {
  const { LL } = useI18nContext();
  const { data: styles = [] } = useGetStylesQuery();
  const [createStyleMutation] = useCreateStyleMutation();
  const [updateStyleMutation] = useUpdateStyleMutation();
  const [deleteStyleMutation] = useDeleteStyleMutation();

  // Assignment context: global style (settings + account) and current show
  const { globalStyleId, offlineMode } = useGetSettings();
  const updateSetting = useUpdateSetting();
  const [updateAccountSettings] = useUpdateAccountSettingsMutation();
  const { currentShow } = useGetShow();
  const dispatch = useAppDispatch();
  const [saveShowMutation] = useSaveShowMutation();

  /** 'overview' = manage/assign styles in a card grid; 'edit' = full editor with live preview. */
  const [view, setView] = useState<'overview' | 'edit'>('overview');
  const [cardMenu, setCardMenu] = useState<{ anchor: HTMLElement; style: StyleEntity } | null>(null);

  const [selectedStyleId, setSelectedStyleId] = useState<number | 'new'>('new');
  const [styleName, setStyleName] = useState<string>(LL.STYLE.NEW());
  const [styleEnabled, setStyleEnabled] = useState(true);
  const [styleData, setStyleData] = useState<StyleData>(createEmptyStyleData());
  const [windowOverrides, setWindowOverrides] = useState<WindowOverride[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  /**
   * The sidebar holds the category list and the preview, so one drag sizes both. Its width
   * is remembered because the right split depends on the screen, not on the style.
   */
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  // Secondary actions live behind this on a phone; the header has room for two buttons, not six.
  const [actionMenu, setActionMenu] = useState<HTMLElement | null>(null);
  // The preview is the reason the desktop sidebar is wide. On a phone it is a luxury the form
  // cannot afford by default, so it starts folded away and opens on request.
  const [previewOpen, setPreviewOpen] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= MIN_SIDEBAR ? stored : 340;
  });

  /**
   * Widen the column to give the preview room, and put it back where it was.
   *
   * The width it had before expanding is remembered rather than recomputed, so collapsing
   * returns to whatever the sidebar was dragged to instead of snapping to a default.
   */
  const preExpandWidth = useRef(sidebarWidth);
  const isSidebarExpanded = sidebarWidth >= MAX_SIDEBAR;

  const toggleSidebarExpanded = () => {
    if (!isSidebarExpanded) preExpandWidth.current = sidebarWidth;
    const next = isSidebarExpanded ? Math.max(MIN_SIDEBAR, preExpandWidth.current) : MAX_SIDEBAR;
    setSidebarWidth(next);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
  };

  const startSidebarResize = useCallback(() => {
    const onMove = (e: MouseEvent) => {
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(Math.min(MAX_SIDEBAR, Math.max(MIN_SIDEBAR, e.clientX - left)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      setSidebarWidth((w) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
        return w;
      });
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  /** Active category in the edit view, and the search that cuts across all of them. */
  const [activeCategoryId, setActiveCategoryId] = useState('background');
  const [categoryQuery, setCategoryQuery] = useState('');

  // Language-section UI state (lifted here so the section can render conditionally)

  // Custom-CSS tab: generated-CSS viewer state (top level — never inside render IIFEs)
  const [showGeneratedCss, setShowGeneratedCss] = useState(false);
  const [generatedCssCopied, setGeneratedCssCopied] = useState(false);

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

  // On open: jump straight into the editor when a style id was requested,
  // otherwise land on the overview.
  useEffect(() => {
    if (!open) return;
    setNameEditing(false);
    if (editStyleId) {
      const found = styles.find((s) => s.id === editStyleId);
      if (found) {
        setSelectedStyleId(found.id);
        loadStyleEntity(found);
        setView('edit');
        return;
      }
    }
    setView('overview');
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editStyleId]);

  /** Open a style in the editor view. */
  const openEdit = (style: StyleEntity) => {
    setSelectedStyleId(style.id);
    loadStyleEntity(style);
    setNameEditing(false);
    setActiveCategoryId('background');
    setView('edit');
  };

  /** Start a fresh style in the editor view. */
  const openCreate = () => {
    setSelectedStyleId('new');
    setStyleName(LL.STYLE.NEW());
    setStyleData(createEmptyStyleData());
    setWindowOverrides([]);
    setStyleEnabled(true);
    setIsDirty(false);
    setNameEditing(true);
    setActiveCategoryId('background');
    setView('edit');
  };

  const backToOverview = () => {
    if (isDirty && !confirm(LL.STYLE.UNSAVED_PROMPT())) return;
    setIsDirty(false);
    setView('overview');
  };

  // ── Assignments ──
  /** Make a style the global default (mirrors the selector in Settings, incl. account sync). */
  const handleSetGlobal = (id: number | null) => {
    updateSetting('globalStyleId', id ?? 0);
    if (!offlineMode) updateAccountSettings({ defaultStyleId: id });
  };

  /** Assign/unassign a style to the current show and persist the show right away. */
  const handleAssignShow = async (id: number | null) => {
    if (!currentShow) return;
    dispatch(setShowStyleId(id ?? undefined));
    try {
      await saveShowMutation({
        title: currentShow.title,
        order: currentShow.order,
        groups: currentShow.groups,
        styleId: id,
      }).unwrap();
      dispatch(setDirty(false));
    } catch (error) {
      console.error('Failed to save show style assignment:', error);
    }
  };

  /** How many items of the current show use a style directly. */
  const itemUsageCount = (id: number): number => (currentShow?.order ?? []).filter((it) => it.styleId === id).length;

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
    return { enabled: false, value: undefined as unknown as T };
  };

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

  /**
   * What a property resolves to when this style does not set it.
   *
   * Only the editor can answer this: it knows the app defaults and which style is the global
   * one, and therefore whether the style being edited sits above it or *is* it. Levels come
   * back in cascade order so the caller can mark the last as the one that shows. A show or item
   * style can still override further at presentation time, which the popover says outright —
   * the editor has no way to know which shows a style will end up on.
   */
  const inheritedFor = useCallback(
    (keys: (keyof StyleData)[]): InheritedSource[] => {
      const levels: InheritedSource[] = [];
      const firstDefined = (resolved: Record<string, unknown>) => keys.map((key) => resolved[key]).find((value) => value !== undefined);

      const fromDefaults = firstDefined(DEFAULT_STYLE as Record<string, unknown>);
      if (fromDefaults !== undefined) levels.push({ source: LL.STYLE.INHERITED_FROM_DEFAULT(), value: fromDefaults });

      const globalStyle = styles.find((entry) => entry.id === globalStyleId && entry.enabled);
      if (globalStyle && globalStyle.id !== editStyleId) {
        const fromGlobal = firstDefined(resolveStyleData(globalStyle.data) as Record<string, unknown>);
        if (fromGlobal !== undefined)
          levels.push({ source: LL.STYLE.INHERITED_FROM_GLOBAL({ name: globalStyle.name }), value: fromGlobal });
      }

      return levels;
    },
    [styles, globalStyleId, editStyleId, LL],
  );

  /**
   * Everything the sections need, in one object. Building it here keeps the sections free
   * of store access, so a section renders the same wherever it is mounted.
   */
  const formCtx: StyleFormCtx = {
    LL,
    styleData,
    setStyleData,
    setIsDirty,
    getProp,
    updateProp,
    togglePropEnabled,
    handlePickImage,
    handlePickVideo,
    showGeneratedCss,
    setShowGeneratedCss,
    generatedCssCopied,
    setGeneratedCssCopied,
  };

  const categories = buildStyleCategories(LL);
  const visibleCategories = filterStyleCategories(categories, categoryQuery);
  const activeCategory = visibleCategories.find((category) => category.id === activeCategoryId) ?? visibleCategories[0];

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
        setIsDirty(false);
        setView('overview');
      } catch (error) {
        console.error('Failed to delete style:', error);
      }
    }
  };

  /** Rendered in the header on a desktop and above the category tabs on a phone. */
  const categorySearch = (
    <TextField
      size="small"
      value={categoryQuery}
      onChange={(e) => setCategoryQuery(e.target.value)}
      placeholder={LL.STYLE.SEARCH()}
      sx={{ width: isMobile ? '100%' : { xs: 140, md: 220 } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </InputAdornment>
          ),
          endAdornment: categoryQuery ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setCategoryQuery('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        },
      }}
    />
  );

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
      {/* A phone has no room for a drawer that leaves a sliver of the page behind it, and no
          mouse to hit that sliver with — full width, closed by its own button. */}
      <Drawer open={open} anchor={isMobile ? 'bottom' : 'right'} onClose={onClose}>
        <Stack sx={{ width: isMobile ? '100vw' : 'min(98vw, 1520px)', height: isMobile ? '100dvh' : '100%' }}>
          {view === 'overview' && (
            <>
              {/* ── Overview: manage & assign styles ── */}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {LL.STYLE.OVERVIEW()}
                </Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                  {LL.STYLE.NEW()}
                </Button>
                <IconButton onClick={onClose}>
                  <CloseIcon />
                </IconButton>
              </Stack>

              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                {styles.length === 0 && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', my: 3 }}>
                    {LL.STYLE.EMPTY_HINT()}
                  </Typography>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 2 }}>
                  {styles.map((s) => {
                    const isGlobal = s.id === globalStyleId;
                    const isShowStyle = s.id === currentShow?.styleId;
                    const usage = itemUsageCount(s.id);
                    return (
                      <Box
                        key={s.id}
                        onClick={() => openEdit(s)}
                        sx={{
                          borderRadius: 1.5,
                          border: 1,
                          borderColor: 'divider',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'border-color 0.15s, box-shadow 0.15s',
                          '&:hover': { borderColor: 'primary.main', boxShadow: 3 },
                        }}
                      >
                        <StyleGalleryThumb style={s} />
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start', px: 1, py: 0.75 }}>
                          <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                              {s.name}
                            </Typography>
                            {(isGlobal || isShowStyle || usage > 0 || !s.enabled) && (
                              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                                {isGlobal && (
                                  <Chip
                                    size="small"
                                    color="primary"
                                    icon={<GlobalIcon />}
                                    label={LL.STYLE.LEVEL_GLOBAL()}
                                    sx={{ height: 20 }}
                                  />
                                )}
                                {isShowStyle && (
                                  <Chip
                                    size="small"
                                    color="secondary"
                                    icon={<ShowIcon />}
                                    label={LL.STYLE.LEVEL_SHOW()}
                                    sx={{ height: 20 }}
                                  />
                                )}
                                {usage > 0 && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={LL.STYLE.ITEMS_USING({ count: usage })}
                                    sx={{ height: 20 }}
                                  />
                                )}
                                {!s.enabled && <Chip size="small" label={LL.STYLE.DISABLED()} sx={{ height: 20 }} />}
                              </Stack>
                            )}
                          </Stack>
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCardMenu({ anchor: e.currentTarget, style: s });
                            }}
                          >
                            <MoreIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Box>
                    );
                  })}
                  {/* New style card */}
                  <Box
                    onClick={openCreate}
                    sx={{
                      borderRadius: 1.5,
                      border: '2px dashed',
                      borderColor: 'divider',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                      '&:hover': { borderColor: 'primary.main' },
                    }}
                  >
                    <StyleGalleryThumb isNew />
                    <Typography variant="subtitle2" sx={{ textAlign: 'center', color: 'text.secondary', py: 0.75 }}>
                      + {LL.STYLE.NEW()}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Card action menu */}
              <Menu anchorEl={cardMenu?.anchor ?? null} open={!!cardMenu} onClose={() => setCardMenu(null)}>
                <MenuItem
                  onClick={() => {
                    if (cardMenu) openEdit(cardMenu.style);
                    setCardMenu(null);
                  }}
                >
                  <ListItemIcon>
                    <EditIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{LL.COMMON.EDIT()}</ListItemText>
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    const st = cardMenu?.style;
                    setCardMenu(null);
                    if (st) void createStyleMutation({ name: `${st.name} (copy)`, enabled: st.enabled, data: st.data });
                  }}
                >
                  <ListItemIcon>
                    <DuplicateIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{LL.STYLE.DUPLICATE()}</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem
                  onClick={() => {
                    const st = cardMenu?.style;
                    setCardMenu(null);
                    if (st) handleSetGlobal(st.id === globalStyleId ? null : st.id);
                  }}
                >
                  <ListItemIcon>
                    <GlobalIcon fontSize="small" color={cardMenu?.style.id === globalStyleId ? 'primary' : undefined} />
                  </ListItemIcon>
                  <ListItemText>{cardMenu?.style.id === globalStyleId ? LL.STYLE.UNSET_GLOBAL() : LL.STYLE.SET_GLOBAL()}</ListItemText>
                </MenuItem>
                {currentShow && (
                  <MenuItem
                    onClick={() => {
                      const st = cardMenu?.style;
                      setCardMenu(null);
                      if (st) void handleAssignShow(st.id === currentShow.styleId ? null : st.id);
                    }}
                  >
                    <ListItemIcon>
                      <ShowIcon fontSize="small" color={cardMenu?.style.id === currentShow.styleId ? 'secondary' : undefined} />
                    </ListItemIcon>
                    <ListItemText>
                      {cardMenu?.style.id === currentShow.styleId ? LL.STYLE.UNASSIGN_SHOW() : LL.STYLE.ASSIGN_SHOW()}
                    </ListItemText>
                  </MenuItem>
                )}
                <Divider />
                <MenuItem
                  onClick={() => {
                    const st = cardMenu?.style;
                    setCardMenu(null);
                    if (st && confirm(LL.STYLE.DELETE_CONFIRM())) void deleteStyleMutation({ id: st.id });
                  }}
                >
                  <ListItemIcon>
                    <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
                  </ListItemIcon>
                  <ListItemText sx={{ color: 'error.main' }}>{LL.COMMON.DELETE()}</ListItemText>
                </MenuItem>
              </Menu>
            </>
          )}

          {view === 'edit' && (
            <>
              {/* ── Editor header ── */}
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', px: isMobile ? 1 : 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
              >
                <Tooltip title={LL.STYLE.BACK_TO_OVERVIEW()}>
                  <IconButton onClick={backToOverview}>
                    <BackIcon />
                  </IconButton>
                </Tooltip>
                {nameEditing || selectedStyleId === 'new' ? (
                  <TextField
                    size="small"
                    autoFocus
                    value={styleName}
                    onChange={(e) => {
                      setStyleName(e.target.value);
                      setIsDirty(true);
                    }}
                    onBlur={() => setNameEditing(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setNameEditing(false);
                    }}
                    label={LL.STYLE.NAME()}
                    sx={{ width: isMobile ? 150 : 280 }}
                  />
                ) : (
                  <Tooltip title={LL.STYLE.RENAME()}>
                    <Typography
                      variant="h6"
                      noWrap
                      onClick={() => setNameEditing(true)}
                      sx={{ fontWeight: 700, cursor: 'text', maxWidth: isMobile ? 140 : 380 }}
                    >
                      {styleName}
                    </Typography>
                  </Tooltip>
                )}
                {isDirty && <Chip label={LL.STYLE.UNSAVED()} size="small" color="warning" />}
                {statusMessage && <Chip label={statusMessage} size="small" color="success" />}
                <Box sx={{ flexGrow: 1 }} />

                {/* The search filters the category list, so on a phone it travels down to sit
                    with it rather than competing for the header's last 40 pixels. */}
                {!isMobile && categorySearch}

                <Button
                  variant="contained"
                  size="small"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={!isDirty && selectedStyleId !== 'new'}
                >
                  {selectedStyleId === 'new' ? LL.STYLE.CREATE() : LL.COMMON.SAVE()}
                </Button>

                {isMobile ? (
                  <>
                    <IconButton size="small" onClick={(e) => setActionMenu(e.currentTarget)}>
                      <MoreIcon />
                    </IconButton>
                    <Menu anchorEl={actionMenu} open={Boolean(actionMenu)} onClose={() => setActionMenu(null)}>
                      <MenuItem
                        disabled={!isDirty && selectedStyleId !== 'new'}
                        onClick={async () => {
                          setActionMenu(null);
                          const id = await handleSave();
                          if (id != null) setStatusMessage(LL.STYLE.APPLIED());
                        }}
                      >
                        <ListItemIcon>
                          <ApplyIcon fontSize="small" color="success" />
                        </ListItemIcon>
                        <ListItemText>{LL.STYLE.SAVE_AND_APPLY()}</ListItemText>
                      </MenuItem>
                      {selectedStyleId !== 'new' && (
                        <MenuItem
                          onClick={() => {
                            setActionMenu(null);
                            handleDuplicate();
                          }}
                        >
                          <ListItemIcon>
                            <DuplicateIcon fontSize="small" />
                          </ListItemIcon>
                          <ListItemText>{LL.STYLE.DUPLICATE()}</ListItemText>
                        </MenuItem>
                      )}
                      {selectedStyleId !== 'new' && (
                        <MenuItem
                          onClick={() => {
                            setActionMenu(null);
                            handleDelete();
                          }}
                        >
                          <ListItemIcon>
                            <DeleteIcon fontSize="small" color="error" />
                          </ListItemIcon>
                          <ListItemText sx={{ color: 'error.main' }}>{LL.COMMON.DELETE()}</ListItemText>
                        </MenuItem>
                      )}
                    </Menu>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="small"
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
                    {selectedStyleId !== 'new' && (
                      <>
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
                  </>
                )}
                <IconButton onClick={onClose}>
                  <CloseIcon />
                </IconButton>
              </Stack>

              {/* ── Editor body ──
                  Desktop: categories over the preview in one resizable column, form beside it.
                  Phone: the same three things stacked, because side by side leaves the form about
                  40px wide. The category list becomes a swipeable strip and the preview folds. */}
              <Stack direction={isMobile ? 'column' : 'row'} sx={{ flex: 1, minHeight: 0 }}>
                {isMobile ? (
                  <Stack sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                    <Box sx={{ px: 1, pt: 1 }}>{categorySearch}</Box>
                    <Tabs
                      value={activeCategory?.id ?? false}
                      onChange={(_, value) => setActiveCategoryId(value)}
                      variant="scrollable"
                      scrollButtons="auto"
                      allowScrollButtonsMobile
                    >
                      {visibleCategories.map((category) => {
                        const Icon = category.icon;
                        return (
                          <Tab
                            key={category.id}
                            value={category.id}
                            icon={<Icon fontSize="small" />}
                            iconPosition="start"
                            label={category.label}
                            sx={{ minHeight: 44, textTransform: 'none' }}
                          />
                        );
                      })}
                    </Tabs>
                  </Stack>
                ) : (
                  <>
                    {/* Categories and the live preview share one resizable column */}
                    <Stack ref={sidebarRef} sx={{ width: sidebarWidth, flexShrink: 0, minHeight: 0 }}>
                      <List dense sx={{ flexShrink: 0, maxHeight: '50%', overflow: 'auto', py: 1 }}>
                        {visibleCategories.map((category) => {
                          const Icon = category.icon;
                          return (
                            <ListItemButton
                              key={category.id}
                              selected={category.id === activeCategory?.id}
                              onClick={() => setActiveCategoryId(category.id)}
                              sx={{ borderRadius: 1, mx: 1, mb: 0.25 }}
                            >
                              <ListItemIcon sx={{ minWidth: 32 }}>
                                <Icon fontSize="small" />
                              </ListItemIcon>
                              <ListItemText slotProps={{ primary: { variant: 'body2' } }} primary={category.label} />
                            </ListItemButton>
                          );
                        })}
                      </List>

                      <StylePreviewPanel styleData={styleData} expanded={isSidebarExpanded} onToggleExpanded={toggleSidebarExpanded} />
                    </Stack>

                    <Box
                      role="separator"
                      aria-label={LL.STYLE.PREVIEW_RESIZE()}
                      onMouseDown={startSidebarResize}
                      sx={{
                        width: 6,
                        flexShrink: 0,
                        cursor: 'col-resize',
                        borderLeft: 1,
                        borderRight: 1,
                        borderColor: 'divider',
                        '&:hover': { bgcolor: 'primary.main' },
                      }}
                    />
                  </>
                )}

                <Stack sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
                  {isMobile && (
                    // Folded by default: what you came to the phone to do is edit a value, and the
                    // preview would push every field below the fold before you saw one.
                    <Box sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                      <Button
                        fullWidth
                        size="small"
                        color="inherit"
                        endIcon={previewOpen ? <CollapseIcon /> : <ExpandIcon />}
                        onClick={() => setPreviewOpen((open) => !open)}
                        sx={{ justifyContent: 'space-between', px: 2, py: 1, textTransform: 'none' }}
                      >
                        {LL.STYLE.PREVIEW()}
                      </Button>
                      {previewOpen && <StylePreviewPanel styleData={styleData} expanded={false} />}
                    </Box>
                  )}
                  <Stack sx={{ flex: 1, overflow: 'auto', px: isMobile ? 1.5 : 2.5, py: 2 }} spacing={0.25}>
                    {activeCategory ? (
                      <>
                        <Box sx={{ pb: 1.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {activeCategory.label}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {activeCategory.description}
                          </Typography>
                        </Box>
                        <StyleInheritanceContext.Provider value={inheritedFor}>
                          {activeCategory.render(formCtx)}
                        </StyleInheritanceContext.Provider>
                      </>
                    ) : (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {LL.STYLE.SEARCH_NO_RESULTS({ query: categoryQuery })}
                      </Typography>
                    )}
                  </Stack>
                </Stack>
              </Stack>
            </>
          )}
        </Stack>
      </Drawer>
    </>
  );
};
