import { useEffect, useState, type DragEvent, MouseEvent } from 'react';
import {
  Box,
  Chip,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
  useTheme,
  MenuItem,
  Menu,
  Badge,
  Tooltip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  ViewList as ViewListIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Edit as EditIcon,
  MusicNote as MusicNoteIcon,
  Image as ImageIcon,
  MenuBook as MenuBookIcon,
  Save as SaveIcon,
  Palette as PaletteIcon,
  LightMode,
  DarkMode,
  SettingsBrightness,
  AccountCircle as AccountCircleIcon,
  Logout as LogoutIcon,
  PictureAsPdf as PdfIcon,
  AdminPanelSettings as AdminIcon,
  MoreVert as MoreVertIcon,
  ChevronRight as ChevronRightIcon,
  FolderOpen as FolderOpenIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import DraggableList from '@/components/DraggableList';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ISong } from '@/song';
import { Song } from '@/song';
import { CCLISong } from '@/song';
import { Settings } from '@/components/Settings';
import { SongEditor } from '@/components/SongEditor';
import { SongLibrary } from '@/components/SongLibrary';
import { Shows } from '@/components/Shows';
import { BibleVersePicker } from '@/components/BibleVersePicker';
import { MediaBrowser } from '@/components/MediaBrowser';
import { getShowItemIcon, getShowItemColor } from '@/utils/showItemIcons';
import { UnifiedSearch } from '@/components/UnifiedSearch';
import { useAppSelector, useAppDispatch } from '@/store';
import { setCurrentShow, addShowItem, removeShowItem, reorderShowItems, setDirty, updateShowItem, selectIsDirty } from '@/store/showSlice';
import {
  addSongToStore,
  setSongsOrder as setSongsOrderAction,
  addToSongsOrder,
  setSongOrders as setSongOrdersAction,
  setCurrentSongOrder as setCurrentSongOrderAction,
} from '@/store/songsSlice';
import { setActiveItemIndex, setKeyboardDisabled } from '@/store/presentationSlice';
import type { Show, ShowItem, MediaSubType } from '@/api/shows.api';
import type { SongListItem } from '@/api/songs.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetSessionQuery, useLogoutMutation } from '@/api/session.api';
import { useMetrics } from '@/hooks/useMetrics';
import { loadShowSongs } from '@/store/songsSlice';
import { toggleTheme } from '@/store/themeSlice';
import { StyleEditor } from '@/components/StyleEditor';
import { WindowManager } from '@/components/WindowManager';
import { MUSICAL_KEYS, parseOrderKey } from '@/utils/orderKeyUtils';

const Sidebar = () => {
  const { palette } = useTheme();
  const navigate = useNavigate();
  const songClick = useAppSelector((state) => state.settings.songClick);
  const dispatch = useAppDispatch();
  const currentShow = useAppSelector((state) => state.show.currentShow);
  const isDirty = useAppSelector(selectIsDirty);
  const themeMode = useAppSelector((state) => state.theme.mode);

  // Redux state
  const songs = useAppSelector((state) => state.songs.songs);
  const activeItemIndex = useAppSelector((state) => state.presentation.activeItemIndex);

  const { LL } = useI18nContext();
  const { trackEvent } = useMetrics();

  const [openSettings, _setOpenSettings] = useState(false);
  const [openSongEditor, _setOpenSongEditor] = useState(false);
  const [openShowSwitcher, _setOpenShowSwitcher] = useState(false);
  const [openSongSearch, setOpenSongSearch] = useState(false);
  const [openSongLibrary, _setOpenSongLibrary] = useState(false);
  const [openBiblePicker, _setOpenBiblePicker] = useState(false);
  const [openMediaBrowser, _setOpenMediaBrowser] = useState(false);
  const [songToEdit, _setSongToEdit] = useState<ISong>();
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  const [windowManagerOpen, setWindowManagerOpen] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);

  const { data: session } = useGetSessionQuery();
  const [logout] = useLogoutMutation();

  // Add menu
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const addMenuOpen = Boolean(addMenuAnchor);

  const [saveShowMutation] = useSaveShowMutation();
  const { data: availableStyles = [] } = useGetStylesQuery();

  // Item context menu state
  const [itemMenuAnchor, setItemMenuAnchor] = useState<null | HTMLElement>(null);
  const [itemMenuIndex, setItemMenuIndex] = useState<number>(-1);
  const [keySubmenuAnchor, setKeySubmenuAnchor] = useState<null | HTMLElement>(null);
  const [orderSubmenuAnchor, setOrderSubmenuAnchor] = useState<null | HTMLElement>(null);
  // Item-style nested submenus: window list -> style list (per chosen window)
  const [itemStyleWinAnchor, setItemStyleWinAnchor] = useState<null | HTMLElement>(null);
  const [itemStyleStyleAnchor, setItemStyleStyleAnchor] = useState<null | HTMLElement>(null);
  const [itemStyleWindowName, setItemStyleWindowName] = useState<string>('');

  // Window names available for per-item style overrides (from the footer's saved configs)
  const savedWindowConfigs = useAppSelector((state) => state.settings.windowConfigs) as Array<{ name?: string }>;
  const windowNames = (savedWindowConfigs || []).map((c) => (c?.name || '').trim()).filter((n) => n.length > 0);

  const themeIcon = themeMode === 'dark' ? <DarkMode /> : themeMode === 'light' ? <LightMode /> : <SettingsBrightness />;

  const handleLogout = async () => {
    setAccountMenuAnchor(null);
    try {
      await logout().unwrap();
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  const handleSaveShow = async () => {
    if (!currentShow) return;
    try {
      await saveShowMutation({
        title: currentShow.title,
        order: currentShow.order,
      }).unwrap();
      dispatch(setDirty(false));
      trackEvent('show_saved', 'show', currentShow.title);
    } catch (error) {
      console.error('Failed to save show:', error);
    }
  };

  // Disable keyboard navigation when dialogs are open
  useEffect(() => {
    dispatch(setKeyboardDisabled(openSongSearch || openBiblePicker || openMediaBrowser));
  }, [openSongSearch, openBiblePicker, openMediaBrowser, dispatch]);

  const setOpenSettings = (open: boolean) => {
    _setOpenSettings(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setOpenSongEditor = (open: boolean) => {
    _setOpenSongEditor(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setOpenShowSwitcher = (open: boolean) => {
    _setOpenShowSwitcher(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setOpenSongLibrary = (open: boolean) => {
    _setOpenSongLibrary(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setOpenBiblePicker = (open: boolean) => {
    _setOpenBiblePicker(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setOpenMediaBrowser = (open: boolean) => {
    _setOpenMediaBrowser(open);
    dispatch(setKeyboardDisabled(open));
  };

  const setSongToEdit = (song: ISong) => {
    _setSongToEdit(song);
    setOpenSongEditor(true);
  };

  const handleSongSelected = async (song: SongListItem) => {
    try {
      const response = await fetch(`/rest/Song/${song.songNumber}`);
      const data = await response.json();

      let fullSong: ISong | undefined;
      if (Array.isArray(data) && data.length > 0) {
        fullSong = data[0];
      } else if (data && typeof data === 'object' && data.songNumber) {
        fullSong = data;
      }

      if (fullSong) {
        const songToAdd = new Song({
          songNumber: fullSong.songNumber,
          title: fullSong.title,
          authors: fullSong.authors,
          copyright: fullSong.copyright,
          initialOrder: fullSong.initialOrder,
          order: fullSong.order,
          blocks: fullSong.blocks,
          background: fullSong.background,
          css: fullSong.css,
        });

        // Add to Redux store
        dispatch(addSongToStore(songToAdd));
        dispatch(addToSongsOrder(songToAdd.songNumber));

        // Add as show item
        dispatch(
          addShowItem({
            type: 'song',
            songNumber: songToAdd.songNumber,
            order: 'Default',
          }),
        );

        // Track metric
        trackEvent('song_selected', 'song', String(songToAdd.songNumber));

        // Clear search
        setOpenSongSearch(false);
      }
    } catch (error) {
      console.error('Failed to fetch song:', error);
    }
  };

  const handleBibleVerseAdd = (bibleRef: string, bibleTranslation: string, label: string) => {
    dispatch(
      addShowItem({
        type: 'bible_verse',
        bibleRef,
        bibleTranslation,
        label,
      }),
    );
    trackEvent('bible_verse_added', 'bible', bibleRef);
  };

  const handleMediaAdd = (mediaSubType: MediaSubType, mediaPath?: string, mediaColor?: string) => {
    dispatch(
      addShowItem({
        type: 'media',
        mediaSubType,
        mediaPath,
        mediaColor,
        label: mediaSubType === 'color' ? mediaColor : mediaPath,
      }),
    );
    trackEvent('media_added', 'media', mediaPath || mediaColor);
  };

  const handleShowSwitch = async (show: Show | null, isNew: boolean, override?: boolean) => {
    if (show) {
      if (isNew || override) {
        try {
          const orderToSave: ShowItem[] = override ? (currentShow?.order ?? []) : [];

          await saveShowMutation({
            title: show.title,
            order: orderToSave,
          }).unwrap();
        } catch (error) {
          console.error('Failed to create new show:', error);
          return;
        }
      }

      dispatch(setCurrentShow(show));

      if (!isNew && !override) {
        await dispatch(loadShowSongs(show));
      } else if (!override) {
        dispatch(setSongsOrderAction([]));
        dispatch(setSongOrdersAction({}));
      }
    }
  };

  const onDragOver = (e: DragEvent) => {
    if (e.dataTransfer.items) {
      const items = [...e.dataTransfer.items].filter((item) => item.type === 'text/plain');
      if (items.length > 0) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  };

  const onDrop = (e: DragEvent) => {
    if (e.dataTransfer.files) {
      const files = [...e.dataTransfer.files].filter((file) => file.type === 'text/plain' && file.name.endsWith('.txt'));

      if (files.length > 0) {
        e.preventDefault();

        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            if (ev.target && ev.target.result) {
              const importedSong = CCLISong(file.name, ev.target.result.toString());
              dispatch(addSongToStore(importedSong));
              dispatch(addToSongsOrder(importedSong.songNumber));
              dispatch(
                addShowItem({
                  type: 'song',
                  songNumber: importedSong.songNumber,
                  order: 'Default',
                }),
              );
            }
          };
          reader.readAsText(file);
        });
      }
    }
  };

  // Show items from the current show
  const showItems = currentShow?.order ?? [];

  // Get display info for a show item
  const getItemLabel = (item: ShowItem, index: number): string => {
    switch (item.type) {
      case 'song': {
        const song = item.songNumber != null ? songs[item.songNumber] : undefined;
        return song?.title ?? `Song #${item.songNumber ?? index}`;
      }
      case 'bible_verse':
        return item.bibleRef || item.label || LL.BIBLE.VERSE();
      case 'media':
        if (item.mediaSubType === 'color') return item.mediaColor || LL.MEDIA.COLOR();
        return item.mediaPath || item.label || LL.MEDIA.IMAGE();
      default:
        return `Item ${index + 1}`;
    }
  };

  // ── Item context menu handlers ──
  const handleItemMenuOpen = (event: MouseEvent<HTMLElement>, index: number) => {
    event.stopPropagation();
    setItemMenuAnchor(event.currentTarget);
    setItemMenuIndex(index);
  };

  const handleItemMenuClose = () => {
    setItemMenuAnchor(null);
    setItemMenuIndex(-1);
    setKeySubmenuAnchor(null);
    setOrderSubmenuAnchor(null);
    setItemStyleWinAnchor(null);
    setItemStyleStyleAnchor(null);
    setItemStyleWindowName('');
  };

  const handleItemSetStyleForWindow = (styleId: number | null) => {
    if (itemMenuIndex >= 0 && itemStyleWindowName) {
      const item = showItems[itemMenuIndex];
      const next: Record<string, number | null> = { ...(item.itemStyleByWindow || {}) };
      next[itemStyleWindowName] = styleId;
      dispatch(updateShowItem({ index: itemMenuIndex, item: { itemStyleByWindow: next } }));
    }
    handleItemMenuClose();
  };

  const handleItemRemove = () => {
    if (itemMenuIndex >= 0) {
      dispatch(removeShowItem(itemMenuIndex));
      if (activeItemIndex > 0 && itemMenuIndex <= activeItemIndex) {
        dispatch(setActiveItemIndex(activeItemIndex - 1));
      }
    }
    handleItemMenuClose();
  };

  const handleItemSetKey = (key: string | undefined) => {
    if (itemMenuIndex >= 0) {
      dispatch(updateShowItem({ index: itemMenuIndex, item: { key } }));
    }
    setKeySubmenuAnchor(null);
    handleItemMenuClose();
  };

  const handleItemSetOrder = (order: string) => {
    if (itemMenuIndex >= 0) {
      const item = showItems[itemMenuIndex];
      if (item.songNumber != null) {
        dispatch(setCurrentSongOrderAction({ songNumber: item.songNumber, orderName: order }));
      }
      dispatch(updateShowItem({ index: itemMenuIndex, item: { order } }));
    }
    setOrderSubmenuAnchor(null);
    handleItemMenuClose();
  };

  const handleItemEdit = () => {
    const item = itemMenuIndex >= 0 ? showItems[itemMenuIndex] : undefined;
    if (item?.type === 'song' && item.songNumber != null) {
      const song = songs[item.songNumber];
      if (song) setSongToEdit(song);
    }
    handleItemMenuClose();
  };

  // Get context menu item data
  const menuItem = itemMenuIndex >= 0 ? showItems[itemMenuIndex] : undefined;
  const menuItemSong = menuItem?.type === 'song' && menuItem.songNumber != null ? songs[menuItem.songNumber] : undefined;
  const menuItemOrders = menuItemSong?.order ? Object.keys(menuItemSong.order) : [];

  return (
    <Stack width={400} minWidth={400} sx={{ background: palette.background.default }} onDragOver={onDragOver} onDrop={onDrop}>
      <Settings open={openSettings} setOpen={setOpenSettings} />
      <SongEditor open={openSongEditor} setOpen={setOpenSongEditor} song={songToEdit} />
      <SongLibrary
        open={openSongLibrary}
        onClose={() => setOpenSongLibrary(false)}
        onSongSelected={(song) => {
          handleSongSelected(song);
          setOpenSongLibrary(false);
        }}
      />
      <Shows
        open={openShowSwitcher}
        onShowSelected={handleShowSwitch}
        onClose={() => setOpenShowSwitcher(false)}
        allowClose={true}
        currentShowTitle={currentShow?.title}
      />
      <BibleVersePicker open={openBiblePicker} onClose={() => setOpenBiblePicker(false)} onAdd={handleBibleVerseAdd} />
      <MediaBrowser open={openMediaBrowser} onClose={() => setOpenMediaBrowser(false)} onAdd={handleMediaAdd} />

      <StyleEditor open={styleEditorOpen} onClose={() => setStyleEditorOpen(false)} />

      <WindowManager open={windowManagerOpen} onClose={() => setWindowManagerOpen(false)} />

      <Stack
        direction="row"
        p={openSongSearch ? 0 : 1}
        sx={{ background: palette.background.paper, minHeight: '56px', flexWrap: 'wrap' }}
        alignItems="center"
      >
        {openSongSearch ? (
          <Box sx={{ width: '100%', p: 0.5 }}>
            <UnifiedSearch
              open={openSongSearch}
              onClose={() => {
                setOpenSongSearch(false);
              }}
              onSelectSong={(songNumber) => handleSongSelected({ songNumber, title: '' })}
              onSelectMedia={(path) => handleMediaAdd('image', path)}
              onSelectStyle={() => {
                setStyleEditorOpen(true);
              }}
              onSelectBible={(ref) => {
                handleBibleVerseAdd(ref, '', ref);
              }}
              onOpenSongLibrary={() => {
                setOpenSongSearch(false);
                setOpenSongLibrary(true);
              }}
            />
          </Box>
        ) : (
          <>
            <Tooltip title={LL.SONGS.SEARCH()}>
              <IconButton size="small" onClick={() => setOpenSongSearch(true)}>
                <SearchIcon />
              </IconButton>
            </Tooltip>

            {/* Add Item Menu */}
            <Tooltip title={LL.SHOW_ITEMS.ADD()}>
              <IconButton size="small" onClick={(e) => setAddMenuAnchor(e.currentTarget)}>
                <AddIcon />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={addMenuAnchor} open={addMenuOpen} onClose={() => setAddMenuAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  setSongToEdit(new Song());
                }}
              >
                <ListItemIcon>
                  <MusicNoteIcon fontSize="small" sx={{ color: '#1976d2' }} />
                </ListItemIcon>
                <ListItemText>{LL.SONGS.ADD()}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  setOpenMediaBrowser(true);
                }}
              >
                <ListItemIcon>
                  <ImageIcon fontSize="small" sx={{ color: '#f9a825' }} />
                </ListItemIcon>
                <ListItemText>{LL.SHOW_ITEMS.ADD_MEDIA()}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAddMenuAnchor(null);
                  setOpenBiblePicker(true);
                }}
              >
                <ListItemIcon>
                  <MenuBookIcon fontSize="small" sx={{ color: '#388e3c' }} />
                </ListItemIcon>
                <ListItemText>{LL.SHOW_ITEMS.ADD_BIBLE_VERSE()}</ListItemText>
              </MenuItem>
            </Menu>

            {isDirty && (
              <Tooltip title={LL.SHOWS.SAVE()}>
                <IconButton size="small" onClick={handleSaveShow} color="warning">
                  <Badge variant="dot" color="warning">
                    <SaveIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title={LL.SHOWS.TITLE()}>
              <IconButton size="small" onClick={() => setOpenShowSwitcher(true)}>
                <ViewListIcon />
              </IconButton>
            </Tooltip>

            <Box flexGrow={1} />

            {/* Musician View */}
            <Tooltip title={LL.MUSICIAN.OPEN()}>
              <IconButton size="small" onClick={() => window.open('/notes', '_blank')}>
                <PdfIcon />
              </IconButton>
            </Tooltip>


            {/* Account Menu */}
            <Tooltip title={LL.HEADER.ACCOUNT_MENU()}>
              <IconButton size="small" onClick={(e) => setAccountMenuAnchor(e.currentTarget)}>
                <AccountCircleIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={accountMenuAnchor}
              open={Boolean(accountMenuAnchor)}
              onClose={() => setAccountMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              {session?.mail && (
                <MenuItem disabled>
                  <ListItemText>
                    <Typography variant="body2" color="text.secondary">
                      {LL.AUTH.LOGGED_IN_AS()}
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {session.mail}
                    </Typography>
                  </ListItemText>
                </MenuItem>
              )}
              {session?.mail && <Divider />}
              {session?.authType === 'oidc_admin' && (
                <MenuItem
                  onClick={() => {
                    setAccountMenuAnchor(null);
                    navigate('/admin');
                  }}
                >
                  <ListItemIcon>
                    <AdminIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Admin</ListItemText>
                </MenuItem>
              )}
              {session?.authType === 'oidc_admin' && <Divider />}
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{LL.AUTH.LOGOUT()}</ListItemText>
              </MenuItem>
            </Menu>

            {/* Settings */}
            <Tooltip title={LL.SETTINGS.SETTINGS()}>
              <IconButton size="small" onClick={() => setOpenSettings(true)}>
                <SettingsIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      {/* ── Item context menu ── */}
      <Menu
        anchorEl={itemMenuAnchor}
        open={Boolean(itemMenuAnchor)}
        onClose={handleItemMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {/* Edit (songs only) */}
        {menuItem?.type === 'song' && menuItemSong && (
          <MenuItem onClick={handleItemEdit}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN.ITEM_EDIT()}</ListItemText>
          </MenuItem>
        )}
        {/* Key submenu */}
        {menuItem?.type === 'song' && (
          <MenuItem onClick={(e) => setKeySubmenuAnchor(e.currentTarget)}>
            <ListItemIcon>
              <MusicNoteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN.ITEM_SELECT_KEY()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        {/* Order submenu */}
        {menuItem?.type === 'song' && menuItemOrders.length > 1 && (
          <MenuItem onClick={(e) => setOrderSubmenuAnchor(e.currentTarget)}>
            <ListItemIcon>
              <FolderOpenIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN.ITEM_SELECT_ORDER()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        {/* Item style submenu (window list) */}
        {windowNames.length > 0 && availableStyles.length > 0 && (
          <MenuItem onClick={(e) => setItemStyleWinAnchor(e.currentTarget)}>
            <ListItemIcon>
              <PaletteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.FOOTER.ITEM_STYLE()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        {menuItem?.type === 'song' && <Divider />}
        {/* Delete */}
        <MenuItem onClick={handleItemRemove}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{LL.MUSICIAN.ITEM_DELETE()}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Key submenu */}
      <Menu
        anchorEl={keySubmenuAnchor}
        open={Boolean(keySubmenuAnchor)}
        onClose={() => setKeySubmenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem onClick={() => handleItemSetKey(undefined)} sx={{ fontSize: '0.85rem' }}>
          <em>None</em>
        </MenuItem>
        {MUSICAL_KEYS.map((k) => (
          <MenuItem key={k} onClick={() => handleItemSetKey(k)} selected={menuItem?.key === k} sx={{ fontSize: '0.85rem' }}>
            {k}
          </MenuItem>
        ))}
      </Menu>

      {/* Order submenu */}
      <Menu
        anchorEl={orderSubmenuAnchor}
        open={Boolean(orderSubmenuAnchor)}
        onClose={() => setOrderSubmenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {menuItemOrders.map((order) => (
          <MenuItem
            key={order}
            onClick={() => handleItemSetOrder(order)}
            selected={parseOrderKey(menuItem?.order).order === order}
            sx={{ fontSize: '0.85rem' }}
          >
            {order}
          </MenuItem>
        ))}
      </Menu>

      {/* Item-style: window list submenu */}
      <Menu
        anchorEl={itemStyleWinAnchor}
        open={Boolean(itemStyleWinAnchor)}
        onClose={() => setItemStyleWinAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {windowNames.map((wname) => (
          <MenuItem
            key={wname}
            onClick={(e) => {
              setItemStyleWindowName(wname);
              setItemStyleStyleAnchor(e.currentTarget);
            }}
            sx={{ fontSize: '0.85rem' }}
          >
            <ListItemText>{wname}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        ))}
      </Menu>

      {/* Item-style: style list submenu (for the chosen window) */}
      <Menu
        anchorEl={itemStyleStyleAnchor}
        open={Boolean(itemStyleStyleAnchor)}
        onClose={() => setItemStyleStyleAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <MenuItem
          onClick={() => handleItemSetStyleForWindow(null)}
          selected={!menuItem?.itemStyleByWindow?.[itemStyleWindowName]}
          sx={{ fontSize: '0.85rem' }}
        >
          <em>{LL.STYLE.NONE()}</em>
        </MenuItem>
        {availableStyles.map((s) => (
          <MenuItem
            key={s.id}
            onClick={() => handleItemSetStyleForWindow(s.id)}
            selected={s.id === menuItem?.itemStyleByWindow?.[itemStyleWindowName]}
            sx={{ fontSize: '0.85rem' }}
          >
            {s.name}
          </MenuItem>
        ))}
      </Menu>

      <DraggableList
        sx={{ overflow: 'auto' }}
        onItemsChanged={(source, destination) => {
          dispatch(reorderShowItems({ source, destination }));

          // Update active item index to follow the dragged item
          if (source === activeItemIndex) {
            dispatch(setActiveItemIndex(destination));
          } else if (source > activeItemIndex && destination <= activeItemIndex) {
            dispatch(setActiveItemIndex(activeItemIndex + 1));
          } else if (source < activeItemIndex && destination >= activeItemIndex) {
            dispatch(setActiveItemIndex(activeItemIndex - 1));
          }
        }}
      >
        {showItems.map((item, i) => {
          const ItemIcon = getShowItemIcon(item.type, item.mediaSubType);
          const itemColor = getShowItemColor(item.type);
          const label = getItemLabel(item, i);

          const isSong = item.type === 'song';
          const itemParsed = parseOrderKey(item.order);
          const itemKey = item.key || itemParsed.key;
          const itemOrder = itemParsed.order;

          return (
            <ListItem
              key={i}
              disablePadding
              onClick={() => {
                if (songClick === 'click') dispatch(setActiveItemIndex(i));
              }}
              onDoubleClick={() => {
                if (songClick === 'double-click') dispatch(setActiveItemIndex(i));
              }}
              secondaryAction={
                <Stack direction="row" gap={0.5} alignItems="center">
                  {/* Read-only chips */}
                  {isSong && itemOrder && itemOrder !== 'Default' && (
                    <Chip
                      label={itemOrder}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        maxWidth: 80,
                        color: i === activeItemIndex ? '#fff' : undefined,
                        borderColor: i === activeItemIndex ? 'rgba(255,255,255,0.5)' : undefined,
                      }}
                    />
                  )}
                  {isSong && itemKey && (
                    <Chip
                      label={itemKey}
                      size="small"
                      sx={{
                        fontSize: '0.65rem',
                        height: 20,
                        backgroundColor: i === activeItemIndex ? 'rgba(255,255,255,0.3)' : 'primary.main',
                        color: '#fff',
                      }}
                    />
                  )}
                  {/* Style badge */}
                  {item.styleId && (
                    <Tooltip title={availableStyles.find((s) => s.id === item.styleId)?.name || LL.STYLE.STYLE()}>
                      <PaletteIcon fontSize="small" sx={{ color: i === activeItemIndex ? '#fff' : 'text.secondary', opacity: 0.7 }} />
                    </Tooltip>
                  )}
                  {/* Per-window style badge */}
                  {item.itemStyleByWindow && Object.values(item.itemStyleByWindow).some((v) => v != null) && (
                    <Tooltip title={LL.FOOTER.ITEM_STYLE()}>
                      <PaletteIcon fontSize="small" sx={{ color: i === activeItemIndex ? 'rgba(255,255,255,0.8)' : 'text.secondary', opacity: 0.8 }} />
                    </Tooltip>
                  )}
                  {/* Context menu button */}
                  <IconButton edge="end" size="small" onClick={(e) => handleItemMenuOpen(e, i)}>
                    <MoreVertIcon fontSize="small" sx={{ color: i === activeItemIndex ? '#fff' : undefined }} />
                  </IconButton>
                </Stack>
              }
              sx={{
                ...(i === activeItemIndex ? { background: palette.primary.main } : {}),
                '&.dragging': { background: palette.primary.dark },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, pl: 1 }}>
                <ItemIcon fontSize="small" sx={{ color: i === activeItemIndex ? '#fff' : itemColor }} />
              </ListItemIcon>
              <ListItemButton sx={{ pl: 0.5 }}>{label}</ListItemButton>
            </ListItem>
          );
        })}
      </DraggableList>
    </Stack>
  );
};

export default Sidebar;
