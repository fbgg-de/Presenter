/**
 * Everything about one agenda group in one place, opened from the group's ⋮ button: its name and
 * colour, the theme its items are shown in, and how its media play. Sections down the left like
 * the settings, each saying what it is for; a summary on top shows the group as the agenda does.
 * One Save applies them all. The Theme section can make a new theme for this group (a copy of the
 * chosen one) and hand a theme to the theme editor. A named group with entries can also be kept
 * in the library from here.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  BookmarkAddOutlined as SaveToLibraryIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Circle as CircleIcon,
  Close as CloseIcon,
  FormatColorReset as NoColorIcon,
  Palette as ThemeIcon,
  PlaylistPlay as PlaybackIcon,
  Tune as GeneralIcon,
  type SvgIconComponent,
} from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowGroup } from '@/api/shows.api';
import { useCreateStyleMutation, type StyleEntity } from '@/api/styles.api';
import { createEmptyStyleData } from '@/components/style/styleFormUtils';
import { StyleGalleryThumb } from '@/components/style/StyleEditor';
import {
  DEFAULT_GROUP_BACKGROUNDS,
  DEFAULT_GROUP_MEDIA,
  groupBackgroundSettings,
  groupMediaSettings,
  type GroupBackgroundSettings,
  type GroupMediaSettings,
} from '@/media/groupPlayback';
import { DEFAULT_GROUP_ID, GROUP_COLOR_PRESETS } from '@/utils/showGroups';
import { GroupPlaybackFields } from './GroupPlaybackFields';

type TabId = 'general' | 'theme' | 'playback';

/** One theme to pick: its picture and name, marked when chosen. */
const ThemeCard = ({
  selected,
  label,
  secondary,
  style,
  onClick,
}: {
  selected: boolean;
  label: string;
  secondary?: string;
  style?: StyleEntity;
  onClick: () => void;
}) => (
  <ButtonBase
    onClick={onClick}
    aria-pressed={selected}
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      textAlign: 'left',
      borderRadius: 1,
      border: 2,
      borderColor: selected ? 'primary.main' : 'divider',
      overflow: 'hidden',
      '&:hover': { borderColor: selected ? 'primary.main' : 'text.secondary' },
    }}
  >
    <Box sx={{ position: 'relative' }}>
      {style ? (
        <StyleGalleryThumb style={style} />
      ) : (
        <Stack sx={{ aspectRatio: '16/9', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', px: 1, textAlign: 'center' }}>
            {secondary}
          </Typography>
        </Stack>
      )}
      {selected && (
        <CheckIcon
          fontSize="small"
          sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: '50%' }}
        />
      )}
    </Box>
    <Typography variant="body2" noWrap sx={{ px: 1, py: 0.5 }}>
      {label}
    </Typography>
  </ButtonBase>
);

export const GroupSettingsDialog = ({
  group,
  itemCount,
  styles,
  showStyle,
  onClose,
  onSave,
  onSaveToLibrary,
  onEditTheme,
  initialTab = 'general',
}: {
  /** Save the group, close, and open this theme in the theme editor. */
  onEditTheme?: (styleId: number, patch: Partial<ShowGroup>) => void;
  /** The section to open on. */
  initialTab?: TabId;
  /** The group being edited; null closes the dialog. */
  group: ShowGroup | null;
  /** How many entries the group has — only a group with entries can be kept in the library. */
  itemCount: number;
  styles: StyleEntity[];
  /** The show's own theme, which a group without one follows. */
  showStyle?: StyleEntity;
  onClose: () => void;
  onSave: (patch: Partial<ShowGroup>) => void;
  onSaveToLibrary?: (group: ShowGroup) => void;
}) => {
  const { LL } = useI18nContext();
  const G = LL.SHOW_GROUPS;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // With room, the sections are listed down the left like in the settings; otherwise tabs on top.
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const [tab, setTab] = useState<TabId>('general');
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [styleId, setStyleId] = useState<number | undefined>(undefined);
  const [media, setMedia] = useState<GroupMediaSettings>(DEFAULT_GROUP_MEDIA);
  const [backgrounds, setBackgrounds] = useState<GroupBackgroundSettings>(DEFAULT_GROUP_BACKGROUNDS);

  // Fresh values each time a group opens.
  useEffect(() => {
    if (!group) return;
    setTab(initialTab);
    setName(group.name ?? '');
    setColor(group.color);
    setStyleId(group.styleId);
    setMedia(groupMediaSettings(group));
    setBackgrounds(groupBackgroundSettings(group));
    // A group opens on the section it was asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group]);

  const [createStyle, { isLoading: creating }] = useCreateStyleMutation();
  // The theme the group ends up with: its own, else the show's.
  const chosenStyle = styles.find((style) => style.id === styleId) ?? (styleId === undefined ? showStyle : undefined);
  /** A copy of the chosen theme under the group's name, chosen for the group at once. */
  const newTheme = async () => {
    try {
      const created = await createStyle({
        name: G.NEW_THEME_NAME({ group: title || G.DEFAULT() }),
        data: chosenStyle ? structuredClone(chosenStyle.data) : createEmptyStyleData(),
      }).unwrap();
      setStyleId(created.id);
    } catch {
      /* the styles list shows nothing new; the operator can try again */
    }
  };

  const patch = (): Partial<ShowGroup> => ({ name: name.trim(), color, styleId, media, backgrounds });
  const isDefault = group?.id === DEFAULT_GROUP_ID;
  // The unnamed Default group is just "everything else" — only named groups are worth keeping.
  const canKeep = !!onSaveToLibrary && itemCount > 0 && !!name.trim();
  const title = name.trim() || (isDefault ? G.DEFAULT() : '');
  const sections: { id: TabId; label: string; description: string; icon: SvgIconComponent }[] = [
    { id: 'general', label: G.TAB_GENERAL(), description: G.TAB_GENERAL_DESC(), icon: GeneralIcon },
    { id: 'theme', label: G.THEME(), description: G.TAB_THEME_DESC(), icon: ThemeIcon },
    { id: 'playback', label: LL.GROUP_PLAYBACK.MENU_ITEM(), description: G.TAB_PLAYBACK_DESC(), icon: PlaybackIcon },
  ];

  // The group as the agenda shows it: colour bar, name, theme and size — updated while editing.
  const summary = (
    <Stack spacing={0.5} sx={{ mb: 2 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'text.secondary' }}>
        {G.SUMMARY_PREVIEW()}
      </Typography>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          alignItems: 'center',
          px: 1.25,
          py: 0.9,
          borderRadius: 1,
          bgcolor: 'action.hover',
          boxShadow: color ? `inset 4px 0 0 ${color}` : 'none',
        }}
      >
        <CircleIcon sx={{ fontSize: 12, color: color ?? 'text.disabled' }} />
        <Typography sx={{ fontWeight: 700, minWidth: 0 }} noWrap>
          {title || G.DEFAULT()}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ThemeIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', maxWidth: 160 }}>
            {chosenStyle?.name ?? G.THEME_FROM_SHOW()}
          </Typography>
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          {G.SUMMARY_ENTRIES({ count: itemCount })}
        </Typography>
      </Stack>
    </Stack>
  );

  const panels = (
    <>
      {summary}
      {tab === 'general' && (
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            autoFocus
            label={G.NAME()}
            value={name}
            placeholder={isDefault ? G.DEFAULT() : undefined}
            helperText={isDefault ? G.DEFAULT_NAME_HINT() : undefined}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && group) onSave(patch());
            }}
            fullWidth
          />
          <Stack spacing={1}>
            <Stack>
              <Typography variant="body2">{G.COLOR()}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {G.COLOR_HINT()}
              </Typography>
            </Stack>
            <Stack direction="row" useFlexGap sx={{ gap: 0.5, flexWrap: 'wrap' }}>
              <Tooltip title={G.NO_COLOR()}>
                <IconButton
                  onClick={() => setColor(undefined)}
                  aria-pressed={!color}
                  sx={{ border: 2, borderColor: !color ? 'primary.main' : 'transparent' }}
                >
                  <NoColorIcon sx={{ color: 'text.disabled' }} />
                </IconButton>
              </Tooltip>
              {GROUP_COLOR_PRESETS.map((preset) => (
                <Tooltip key={preset} title={preset}>
                  <IconButton
                    onClick={() => setColor(preset)}
                    aria-pressed={color === preset}
                    sx={{ border: 2, borderColor: color === preset ? 'primary.main' : 'transparent' }}
                  >
                    <CircleIcon sx={{ color: preset }} />
                  </IconButton>
                </Tooltip>
              ))}
            </Stack>
          </Stack>
        </Stack>
      )}

      {tab === 'theme' && (
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <Box
              sx={{ width: { xs: '100%', sm: 260 }, flexShrink: 0, borderRadius: 1, overflow: 'hidden', border: 1, borderColor: 'divider' }}
            >
              {chosenStyle ? (
                <StyleGalleryThumb style={chosenStyle} />
              ) : (
                <Stack sx={{ aspectRatio: '16/9', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {G.THEME_FROM_SHOW()}
                  </Typography>
                </Stack>
              )}
            </Box>
            <Stack spacing={1} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700 }}>{chosenStyle?.name ?? G.THEME_FOLLOW_SHOW()}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {G.THEME_HINT()}
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {chosenStyle && onEditTheme && (
                  <Tooltip title={G.EDIT_THEME_HINT()}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => group && onEditTheme(chosenStyle.id, patch())}
                      sx={{ textTransform: 'none' }}
                    >
                      {G.EDIT_THEME()}
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title={G.NEW_THEME_HINT()}>
                  <span>
                    <Button
                      size="small"
                      color="inherit"
                      startIcon={<AddIcon />}
                      disabled={creating}
                      onClick={() => void newTheme()}
                      sx={{ textTransform: 'none' }}
                    >
                      {G.NEW_THEME()}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.5 }}>
            <ThemeCard
              selected={!styleId}
              label={G.THEME_FOLLOW_SHOW()}
              secondary={showStyle?.name ?? G.THEME_FROM_SHOW()}
              style={showStyle}
              onClick={() => setStyleId(undefined)}
            />
            {styles
              .filter((style) => style.enabled)
              .map((style) => (
                <ThemeCard
                  key={style.id}
                  selected={styleId === style.id}
                  label={style.name}
                  style={style}
                  onClick={() => setStyleId(style.id)}
                />
              ))}
          </Box>
        </Stack>
      )}

      {tab === 'playback' && (
        <Box sx={{ pt: 1 }}>
          <GroupPlaybackFields media={media} backgrounds={backgrounds} onMediaChange={setMedia} onBackgroundsChange={setBackgrounds} />
        </Box>
      )}
    </>
  );

  return (
    <Dialog open={!!group} onClose={onClose} maxWidth={wide ? 'md' : 'sm'} fullWidth fullScreen={isMobile}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: wide ? 1.5 : 0 }}>
        <Typography variant="h6" component="span" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {G.SETTINGS_TITLE({ group: title })}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={LL.COMMON.CLOSE()}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      {wide ? (
        <Stack direction="row" sx={{ borderTop: 1, borderBottom: 1, borderColor: 'divider', minHeight: 420 }}>
          <List dense sx={{ width: 230, flexShrink: 0, borderRight: 1, borderColor: 'divider', py: 1 }}>
            {sections.map(({ id, label, description, icon: Icon }) => (
              <ListItemButton key={id} selected={tab === id} onClick={() => setTab(id)} sx={{ borderRadius: 1, mx: 1, mb: 0.25 }}>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  slotProps={{ primary: { variant: 'body2', sx: { fontWeight: 600 } }, secondary: { variant: 'caption' } }}
                  primary={label}
                  secondary={description}
                />
              </ListItemButton>
            ))}
          </List>
          <DialogContent sx={{ flex: 1 }}>{panels}</DialogContent>
        </Stack>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(_, value: TabId) => setTab(value)}
            variant="scrollable"
            sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
          >
            {sections.map(({ id, label }) => (
              <Tab key={id} value={id} label={label} />
            ))}
          </Tabs>
          <DialogContent sx={{ minHeight: 360 }}>{panels}</DialogContent>
        </>
      )}
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {onSaveToLibrary && (
          <Tooltip title={canKeep ? '' : G.KEEP_NEEDS_NAME()}>
            <span style={{ marginRight: 'auto' }}>
              <Button
                startIcon={<SaveToLibraryIcon />}
                disabled={!canKeep}
                onClick={() => group && onSaveToLibrary({ ...group, ...patch() })}
                sx={{ textTransform: 'none' }}
              >
                {LL.LIBRARY.SAVE_GROUP()}
              </Button>
            </span>
          </Tooltip>
        )}
        <Button onClick={onClose}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={() => group && onSave(patch())}>
          {LL.COMMON.SAVE()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
