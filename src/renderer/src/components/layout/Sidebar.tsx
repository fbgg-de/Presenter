import { forwardRef, useEffect, useImperativeHandle, useRef, useState, MouseEvent, ChangeEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Skeleton,
  Snackbar,
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
  Close as CloseIcon,
  BookmarkAddOutlined as SaveToLibraryIcon,
  ViewList as ViewListIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Edit as EditIcon,
  FindInPage as FindFileIcon,
  DriveFileRenameOutline as RenameIcon,
  MusicNote as MusicNoteIcon,
  Lyrics as SongIcon,
  Image as ImageIcon,
  MenuBook as MenuBookIcon,
  Save as SaveIcon,
  AccountCircle as AccountCircleIcon,
  Logout as LogoutIcon,
  RestartAlt as ResetIcon,
  PictureAsPdf as PdfIcon,
  AdminPanelSettings as AdminIcon,
  MoreVert as MoreVertIcon,
  ChevronRight as ChevronRightIcon,
  FolderOpen as FolderOpenIcon,
  Folder as FolderIcon,
  Circle as CircleIcon,
  FileUpload as FileUploadIcon,
  Sync as SyncIcon,
  Smartphone as SmartphoneIcon,
  QueueMusic as SetListIcon,
  InstallDesktop as DesktopAppIcon,
  Wallpaper as BackgroundIcon,
  Collections as SlideshowIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { DesktopAppDownloadModal } from '@/components/settings/DesktopAppBanner';
import { isElectronApp } from '@/utils';
import { agendaText, formatShowDate } from '@/utils/agendaText';
import { copyRichToClipboard } from '@/utils/clipboard';
import { useNavigate } from 'react-router-dom';
import { useStore } from 'react-redux';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ISong } from '@/song';
import { Song } from '@/song';
import { CCLISong } from '@/song';
import { SngSong } from '@/song';
import { Settings } from '@/components/settings/Settings';
import { SongEditor } from '@/components/song/SongEditor';
import { QuickOrderDialog } from '@/components/song/QuickOrderDialog';
import { SongLibrary } from '@/components/song/SongLibrary';
import { Shows } from '@/components/show/Shows';
import { BibleVersePicker } from '@/components/search/BibleVersePicker';
import { MediaBrowser } from '@/components/media/MediaBrowser';
import { getShowItemIcon, getShowItemColor } from '@/utils/showItemIcons';
import { UnifiedSearch } from '@/components/search/UnifiedSearch';
import { useAppDispatch, useAppSelector, type RootState } from '@/store';
import {
  setCurrentShow,
  addShowItem,
  removeShowItem,
  setDirty,
  updateShowItem,
  setShowGroups,
  setOrderAndGroups,
  useGetShow,
} from '@/store/showSlice';
import { ShowGroupList, GroupNameDialog } from '@/components/show/ShowGroupList';
import {
  genGroupId,
  addGroup as addGroupUtil,
  updateGroup,
  toggleGroupCollapsed,
  reorderGroups as reorderGroupsUtil,
  deleteGroup as deleteGroupUtil,
  moveItemFlat,
  moveItemToGroup as moveItemToGroupUtil,
  groupDisplayName,
  groupedView,
  DEFAULT_GROUP_ID,
} from '@/utils/showGroups';
import {
  addSongToStore,
  updateSongInStore,
  setSongsOrder as setSongsOrderAction,
  addToSongsOrder,
  setSongOrders as setSongOrdersAction,
  setCurrentSongOrder as setCurrentSongOrderAction,
  useGetSongs,
} from '@/store/songsSlice';
import { setActiveItemIndex, setKeyboardDisabled, setOpenItemIndex } from '@/store/presentationSlice';
import type { Show, ShowGroup, ShowItem, MediaSubType } from '@/api/shows.api';
import type { SongListItem } from '@/api/songs.api';
import { useSaveShowMutation } from '@/api/shows.api';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetSessionQuery } from '@/api/session.api';
import { useLazyGetSongQuery, useCreateSongMutation, useUpdateSongMutation } from '@/api/songs.api';
import { useMetrics } from '@/hooks/useMetrics';
import { useCcliSongImport } from '@/hooks/useCcliSongImport';
import { useImportLanguage } from '@/hooks/useImportLanguage';
import { useSongUpdatePoller } from '@/hooks/useSongUpdatePoller';
import { useGetMusicianSettings } from '@/store/musicianSlice';
import { loadShowSongs } from '@/store/songsSlice';
import { StyleEditor } from '@/components/style/StyleEditor';
import { useSlideSelect } from '@/hooks/useSlideSelect';
import { useAgendaFileDrop } from '@/components/agenda/useAgendaFileDrop';
import { RelinkMediaDialog } from '@/components/agenda/RelinkMediaDialog';
import { MissingMediaFileIcon } from '@/components/agenda/MissingMediaFileIcon';
import { AgendaAudioButton } from '@/components/agenda/AgendaAudioButton';
import { MediaItemBadges } from '@/components/agenda/MediaItemBadges';
import { MediaHoverPreview } from '@/components/agenda/MediaHoverPreview';
import { GroupSettingsDialog } from '@/components/agenda/GroupSettingsDialog';
import { useAppEvent } from '@/utils/appEvents';
import { useLibraryActions } from '@/components/library/useLibraryActions';
import { mediaItemLabel, newMediaItemData, newSlideshowData, type MediaRole } from '@/media/mediaItem';
import { genItemId } from '@/utils/showGroups';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { WindowManager } from '@/components/layout/WindowManager';
import { SetListManager } from '@/components/setlist/SetListManager';
import { MUSICAL_KEYS, parseOrderKey } from '@/utils/orderKeyUtils';
import { useGetSettings } from '@/store/settingsSlice';
import { useLogout } from '@/hooks/useLogout';
import { LogoutResetDialog } from '@/components/layout/LogoutResetDialog';
import { DEFAULT_SONG_ITEM_COLOR, DEFAULT_MEDIA_ITEM_COLOR, DEFAULT_BIBLE_ITEM_COLOR } from '@/theme';

export interface SidebarHandle {
  openShowSwitcher: () => void;
  openSearch: () => void;
  openAddMenu: (anchor: HTMLElement) => void;
  openMediaBrowser: (subType?: 'image' | 'video') => void;
  openBiblePicker: () => void;
}

export interface SidebarProps {
  /**
   * Operator view: render the toolbar into these elements of the top bar instead of above the
   * list — show actions (search, add, save, shows) and app actions (set lists, account, settings).
   */
  /** Operator top bar slots; `devices` (phone control page, musician view) falls back to `app`. */
  toolbarSlots?: {
    app: HTMLElement | null;
    shows?: HTMLElement | null;
    lists?: HTMLElement | null;
    save?: HTMLElement | null;
    devices?: HTMLElement | null;
  };
  /** Hide the list itself. The component stays mounted, so its dialogs and top-bar actions keep working. */
  collapsed?: boolean;
  /** Operator view: column width in pixels (resized at its edge). */
  width?: number;
}

/** An agenda row's marks — live, opened, previewed — each row subscribed to its own. */
const AgendaRowState = ({
  index,
  children,
}: {
  index: number;
  children: (marks: { active: boolean; open: boolean; previewed: boolean }) => ReactNode;
}) => {
  const active = useAppSelector((state) => state.presentation.activeItemIndex === index);
  // As useOpenItem: the opened entry, else the live one; an index past the end falls back.
  const open = useAppSelector((state) => {
    const { openItemIndex, activeItemIndex } = state.presentation;
    const count = state.show.currentShow?.order?.length ?? 0;
    return (openItemIndex !== null && openItemIndex < count ? openItemIndex : activeItemIndex) === index;
  });
  const previewed = useAppSelector((state) => state.presentation.previewTarget?.itemIndex === index);
  return <>{children({ active, open, previewed })}</>;
};

const Sidebar = forwardRef<SidebarHandle, SidebarProps>(({ toolbarSlots, collapsed = false, width }, ref) => {
  const { palette } = useTheme();
  const navigate = useNavigate();

  const { songClick, operatorMode } = useGetSettings('songClick', 'operatorMode');
  /** Live mode locks the set list: no adding, reordering or item menus while the service runs. */
  const locked = operatorMode === 'live';
  const { currentShow, isDirty } = useGetShow();
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();

  const dispatch = useAppDispatch();

  // Redux state
  // The live entry is read when a handler runs; each row follows its own marks (AgendaRowState),
  // so a slide or entry change does not re-render the whole sidebar and its dialogs.
  const store = useStore<RootState>();
  const liveIndex = () => store.getState().presentation.activeItemIndex;
  const { select: selectSlide } = useSlideSelect();
  const { songs } = useGetSongs();

  const { LL, locale } = useI18nContext();
  const { trackEvent } = useMetrics();

  const [openSettings, _setOpenSettings] = useState(false);
  const [openSongEditor, _setOpenSongEditor] = useState(false);
  const [openShowSwitcher, _setOpenShowSwitcher] = useState(false);
  const [openSongSearch, setOpenSongSearch] = useState(false);
  const [openSongLibrary, _setOpenSongLibrary] = useState(false);
  const [openBiblePicker, _setOpenBiblePicker] = useState(false);
  const [openMediaBrowser, _setOpenMediaBrowser] = useState(false);
  const [mediaBrowserPickType, setMediaBrowserPickType] = useState<'image' | 'video' | 'any'>('any');
  const [songToEdit, _setSongToEdit] = useState<ISong>();
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);
  /** When set, the StyleEditor opens directly in edit view for this style (direct edit from item menus). */
  const [styleEditorEditId, setStyleEditorEditId] = useState<number | undefined>(undefined);
  const [windowManagerOpen, setWindowManagerOpen] = useState(false);
  const [setListsOpen, setSetListsOpen] = useState(false);
  /** Error message shown when a song file import fails. */
  const [importErrorMsg, setImportErrorMsg] = useState<string | null>(null);
  /** Result notification for the ChurchTools event-agenda sync on save. */
  const [syncMsg, setSyncMsg] = useState<{ severity: 'success' | 'warning'; text: string } | null>(null);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);
  /** Desktop app download dialog — reached from the account menu instead of a banner row. */
  const [desktopAppOpen, setDesktopAppOpen] = useState(false);

  const { data: session } = useGetSessionQuery();
  // The account name is what the user picks on the login page, so it is the more
  // recognisable label here; the mail address is only a fallback for accounts without one.
  const accountLabel = session?.name || session?.mail || '';
  const bibleEnabled = session?.settings?.bibleEnabled ?? false;
  const churchToolsEnabled = session?.settings?.churchToolsEnabled ?? false;
  // Detect songs that were changed on the server since they were cached locally.
  // While following remote commands nobody is at this screen to confirm, so adopt them directly.
  const { midiTrackingMaster } = useGetMusicianSettings();
  const { updatedSongNumbers, reloadSong } = useSongUpdatePoller({ autoReload: midiTrackingMaster === 'midi' });
  const [fetchSong] = useLazyGetSongQuery();

  // Add menu
  const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
  const addMenuOpen = Boolean(addMenuAnchor);
  /**
   * Where "Add item" puts what is added next (search results, media, verses, new songs). It sticks
   * until another group's "Add item" is used or it is cleared in the search, so several songs in a
   * row land in the same group.
   */
  const [addTargetGroup, setAddTargetGroup] = useState<string | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    openShowSwitcher: () => setOpenShowSwitcher(true),
    openSearch: () => openSearch(),
    openAddMenu: (anchor: HTMLElement) => setAddMenuAnchor(anchor),
    openMediaBrowser: (subType?: 'image' | 'video') => {
      setMediaBrowserPickType(subType ?? 'any');
      setOpenMediaBrowser(true);
    },
    openBiblePicker: () => setOpenBiblePicker(true),
  }));

  const [saveShowMutation] = useSaveShowMutation();
  const [createSongMutation] = useCreateSongMutation();
  const [updateSongMutation] = useUpdateSongMutation();
  const { resolveImportLanguage, importLanguageDialog } = useImportLanguage();
  const importCcliSong = useCcliSongImport(resolveImportLanguage);
  // True while a CCLI SongSelect import is resolving — drives a placeholder row in the list.
  const [isImportingCcli, setIsImportingCcli] = useState(false);
  const { data: availableStyles = [] } = useGetStylesQuery();

  /**
   * Import a CCLI SongSelect suggestion into the local library and add it to the show.
   * The CCLI number is used as the song number; if a song with that CCLI number already
   * exists locally it is added directly without re-importing. Author/copyright come from
   * the search result; lyrics (when available) are resolved via the CCLI detail endpoint.
   */
  const handleChurchToolsSongSelected = async (
    ccliNumber: number,
    name: string,
    meta?: { author?: string | null; copyright?: string | null },
  ) => {
    setOpenSongSearch(false);
    setIsImportingCcli(true);
    try {
      const res = await importCcliSong(ccliNumber, name, meta);
      if (!res.ok) {
        setImportErrorMsg(
          `${name}: ${res.isDuplicate ? LL.SONGS.IMPORT_ERROR_DUPLICATE() : LL.SONGS.IMPORT_ERROR()}${res.serverMessage && !res.isDuplicate ? ` (${res.serverMessage})` : ''}`,
        );
      }
    } finally {
      setIsImportingCcli(false);
    }
  };

  // Item context menu state
  const [itemMenuAnchor, setItemMenuAnchor] = useState<null | HTMLElement>(null);
  const [itemMenuIndex, setItemMenuIndex] = useState<number>(-1);
  const [keySubmenuAnchor, setKeySubmenuAnchor] = useState<null | HTMLElement>(null);
  // "Rename" dialog for media items (index captured before the menu closes)
  const [renameIndex, setRenameIndex] = useState<number>(-1);
  // "Find file…" for a media entry whose file moved (index captured before the menu closes)
  const [relinkIndex, setRelinkIndex] = useState<number>(-1);
  // "Edit text" dialog for Bible verses (index captured before the menu closes)
  const [verseTextIndex, setVerseTextIndex] = useState<number>(-1);
  const [orderSubmenuAnchor, setOrderSubmenuAnchor] = useState<null | HTMLElement>(null);
  // "Move to group" submenu (from the item context menu).
  const [groupSubmenuAnchor, setGroupSubmenuAnchor] = useState<null | HTMLElement>(null);
  const [quickOrderDialogOpen, setQuickOrderDialogOpen] = useState(false);
  const [quickOrderContext, setQuickOrderContext] = useState<{ itemIndex: number; songNumber: number; orderName: string } | null>(null);

  const logout = useLogout();
  const [logoutResetOpen, setLogoutResetOpen] = useState(false);

  const handleLogout = () => {
    setAccountMenuAnchor(null);
    logout();
  };

  const handleSaveShow = async () => {
    if (!currentShow) return;
    try {
      // Don't send eventId here — this isn't where the event link is chosen, so omitting it
      // lets the backend preserve the existing link (only the event picker dialogs change it).
      // The save endpoint reconciles the linked event's agenda itself (every save → in sync).
      const result = await saveShowMutation({
        title: currentShow.title,
        order: currentShow.order,
        groups: currentShow.groups,
        styleId: currentShow.styleId ?? null,
      }).unwrap();
      dispatch(setDirty(false));
      trackEvent('show_saved', 'show', currentShow.title);

      const eventSync = result.eventSync;
      if (eventSync) {
        setSyncMsg(
          eventSync.ok
            ? { severity: 'success', text: LL.SHOWS.EVENT_SYNCED() }
            : { severity: 'warning', text: LL.SHOWS.EVENT_SYNC_FAILED() },
        );
      }
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
      const result = await fetchSong({ songNumber: song.songNumber });
      const fullSong = result.data;

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

        dispatch(addSongToStore(songToAdd));
        dispatch(addToSongsOrder(songToAdd.songNumber));
        dispatch(
          addShowItem({
            type: 'song',
            songNumber: songToAdd.songNumber,
            order: 'Default',
            groupId: addTargetGroup,
          }),
        );

        trackEvent('song_selected', 'song', String(songToAdd.songNumber), { title: songToAdd.title });
        noteAdded(songToAdd.title);
      }
    } catch (error) {
      console.error('Failed to fetch song:', error);
    }
  };

  /**
   * `text` is the verse text from the picker. It is what the item shows (and what `---` pages
   * split); without it — a search result — the reference stands in.
   */
  const handleBibleVerseAdd = (bibleRef: string, bibleTranslation: string, label: string, text?: string) => {
    dispatch(
      addShowItem({
        type: 'bible_verse',
        bibleRef,
        bibleTranslation,
        label: text || label,
        groupId: addTargetGroup,
      }),
    );
    trackEvent('bible_verse_added', 'bible', bibleRef);
    noteAdded(label || bibleRef);
  };

  // Role of the next media added from the add menu: "Add background" picks one.
  const [mediaAddRole, setMediaAddRole] = useState<MediaRole>('content');
  // A media entry just added from the menu opens once it is in the agenda, so its settings show
  // without another click.
  const [openWhenAdded, setOpenWhenAdded] = useState<string | null>(null);
  useEffect(() => {
    if (!openWhenAdded) return;
    const index = currentShow?.order.findIndex((entry) => entry.id === openWhenAdded) ?? -1;
    if (index < 0) return;
    dispatch(setOpenItemIndex(index));
    setOpenWhenAdded(null);
  }, [openWhenAdded, currentShow?.order, dispatch]);

  const handleSlideshowAdd = () => {
    const id = genItemId();
    dispatch(
      addShowItem({
        id,
        type: 'media',
        mediaSubType: 'slideshow',
        label: LL.SHOW_ITEMS.SLIDESHOW(),
        media: newSlideshowData([], { groups: screenGroups }),
        groupId: addTargetGroup,
      }),
    );
    setOpenWhenAdded(id);
    noteAdded(LL.SHOW_ITEMS.SLIDESHOW());
  };

  const handleMediaAdd = (mediaSubType: MediaSubType, mediaPath?: string, mediaColor?: string, label?: string) => {
    const id = genItemId();
    dispatch(
      addShowItem({
        id,
        type: 'media',
        mediaSubType,
        mediaColor,
        mediaPath,
        ...((mediaSubType === 'image' || mediaSubType === 'video') && mediaPath
          ? { media: newMediaItemData(mediaSubType, mediaPath, { groups: screenGroups, role: mediaAddRole }) }
          : {}),
        // A name given on add wins; otherwise the path/color doubles as the label.
        label: label || (mediaSubType === 'color' ? mediaColor : mediaPath),
        groupId: addTargetGroup,
      }),
    );
    trackEvent('media_added', 'media', mediaPath || mediaColor);
    noteAdded(label || mediaPath || mediaColor || '');
    setOpenWhenAdded(id);
  };

  const handleShowSwitch = async (show: Show | null, isNew: boolean, override?: boolean) => {
    if (show) {
      if (isNew || override) {
        try {
          const orderToSave: ShowItem[] = override ? (currentShow?.order ?? []) : [];

          await saveShowMutation({
            title: show.title,
            order: orderToSave,
            groups: override ? currentShow?.groups : show.groups,
            styleId: override ? (currentShow?.styleId ?? null) : (show.styleId ?? null),
            eventId: (override ? currentShow?.eventId : show.eventId) ?? null,
            eventName: (override ? currentShow?.eventName : show.eventName) ?? null,
            // Sent on creation so a show made with bands keeps them; the later auto-saves
            // omit the field entirely, which is what preserves them.
            bandIds: (override ? currentShow?.bandIds : show.bandIds) ?? [],
          }).unwrap();
        } catch (error) {
          console.error('Failed to create new show:', error);
          return;
        }
      }

      dispatch(setCurrentShow(show));
      dispatch(setActiveItemIndex(0));

      if (!isNew && !override) {
        await dispatch(loadShowSongs(show));
      } else if (!override) {
        dispatch(setSongsOrderAction([]));
        dispatch(setSongOrdersAction({}));
      }
    }
  };

  /** Extension check that ignores case — Windows happily hands over `LIED.SNG` or `Song.TXT`. */
  const hasExtension = (file: File, ext: string): boolean => file.name.toLowerCase().endsWith(ext);
  const isSngFile = (file: File): boolean => hasExtension(file, '.sng');

  /**
   * Returns true for files this sidebar can import (CCLI .txt or SongBeamer .sng). Decided by
   * extension alone: the reported MIME type is empty or arbitrary for both depending on the
   * OS, so requiring `text/plain` turned valid .txt files away.
   */
  const isSupportedSongFile = (file: File): boolean => hasExtension(file, '.txt') || isSngFile(file);

  /** Parse a supported song file into an ISong. */
  const parseSongFile = (file: File, content: string): ISong => (isSngFile(file) ? SngSong(content) : CCLISong(file.name, content));

  /** Read and import a single supported song file into the store. */
  const importSongFile = (file: File) => {
    // SongBeamer files are often saved in Windows-1252 (CP1252) rather than UTF-8.
    // Strategy: read as UTF-8 first; if the result contains the Unicode replacement
    // character (U+FFFD) indicating a mis-decode, re-read with windows-1252.
    const doImport = async (content: string) => {
      const parsed = parseSongFile(file, content);

      // Imported files do not say what language they are in, so it is read off the lyrics and
      // written onto every line. Only an ambiguous result interrupts with a dialog.
      const resolved = await resolveImportLanguage(parsed.blocks, parsed.title);
      if (!resolved) return;
      parsed.blocks = resolved.blocks;
      parsed.languages = resolved.languages;

      try {
        // Always upload to the backend so it assigns the canonical song number.
        // Omit songNumber entirely — the backend defaults to 0 and auto-generates one.
        const result = await createSongMutation({
          title: parsed.title,
          authors: parsed.authors,
          copyright: parsed.copyright,
          initialOrder: parsed.initialOrder ?? [],
          order: parsed.order,
          blocks: parsed.blocks,
          languages: parsed.languages,
        }).unwrap();

        const savedSong = new Song({ ...parsed, songNumber: result.songNumber });
        dispatch(addSongToStore(savedSong));
        dispatch(addToSongsOrder(savedSong.songNumber));
        dispatch(addShowItem({ type: 'song', songNumber: savedSong.songNumber, order: 'Default' }));
        trackEvent('song_imported', 'song', String(result.songNumber), {
          source: isSngFile(file) ? 'sng' : 'ccli_txt',
        });
      } catch (err) {
        console.error('Failed to upload imported song:', err);
        const serverMessage =
          err != null && typeof err === 'object' && 'data' in err
            ? String((err as { data?: { message?: string } }).data?.message ?? '')
            : '';
        // Detect duplicate CCLI number error from the server
        const isDuplicate = serverMessage.toLowerCase().includes('already exists');
        setImportErrorMsg(
          `${file.name}: ${isDuplicate ? LL.SONGS.IMPORT_ERROR_DUPLICATE() : LL.SONGS.IMPORT_ERROR()}${serverMessage && !isDuplicate ? ` (${serverMessage})` : ''}`,
        );
      }
    };

    const reader = new FileReader();
    reader.onload = (ev) => {
      const utf8Result = ev.target?.result?.toString() ?? '';
      if (utf8Result.includes('\uFFFD') && isSngFile(file)) {
        // Re-read with Windows-1252 encoding fallback
        const fallbackReader = new FileReader();
        fallbackReader.onload = (ev2) => void doImport(ev2.target?.result?.toString() ?? '');
        fallbackReader.readAsText(file, 'windows-1252');
      } else {
        void doImport(utf8Result);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // Show items from the current show
  const showItems = currentShow?.order ?? [];

  // Files dropped onto the agenda: songs are imported, media land in the group under the pointer.
  const library = useLibraryActions({ show: currentShow, locked });
  const agendaDrop = useAgendaFileDrop({
    groups: currentShow?.groups ?? [],
    disabled: locked,
    importSongFile,
  });

  // Ref for the hidden file-input used by the drop-zone click handler
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    [...(e.target.files ?? [])].filter(isSupportedSongFile).forEach(importSongFile);
    // Reset so the same file can be re-selected
    e.target.value = '';
  };

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
        if (item.mediaSubType === 'color') return item.label || item.mediaColor || LL.MEDIA.COLOR();
        return item.label || item.mediaPath || LL.MEDIA.IMAGE();
      default:
        return `Item ${index + 1}`;
    }
  };

  // ── Item group handlers ──
  const groups = currentShow?.groups ?? [];

  // Drag & drop: move an item within/across groups, keeping the presented item stable.
  const handleMoveItem = (from: number, to: number, targetGroupId: string) => {
    const res = moveItemFlat(showItems, from, to, targetGroupId, liveIndex());
    if (res) {
      dispatch(setOrderAndGroups({ order: res.order, groups }));
      dispatch(setActiveItemIndex(res.activeIndex));
    }
  };

  // Drag & drop: move a whole group block to another group's position.
  const handleReorderGroup = (sourceId: string, targetId: string) => {
    const res = reorderGroupsUtil(showItems, groups, sourceId, targetId, liveIndex());
    if (res) {
      dispatch(setOrderAndGroups({ order: res.order, groups: res.groups }));
      dispatch(setActiveItemIndex(res.activeIndex));
    }
  };

  const handleToggleGroupCollapse = (id: string) => dispatch(setShowGroups(toggleGroupCollapsed(groups, id)));
  const handleAddGroup = (name: string) => dispatch(setShowGroups(addGroupUtil(groups, { id: genGroupId(), name, collapsed: false })));
  const handleRenameGroup = (id: string, name: string) => dispatch(setShowGroups(updateGroup(groups, id, { name })));
  // The group whose settings dialog is open, with how many entries it has.
  const [settingsGroup, setSettingsGroup] = useState<{
    group: ShowGroup;
    count: number;
    tab?: 'general' | 'theme' | 'playback';
  } | null>(null);
  // The side panel asks for these: the group settings of an entry's group, the theme editor.
  useAppEvent('presenter:group-settings', ({ groupId, tab }) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const count = showItems.filter((entry) => (entry.groupId ?? DEFAULT_GROUP_ID) === groupId).length;
    setSettingsGroup({ group, count, tab });
  });
  useAppEvent('presenter:edit-style', ({ styleId }) => {
    setStyleEditorEditId(styleId);
    setStyleEditorOpen(true);
  });

  const handleDeleteGroup = (id: string) => {
    const res = deleteGroupUtil(showItems, groups, id, liveIndex());
    if (res) {
      dispatch(setOrderAndGroups({ order: res.order, groups: res.groups }));
      dispatch(setActiveItemIndex(res.activeIndex));
    }
  };

  const handleMoveItemToGroup = (itemIndex: number, groupId: string) => {
    const res = moveItemToGroupUtil(showItems, groups, itemIndex, groupId, liveIndex());
    if (res) {
      dispatch(setOrderAndGroups({ order: res.order, groups }));
      dispatch(setActiveItemIndex(res.activeIndex));
    }
  };

  // One item row in the sidebar. `i` is the item's index into the flat order.
  const renderItemRow = (item: ShowItem, i: number) => {
    const ItemIcon = getShowItemIcon(item.type, item.mediaSubType);
    const itemColor = getShowItemColor(item.type);
    const label = getItemLabel(item, i);

    const isSong = item.type === 'song';
    const itemParsed = parseOrderKey(item.order);
    const itemKey = item.key || itemParsed.key;
    const itemOrder = itemParsed.order;
    return (
      <AgendaRowState key={i} index={i}>
        {({ active, open, previewed }) => (
          <ListItem
            data-agenda-index={i}
            disablePadding
            // A click opens the entry to look at or edit it; nothing reaches the screens. A double
            // click (or a click in Live with "Go live with: click") puts its first slide on screen.
            onClick={() => {
              dispatch(setOpenItemIndex(i));
              if (songClick === 'click' && locked) selectSlide(i, 0);
            }}
            onDoubleClick={() => selectSlide(i, 0)}
            sx={{
              ...(active ? { background: palette.primary.main } : {}),
              // Open in the operator view but not on screen.
              ...(open && !active ? { bgcolor: 'action.selected', boxShadow: `inset 3px 0 0 ${palette.primary.main}` } : {}),
              // Picked for the preview but not live yet (preview before live).
              ...(previewed && !active ? { outline: `2px dashed ${palette.primary.main}`, outlineOffset: -2 } : {}),
              '&.dragging': { background: palette.primary.dark },
            }}
          >
            {/* Icon and trailing chips live inside the button so hover/ripple cover the
                whole row, and so a long label ellipsises instead of running under them. */}
            <ListItemButton sx={{ pl: 1, pr: 0.5, minWidth: 0 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <MediaHoverPreview item={item}>
                  <ItemIcon fontSize="small" sx={{ color: active ? '#fff' : itemColor }} />
                </MediaHoverPreview>
              </ListItemIcon>
              <ListItemText
                title={label}
                primary={label}
                secondary={
                  item.type === 'media' &&
                  (item.mediaSubType === 'image' || item.mediaSubType === 'video' || item.mediaSubType === 'slideshow') ? (
                    <MediaItemBadges item={item} index={i} inverted={active} />
                  ) : undefined
                }
                slotProps={{
                  primary: { noWrap: true, sx: { color: active ? '#fff' : undefined } },
                  secondary: { component: 'div' },
                }}
                sx={{ my: 0, minWidth: 0 }}
              />
              <Stack
                direction="row"
                sx={{
                  gap: 0.5,
                  ml: 0.5,
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
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
                      color: active ? '#fff' : undefined,
                      borderColor: active ? 'rgba(255,255,255,0.5)' : undefined,
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
                      backgroundColor: active ? 'rgba(255,255,255,0.3)' : 'primary.main',
                      color: '#fff',
                    }}
                  />
                )}
                {/* Server-side song update available */}
                {isSong && item.songNumber != null && updatedSongNumbers[item.songNumber] && (
                  <Tooltip title={LL.SHOW_ITEMS.SONG_UPDATED()}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        void reloadSong(item.songNumber!);
                      }}
                      sx={{ p: 0.25 }}
                    >
                      <SyncIcon fontSize="small" color="warning" />
                    </IconButton>
                  </Tooltip>
                )}
                {/* Audio plays from the row, without opening the entry */}
                {item.type === 'media' && item.mediaSubType === 'audio' && item.mediaPath && (
                  <AgendaAudioButton item={item} inverted={active} />
                )}
                {/* The media file is not where the entry points */}
                {item.type === 'media' && item.mediaPath && item.mediaSubType !== 'color' && (
                  <MissingMediaFileIcon path={item.mediaPath} inverted={active} />
                )}
                {/* Context menu button — every entry in it edits the show, so it is gone in Live */}
                {!locked && (
                  <IconButton size="small" onClick={(e) => handleItemMenuOpen(e, i)} sx={{ p: 0.25 }}>
                    <MoreVertIcon fontSize="small" sx={{ color: active ? '#fff' : undefined }} />
                  </IconButton>
                )}
              </Stack>
            </ListItemButton>
          </ListItem>
        )}
      </AgendaRowState>
    );
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
    setGroupSubmenuAnchor(null);
  };

  const handleItemRemove = () => {
    if (itemMenuIndex >= 0) {
      dispatch(setOpenItemIndex(null));
      dispatch(removeShowItem(itemMenuIndex));
      const activeItemIndex = liveIndex();
      if (activeItemIndex > 0 && itemMenuIndex <= activeItemIndex) {
        dispatch(setActiveItemIndex(activeItemIndex - 1));
      }
    }
    handleItemMenuClose();
  };

  /** Give a media item a short display name (empty resets it to the path/URL). */
  const handleItemRename = (name: string) => {
    if (renameIndex < 0) return;
    const item = showItems[renameIndex];
    const fallback = item?.mediaSubType === 'color' ? item.mediaColor : item?.mediaPath;
    dispatch(updateShowItem({ index: renameIndex, item: { label: name || fallback } }));
    setRenameIndex(-1);
  };

  const handleItemSetKey = (key: string | undefined) => {
    if (itemMenuIndex >= 0) {
      dispatch(updateShowItem({ index: itemMenuIndex, item: { key } }));
    }
    setKeySubmenuAnchor(null);
    handleItemMenuClose();
  };

  const saveCurrentShow = async (orderOverride?: ShowItem[]) => {
    if (!currentShow) return;
    try {
      // Omit eventId so the backend preserves the existing ChurchTools event link
      // (this auto-save fires on reorder/key changes, not when choosing an event).
      await saveShowMutation({
        title: currentShow.title,
        order: orderOverride ?? currentShow.order,
        groups: currentShow.groups,
        styleId: currentShow.styleId ?? null,
      }).unwrap();
      dispatch(setDirty(false));
    } catch (error) {
      console.error('Failed to save show:', error);
    }
  };

  const handleItemSetOrder = async (order: string) => {
    if (itemMenuIndex >= 0) {
      const item = showItems[itemMenuIndex];
      if (item.songNumber != null) {
        dispatch(setCurrentSongOrderAction({ songNumber: item.songNumber, orderName: order }));
      }
      dispatch(updateShowItem({ index: itemMenuIndex, item: { order } }));
      const nextShowOrder = showItems.map((showItem, idx) => (idx === itemMenuIndex ? { ...showItem, order } : showItem));
      await saveCurrentShow(nextShowOrder);
    }
    setOrderSubmenuAnchor(null);
    handleItemMenuClose();
  };

  const handleQuickOrderSave = async (orderName: string, nextOrders: Record<string, string[]>) => {
    if (!quickOrderContext) return;
    const sourceSong = songs[quickOrderContext.songNumber];
    if (!sourceSong) return;

    const updatedSong = new Song({
      ...sourceSong,
      order: nextOrders,
      initialOrder: sourceSong.initialOrder,
    });

    await updateSongMutation({
      songNumber: updatedSong.songNumber,
      title: updatedSong.title,
      authors: updatedSong.authors,
      copyright: updatedSong.copyright,
      initialOrder: updatedSong.initialOrder || [],
      order: updatedSong.order,
      blocks: updatedSong.blocks,
    }).unwrap();

    dispatch(updateSongInStore(updatedSong));
    trackEvent('song_updated', 'song', String(updatedSong.songNumber), { via: 'order' });
    dispatch(setCurrentSongOrderAction({ songNumber: updatedSong.songNumber, orderName }));
    dispatch(updateShowItem({ index: quickOrderContext.itemIndex, item: { order: orderName } }));
    const nextShowOrder = showItems.map((showItem, idx) =>
      idx === quickOrderContext.itemIndex ? { ...showItem, order: orderName } : showItem,
    );
    await saveCurrentShow(nextShowOrder);
    setQuickOrderDialogOpen(false);
    setQuickOrderContext(null);
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
  const renameItem = renameIndex >= 0 ? showItems[renameIndex] : undefined;
  const renameFallback = (renameItem?.mediaSubType === 'color' ? renameItem.mediaColor : renameItem?.mediaPath) ?? '';

  /** The toolbar above the list, or split into the operator top bar's slots. */
  const renderToolbar = (parts: { shows: ReactNode; lists: ReactNode; save: ReactNode; devices: ReactNode; app: ReactNode }) => {
    if (toolbarSlots) {
      // The operator top bar places each group itself; a slot it does not offer falls back to `app`.
      const into = (content: ReactNode, slot: HTMLElement | null | undefined) =>
        slot ? createPortal(content, slot) : toolbarSlots.app && createPortal(content, toolbarSlots.app);
      return (
        <>
          {into(parts.save, toolbarSlots.save)}
          {into(parts.app, toolbarSlots.app)}
          {into(parts.shows, toolbarSlots.shows)}
          {into(parts.devices, toolbarSlots.devices)}
          {into(parts.lists, toolbarSlots.lists)}
        </>
      );
    }
    return (
      <Stack
        direction="row"
        sx={{
          p: 1,
          alignItems: 'center',
          background: palette.background.paper,
          minHeight: '56px',
          flexWrap: 'wrap',
        }}
      >
        {parts.save}
        {parts.shows}
        {parts.lists}
        <Box sx={{ flexGrow: 1 }} />
        {parts.devices}
        {parts.app}
      </Stack>
    );
  };

  /** What was just added, and where — the search stays open, so this is the only feedback. */
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const noteAdded = (name: string) => {
    const group = groups.find((entry) => entry.id === addTargetGroup);
    setAddedNote(
      group
        ? LL.SHOW_ITEMS.ADDED_TO_GROUP({ name, group: groupDisplayName(group, LL.SHOW_GROUPS.DEFAULT()) })
        : LL.SHOW_ITEMS.ADDED({ name }),
    );
  };

  /** The whole agenda, grouped, onto the clipboard — to paste into a messenger or a mail to the team. */
  const handleCopyAgenda = async () => {
    if (!currentShow) return;
    const label = (item: ShowItem): string => {
      if (item.type === 'song') {
        const title = (item.songNumber != null ? songs[item.songNumber]?.title : undefined) ?? item.label ?? `#${item.songNumber ?? ''}`;
        return item.key ? `${title} (${item.key})` : title;
      }
      if (item.type === 'bible_verse') {
        const ref = item.bibleRef || item.label || LL.BIBLE.VERSE();
        return item.bibleTranslation ? `${ref} (${item.bibleTranslation})` : ref;
      }
      if (item.mediaSubType === 'color') return item.label || item.mediaColor || LL.MEDIA.COLOR();
      return mediaItemLabel(item) || LL.MEDIA.IMAGE();
    };
    const { text, html } = agendaText(
      { title: currentShow.title, date: formatShowDate(currentShow.date, locale) || undefined },
      groupedView(showItems, groups).map(({ group, items }) => ({ name: group.name ?? '', items: items.map(({ item }) => label(item)) })),
      LL.SHOW_GROUPS.DEFAULT(),
    );
    setAddedNote((await copyRichToClipboard(text, html)) ? LL.SHOWS.AGENDA_COPIED() : LL.SHOWS.AGENDA_COPY_FAILED());
  };

  const openSearch = (groupId?: string) => {
    if (groupId) setAddTargetGroup(groupId);
    setOpenSongSearch(true);
  };

  return (
    <Stack
      {...agendaDrop.dropProps}
      sx={{
        position: 'relative',
        // 400px is the desktop column, where the sidebar sits beside the control pane and
        // must not shrink. Below `sm` it is its own full-screen tab, and holding 400 there
        // pushed the toolbar off a 375px screen — the settings gear ended up half visible.
        // The breakpoint matches useIsMobile(), which is what swaps the two layouts.
        // In the operator view the toolbar lives in the top bar, so the list can be narrower.
        width: collapsed ? 0 : { xs: '100%', sm: toolbarSlots ? (width ?? 320) : 400 },
        minWidth: collapsed ? 0 : { xs: 0, sm: toolbarSlots ? (width ?? 320) : 400 },
        overflow: collapsed ? 'hidden' : undefined,
        borderRight: toolbarSlots && !collapsed ? 1 : 0,
        borderColor: 'divider',
        background: palette.background.default,
      }}
    >
      {agendaDrop.overlay}
      {agendaDrop.dialogs}
      {library.panel}
      {library.dialogs}
      <GroupSettingsDialog
        group={settingsGroup?.group ?? null}
        itemCount={settingsGroup?.count ?? 0}
        styles={availableStyles}
        showStyle={availableStyles.find((s) => s.id === currentShow?.styleId)}
        onClose={() => setSettingsGroup(null)}
        onSave={(patch) => {
          if (settingsGroup) dispatch(setShowGroups(updateGroup(groups, settingsGroup.group.id, patch)));
          setSettingsGroup(null);
        }}
        onSaveToLibrary={(group) => library.saveGroup(group)}
        initialTab={settingsGroup?.tab}
        onEditTheme={(styleId, patch) => {
          if (settingsGroup) dispatch(setShowGroups(updateGroup(groups, settingsGroup.group.id, patch)));
          setSettingsGroup(null);
          setStyleEditorEditId(styleId);
          setStyleEditorOpen(true);
        }}
      />
      <RelinkMediaDialog
        item={relinkIndex >= 0 ? showItems[relinkIndex] : undefined}
        onClose={() => setRelinkIndex(-1)}
        onRelink={(mediaPath, mediaSubType) => {
          dispatch(updateShowItem({ index: relinkIndex, item: { mediaPath, mediaSubType } }));
          setRelinkIndex(-1);
        }}
      />
      {/* What the search just added, and into which group */}
      <Snackbar
        open={addedNote !== null}
        autoHideDuration={4000}
        onClose={() => setAddedNote(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setAddedNote(null)} sx={{ width: '100%' }}>
          {addedNote}
        </Alert>
      </Snackbar>

      {/* Import error notification */}
      <Snackbar
        open={importErrorMsg !== null}
        autoHideDuration={8000}
        onClose={() => setImportErrorMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setImportErrorMsg(null)} sx={{ width: '100%' }}>
          {importErrorMsg}
        </Alert>
      </Snackbar>
      {/* ChurchTools event sync notification */}
      <Snackbar
        open={syncMsg !== null}
        autoHideDuration={6000}
        onClose={() => setSyncMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={syncMsg?.severity ?? 'success'} onClose={() => setSyncMsg(null)} sx={{ width: '100%' }}>
          {syncMsg?.text}
        </Alert>
      </Snackbar>
      <Settings open={openSettings} setOpen={setOpenSettings} />
      <SongEditor
        open={openSongEditor}
        setOpen={setOpenSongEditor}
        song={songToEdit}
        onSongCreated={(createdSong) => {
          dispatch(addToSongsOrder(createdSong.songNumber));
          if (currentShow) {
            dispatch(addShowItem({ type: 'song', songNumber: createdSong.songNumber, order: 'Default', groupId: addTargetGroup }));
          }
        }}
      />
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
      <MediaBrowser
        open={openMediaBrowser}
        onClose={() => {
          setOpenMediaBrowser(false);
          setMediaAddRole('content');
        }}
        onAdd={handleMediaAdd}
        pickType={mediaAddRole === 'background' ? 'any' : mediaBrowserPickType}
      />
      <StyleEditor
        open={styleEditorOpen}
        onClose={() => {
          setStyleEditorOpen(false);
          setStyleEditorEditId(undefined);
        }}
        editStyleId={styleEditorEditId}
      />
      <WindowManager open={windowManagerOpen} onClose={() => setWindowManagerOpen(false)} />
      <SetListManager open={setListsOpen} onClose={() => setSetListsOpen(false)} />
      {/* Search: a drawer from the right, like settings and set lists. */}
      <Drawer
        anchor="right"
        open={openSongSearch && !locked}
        onClose={() => {
          setOpenSongSearch(false);
        }}
      >
        <Stack sx={{ width: { xs: '100vw', sm: 'min(96vw, 520px)' }, height: '100%' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 2, pt: 2, pb: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {LL.UNIFIED_SEARCH.TITLE()}
            </Typography>
            {/* Where what is picked lands, when the search was opened from a group. */}
            {addTargetGroup && (
              <Chip
                size="small"
                variant="outlined"
                color="primary"
                label={LL.SHOW_ITEMS.ADDING_TO({
                  group: groupDisplayName(
                    groups.find((entry) => entry.id === addTargetGroup) ?? { id: DEFAULT_GROUP_ID, name: '', collapsed: false },
                    LL.SHOW_GROUPS.DEFAULT(),
                  ),
                })}
                onDelete={() => setAddTargetGroup(undefined)}
                sx={{ maxWidth: 220 }}
              />
            )}
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              onClick={() => {
                setOpenSongSearch(false);
              }}
              aria-label={LL.COMMON.CLOSE()}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
          <Divider />
          <Box sx={{ flex: 1, minHeight: 0, px: 2, py: 1.5 }}>
            <UnifiedSearch
              variant="panel"
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
              onOpenMediaBrowser={() => {
                setOpenSongSearch(false);
                setMediaBrowserPickType('any');
                setOpenMediaBrowser(true);
              }}
              churchToolsEnabled={churchToolsEnabled}
              onSelectChurchToolsSong={(id, name, meta) => void handleChurchToolsSongSelected(id, name, meta)}
            />
          </Box>
        </Stack>
      </Drawer>

      {/* Add item — opened from a group's "Add item" (into that group) or the empty agenda's hint */}
      <Menu
        anchorEl={addMenuAnchor}
        open={addMenuOpen}
        onClose={() => {
          setAddMenuAnchor(null);
        }}
      >
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            setOpenSongSearch(true);
          }}
        >
          <ListItemIcon>
            <SearchIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{LL.SHOW_ITEMS.ADD_FROM_SEARCH()}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            setSongToEdit(new Song());
          }}
        >
          <ListItemIcon>
            <SongIcon fontSize="small" sx={{ color: DEFAULT_SONG_ITEM_COLOR }} />
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
            <ImageIcon fontSize="small" sx={{ color: DEFAULT_MEDIA_ITEM_COLOR }} />
          </ListItemIcon>
          <ListItemText primary={LL.SHOW_ITEMS.ADD_MEDIA()} secondary={LL.SHOW_ITEMS.ADD_MEDIA_HINT()} />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            setMediaAddRole('background');
            setOpenMediaBrowser(true);
          }}
        >
          <ListItemIcon>
            <BackgroundIcon fontSize="small" sx={{ color: DEFAULT_MEDIA_ITEM_COLOR }} />
          </ListItemIcon>
          <ListItemText primary={LL.SHOW_ITEMS.ADD_BACKGROUND()} secondary={LL.SHOW_ITEMS.ADD_BACKGROUND_HINT()} />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAddMenuAnchor(null);
            handleSlideshowAdd();
          }}
        >
          <ListItemIcon>
            <SlideshowIcon fontSize="small" sx={{ color: DEFAULT_MEDIA_ITEM_COLOR }} />
          </ListItemIcon>
          <ListItemText primary={LL.SHOW_ITEMS.ADD_SLIDESHOW()} secondary={LL.SHOW_ITEMS.ADD_SLIDESHOW_HINT()} />
        </MenuItem>
        {bibleEnabled && (
          <MenuItem
            onClick={() => {
              setAddMenuAnchor(null);
              setOpenBiblePicker(true);
            }}
          >
            <ListItemIcon>
              <MenuBookIcon fontSize="small" sx={{ color: DEFAULT_BIBLE_ITEM_COLOR }} />
            </ListItemIcon>
            <ListItemText>{LL.SHOW_ITEMS.ADD_BIBLE_VERSE()}</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {renderToolbar({
        // The show you are on, and unsaved changes to it.
        shows: (
          <>
            {!locked && (
              <Tooltip title={LL.SHOWS.TITLE()}>
                <IconButton size="small" onClick={() => setOpenShowSwitcher(true)}>
                  <ViewListIcon />
                </IconButton>
              </Tooltip>
            )}
            {!locked && showItems.length > 0 && (
              <Tooltip title={LL.SHOWS.COPY_AGENDA()}>
                <IconButton size="small" onClick={() => void handleCopyAgenda()}>
                  <CopyIcon />
                </IconButton>
              </Tooltip>
            )}
          </>
        ),
        save: isDirty && (
          <Tooltip title={LL.SHOWS.SAVE()}>
            <IconButton size="small" onClick={handleSaveShow} color="warning">
              <Badge variant="dot" color="warning">
                <SaveIcon />
              </Badge>
            </IconButton>
          </Tooltip>
        ),
        // Preparation tools: set lists and search are gone in Live.
        lists: !locked && (
          <>
            <Tooltip title={LL.SET_LISTS.TITLE()}>
              <IconButton size="small" onClick={() => setSetListsOpen(true)}>
                <SetListIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={LL.SONGS.SEARCH()}>
              <IconButton size="small" onClick={() => openSearch()}>
                <SearchIcon />
              </IconButton>
            </Tooltip>
          </>
        ),
        devices: (
          <>
            {/* Musician View */}
            <Tooltip title={LL.MUSICIAN.OPEN()}>
              <IconButton size="small" onClick={() => window.open('/notes', '_blank')}>
                <PdfIcon />
              </IconButton>
            </Tooltip>
            {/* Mobile control page */}
            <Tooltip title={LL.REMOTE.OPEN_CONTROL()}>
              <IconButton size="small" onClick={() => window.open('/control', '_blank')}>
                <SmartphoneIcon />
              </IconButton>
            </Tooltip>
          </>
        ),
        app: (
          <>
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
              {accountLabel && (
                <MenuItem disabled>
                  <ListItemText>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {LL.AUTH.LOGGED_IN_AS()}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                      }}
                    >
                      {accountLabel}
                    </Typography>
                    {session?.name && session.mail && (
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          display: 'block',
                        }}
                      >
                        {session.mail}
                      </Typography>
                    )}
                  </ListItemText>
                </MenuItem>
              )}
              {accountLabel && <Divider />}
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
              {!isElectronApp() && (
                <MenuItem
                  onClick={() => {
                    setAccountMenuAnchor(null);
                    setDesktopAppOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <DesktopAppIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>{LL.DESKTOP_APP.BANNER_TITLE()}</ListItemText>
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{LL.AUTH.LOGOUT()}</ListItemText>
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAccountMenuAnchor(null);
                  setLogoutResetOpen(true);
                }}
              >
                <ListItemIcon>
                  <ResetIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{LL.AUTH.LOGOUT_RESET.MENU()}</ListItemText>
              </MenuItem>
            </Menu>
            <LogoutResetDialog open={logoutResetOpen} onClose={() => setLogoutResetOpen(false)} />
            <DesktopAppDownloadModal open={desktopAppOpen} onClose={() => setDesktopAppOpen(false)} />
            {/* Settings — belong to preparation too, so Live keeps them out of reach */}
            {!locked && (
              <Tooltip title={LL.SETTINGS.SETTINGS()}>
                <IconButton size="small" onClick={() => setOpenSettings(true)}>
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
            )}
          </>
        ),
      })}
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
        {/* Rename (media only — songs/verses take their label from the source) */}
        {menuItem?.type === 'media' && (
          <MenuItem
            onClick={() => {
              setRenameIndex(itemMenuIndex);
              handleItemMenuClose();
            }}
          >
            <ListItemIcon>
              <RenameIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.SHOW_ITEMS.RENAME()}</ListItemText>
          </MenuItem>
        )}
        {/* Keep this media entry in the library */}
        {menuItem?.type === 'media' && menuItem.mediaSubType !== 'color' && (
          <MenuItem
            onClick={() => {
              if (menuItem) library.saveItem(menuItem);
              handleItemMenuClose();
            }}
          >
            <ListItemIcon>
              <SaveToLibraryIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.LIBRARY.SAVE_ENTRY()}</ListItemText>
          </MenuItem>
        )}
        {/* Find a media file that moved */}
        {menuItem?.type === 'media' && !!menuItem.mediaPath && menuItem.mediaSubType !== 'color' && (
          <MenuItem
            onClick={() => {
              setRelinkIndex(itemMenuIndex);
              handleItemMenuClose();
            }}
          >
            <ListItemIcon>
              <FindFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.AGENDA_DROP.RELINK_MENU()}</ListItemText>
          </MenuItem>
        )}
        {/* Edit text (verses only) — also where `---` page breaks go */}
        {menuItem?.type === 'bible_verse' && (
          <MenuItem
            onClick={() => {
              setVerseTextIndex(itemMenuIndex);
              handleItemMenuClose();
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.SHOW_ITEMS.EDIT_TEXT()}</ListItemText>
          </MenuItem>
        )}
        {/* Move to group submenu (only when there's more than one group) */}
        {groups.length > 1 && (
          <MenuItem onClick={(e) => setGroupSubmenuAnchor(e.currentTarget)}>
            <ListItemIcon>
              <FolderIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.SHOW_GROUPS.MOVE_ITEM_TO()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        <Divider />
        {/* Delete */}
        <MenuItem onClick={handleItemRemove}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{LL.MUSICIAN.ITEM_DELETE()}</ListItemText>
        </MenuItem>
      </Menu>
      {/* Rename dialog for media items */}
      <GroupNameDialog
        open={renameIndex >= 0}
        title={LL.SHOW_ITEMS.RENAME()}
        fieldLabel={LL.MEDIA.NAME_OPTIONAL()}
        // Pre-fill only a real name — an auto-label (the path/URL itself) starts empty.
        initialName={renameItem && renameItem.label !== renameFallback ? (renameItem.label ?? '') : ''}
        placeholder={renameFallback}
        helperText={LL.SHOW_ITEMS.NAME_HINT()}
        onClose={() => setRenameIndex(-1)}
        onSubmit={handleItemRename}
      />
      {/* Verse text dialog: a line with only --- starts a new page */}
      <GroupNameDialog
        open={verseTextIndex >= 0}
        multiline
        title={LL.SHOW_ITEMS.EDIT_TEXT()}
        fieldLabel={LL.SHOW_ITEMS.VERSE_TEXT()}
        initialName={verseTextIndex >= 0 ? (showItems[verseTextIndex]?.label ?? '') : ''}
        helperText={LL.SHOW_ITEMS.EDIT_TEXT_HINT()}
        onClose={() => setVerseTextIndex(-1)}
        onSubmit={(text) => {
          // Bold ranges point into the old text, so they are dropped with an edit.
          if (verseTextIndex >= 0 && text) {
            dispatch(updateShowItem({ index: verseTextIndex, item: { label: text, bibleFormattedSegments: undefined } }));
          }
          setVerseTextIndex(-1);
        }}
      />
      {/* Move-to-group submenu */}
      <Menu anchorEl={groupSubmenuAnchor} open={!!groupSubmenuAnchor} onClose={() => setGroupSubmenuAnchor(null)}>
        {groups
          .filter((g) => g.id !== (itemMenuIndex >= 0 ? showItems[itemMenuIndex]?.groupId : undefined))
          .map((g) => (
            <MenuItem
              key={g.id}
              onClick={() => {
                if (itemMenuIndex >= 0) handleMoveItemToGroup(itemMenuIndex, g.id);
                handleItemMenuClose();
              }}
            >
              <ListItemIcon>
                <CircleIcon fontSize="small" sx={{ color: g.color || 'text.disabled' }} />
              </ListItemIcon>
              <ListItemText>{groupDisplayName(g, LL.SHOW_GROUPS.DEFAULT())}</ListItemText>
            </MenuItem>
          ))}
      </Menu>
      {/* Key submenu */}
      <Menu
        anchorEl={keySubmenuAnchor}
        open={Boolean(keySubmenuAnchor)}
        onClose={() => setKeySubmenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: { sx: { maxHeight: '60vh', overflowY: 'auto' } },
        }}
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
        slotProps={{
          paper: { sx: { maxHeight: '60vh', overflowY: 'auto', touchAction: 'pan-y' } },
        }}
      >
        {menuItemOrders.map((order) => (
          <MenuItem
            key={order}
            onClick={() => void handleItemSetOrder(order)}
            selected={parseOrderKey(menuItem?.order).order === order}
            sx={{ fontSize: '0.85rem' }}
          >
            {order}
          </MenuItem>
        ))}
      </Menu>
      {quickOrderContext && songs[quickOrderContext.songNumber] && (
        <QuickOrderDialog
          open={quickOrderDialogOpen}
          onClose={() => {
            setQuickOrderDialogOpen(false);
            setQuickOrderContext(null);
          }}
          song={songs[quickOrderContext.songNumber]}
          initialOrderName={quickOrderContext.orderName}
          onSave={handleQuickOrderSave}
        />
      )}
      {!currentShow ? (
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          <Stack spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1, p: 3, textAlign: 'center' }}>
            <FileUploadIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
              {LL.SHOW_ITEMS.EMPTY_HINT_TITLE()}
            </Typography>
            <Typography variant="body2" color="text.disabled" component="div" sx={{ lineHeight: 2 }}>
              <Box
                component="span"
                onClick={() => setOpenShowSwitcher(true)}
                sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { opacity: 0.8 } }}
              >
                {LL.SHOW_ITEMS.EMPTY_HINT_LOAD_SHOW()}
              </Box>
              {', '}
              <Box
                component="span"
                onClick={() => openSearch()}
                sx={{ color: 'primary.main', cursor: 'pointer', textDecoration: 'underline', '&:hover': { opacity: 0.8 } }}
              >
                {LL.SHOW_ITEMS.EMPTY_HINT_SEARCH()}
              </Box>
            </Typography>
          </Stack>
        </Box>
      ) : (
        <Box sx={{ overflow: 'auto', flexGrow: 1 }}>
          <ShowGroupList
            order={showItems}
            groups={groups}
            renderItem={renderItemRow}
            onMoveItem={locked ? () => {} : handleMoveItem}
            onToggleCollapse={handleToggleGroupCollapse}
            editable={!locked}
            onRenameGroup={handleRenameGroup}
            onOpenGroupSettings={(group, count) => setSettingsGroup({ group, count })}
            onAddItem={(groupId, anchor) => {
              setAddTargetGroup(groupId);
              setAddMenuAnchor(anchor);
            }}
            onOpenLibrary={currentShow ? () => library.setOpen(true) : undefined}
            emptyGroupDropArea={
              <Box
                component="label"
                sx={{
                  display: 'block',
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  px: 2,
                  py: 1.25,
                  textAlign: 'center',
                  cursor: 'pointer',
                  '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Typography variant="caption" color="text.disabled">
                  {LL.SHOW_ITEMS.EMPTY_HINT_DROP()}
                </Typography>
                <input ref={fileInputRef} type="file" accept=".txt,.sng" multiple hidden onChange={handleFileInputChange} />
              </Box>
            }
            onReorderGroup={handleReorderGroup}
            onDeleteGroup={handleDeleteGroup}
            onAddGroup={handleAddGroup}
            footer={
              isImportingCcli ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 3, py: 1 }}>
                  <Skeleton variant="circular" width={20} height={20} />
                  <Skeleton variant="text" sx={{ flex: 1, fontSize: '1rem' }} />
                </Stack>
              ) : undefined
            }
          />
        </Box>
      )}
      {importLanguageDialog}
    </Stack>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
