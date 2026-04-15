import {
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon,
  PictureAsPdf as PdfIcon,
  MoreVert as MoreVertIcon,
  Delete as DeleteIcon,
  FolderOpen as FolderOpenIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  Save as SaveIcon,
  ViewList as ViewListIcon,
} from '@mui/icons-material';
import { useState, useCallback, useMemo, MouseEvent } from 'react';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppSelector, useAppDispatch } from '@/store';
import { removeShowItem, updateShowItem, setDirty, reorderShowItems, setShowSelectorOpen, selectIsDirty } from '@/store/showSlice';
import { addSongToStore, addToSongsOrder } from '@/store/songsSlice';
import { parseOrderKey, MUSICAL_KEYS } from '@/utils/orderKeyUtils';
import type { ShowItem } from '@/api/shows.api';
import { addShowItem } from '@/store/showSlice';
import { useSaveShowMutation } from '@/api/shows.api';
import { useGetPdfCountsQuery } from '@/api/pdfs.api';
import { UnifiedSearch } from '@/components/UnifiedSearch';
import { Song } from '@/song';
import type { ISong } from '@/song';
import { getShowItemIcon, getShowItemColor } from '@/utils/showItemIcons';
import DraggableList from '@/components/DraggableList';

const SIDEBAR_WIDTH = 350;

interface MusicianSidebarProps {
  open: boolean;
  activeItemIndex: number;
  /** The operator's live active item index (read-only from Redux) */
  operatorActiveIndex: number;
  onSelectItem: (index: number) => void;
  onOpenPdfModal: () => void;
}

export const MusicianSidebar = ({ open, activeItemIndex, operatorActiveIndex, onSelectItem, onOpenPdfModal }: MusicianSidebarProps) => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { palette } = useTheme();
  const songs = useAppSelector((s) => s.songs.songs);
  const blockIndicator = useAppSelector((s) => s.settings.musicianBlockIndicator);
  const currentShow = useAppSelector((s) => s.show.currentShow);
  const isDirty = useAppSelector(selectIsDirty);
  const showItems = currentShow?.order ?? [];

  // Collect unique song numbers for PDF count batch query
  const uniqueSongNumbers = useMemo(() => {
    const nums = new Set<number>();
    for (const item of showItems) {
      if (item.type === 'song' && item.songNumber != null) nums.add(item.songNumber);
    }
    return Array.from(nums);
  }, [showItems]);

  const { data: pdfCounts } = useGetPdfCountsQuery({ songNumbers: uniqueSongNumbers }, { skip: uniqueSongNumbers.length === 0 });

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);

  // Context menu state
  const [itemMenuAnchor, setItemMenuAnchor] = useState<null | HTMLElement>(null);
  const [itemMenuIndex, setItemMenuIndex] = useState<number>(-1);
  const [keySubmenuAnchor, setKeySubmenuAnchor] = useState<null | HTMLElement>(null);
  const [orderSubmenuAnchor, setOrderSubmenuAnchor] = useState<null | HTMLElement>(null);

  const [saveShowMutation] = useSaveShowMutation();

  const getItemLabel = useCallback(
    (item: ShowItem, index: number): string => {
      if (item.type === 'song' && item.songNumber != null) {
        const song = songs[item.songNumber];
        return song?.title ?? `Song #${item.songNumber}`;
      }
      if (item.type === 'bible_verse') return item.bibleRef || item.label || 'Bible';
      if (item.type === 'media') return item.label || 'Media';
      return `Item ${index + 1}`;
    },
    [songs],
  );

  const handleSongSelected = async (songNumber: number) => {
    try {
      const response = await fetch(`/rest/Song/${songNumber}`);
      const data = await response.json();
      let fullSong: ISong | undefined;
      if (Array.isArray(data) && data.length > 0) fullSong = data[0];
      else if (data && typeof data === 'object' && data.songNumber) fullSong = data;
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
        dispatch(addShowItem({ type: 'song', songNumber: songToAdd.songNumber, order: 'Default' }));
      }
    } catch (error) {
      console.error('Failed to fetch song:', error);
    }
    setSearchOpen(false);
  };

  const handleSaveShow = async () => {
    if (!currentShow) return;
    try {
      await saveShowMutation({ title: currentShow.title, order: currentShow.order }).unwrap();
      dispatch(setDirty(false));
    } catch (error) {
      console.error('Failed to save show:', error);
    }
  };

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
  };

  const handleRemoveItem = () => {
    if (itemMenuIndex >= 0) {
      dispatch(removeShowItem(itemMenuIndex));
    }
    handleItemMenuClose();
  };

  const handleSetKey = (key: string | undefined) => {
    if (itemMenuIndex >= 0) {
      dispatch(updateShowItem({ index: itemMenuIndex, item: { key } }));
    }
    setKeySubmenuAnchor(null);
    handleItemMenuClose();
  };

  const handleSetOrder = (order: string) => {
    if (itemMenuIndex >= 0) {
      dispatch(updateShowItem({ index: itemMenuIndex, item: { order } }));
    }
    setOrderSubmenuAnchor(null);
    handleItemMenuClose();
  };

  const menuItem = itemMenuIndex >= 0 ? showItems[itemMenuIndex] : undefined;
  const menuItemSong = menuItem?.type === 'song' && menuItem.songNumber != null ? songs[menuItem.songNumber] : undefined;
  const menuItemOrders = menuItemSong?.order ? Object.keys(menuItemSong.order) : [];

  return (
    <>
      {/* Context menu */}
      <Menu
        anchorEl={itemMenuAnchor}
        open={Boolean(itemMenuAnchor)}
        onClose={handleItemMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuItem?.type === 'song' && (
          <MenuItem onClick={(e) => setKeySubmenuAnchor(e.currentTarget)}>
            <ListItemIcon>
              <MusicNoteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN_ITEM_SELECT_KEY()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        {menuItem?.type === 'song' && menuItemOrders.length > 1 && (
          <MenuItem onClick={(e) => setOrderSubmenuAnchor(e.currentTarget)}>
            <ListItemIcon>
              <FolderOpenIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN_ITEM_SELECT_ORDER()}</ListItemText>
            <ChevronRightIcon fontSize="small" sx={{ ml: 1 }} />
          </MenuItem>
        )}
        {menuItem?.type === 'song' && menuItem.songNumber != null && (
          <MenuItem
            onClick={() => {
              handleItemMenuClose();
              onOpenPdfModal();
            }}
          >
            <ListItemIcon>
              <PdfIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{LL.MUSICIAN_MANAGE_PDFS()}</ListItemText>
          </MenuItem>
        )}
        {menuItem?.type === 'song' && <Divider />}
        <MenuItem onClick={handleRemoveItem}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{LL.MUSICIAN_ITEM_DELETE()}</ListItemText>
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
        <MenuItem onClick={() => handleSetKey(undefined)} sx={{ fontSize: '0.85rem' }}>
          <em>None</em>
        </MenuItem>
        {MUSICAL_KEYS.map((k) => (
          <MenuItem key={k} onClick={() => handleSetKey(k)} selected={menuItem?.key === k} sx={{ fontSize: '0.85rem' }}>
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
            onClick={() => handleSetOrder(order)}
            selected={parseOrderKey(menuItem?.order).order === order}
            sx={{ fontSize: '0.85rem' }}
          >
            {order}
          </MenuItem>
        ))}
      </Menu>

      <Drawer
        variant="persistent"
        open={open}
        sx={{
          position: 'absolute',
          zIndex: 20,
          height: '100%',
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            position: 'absolute',
            height: '100%',
            boxShadow: open ? '4px 0 16px rgba(0,0,0,0.15)' : 'none',
          },
        }}
      >
        <Stack sx={{ height: '100%' }}>
          {/* Toolbar header — matches main operator sidebar */}
          <Stack
            direction="row"
            p={searchOpen ? 0.5 : 1}
            sx={{ background: palette.background.paper, minHeight: '48px', flexWrap: 'wrap' }}
            alignItems="center"
          >
            {searchOpen ? (
              <Box sx={{ width: '100%' }}>
                <UnifiedSearch
                  open={searchOpen}
                  onClose={() => setSearchOpen(false)}
                  onSelectSong={(songNumber) => handleSongSelected(songNumber)}
                  songsOnly
                />
              </Box>
            ) : (
              <>
                <Tooltip title={LL.SEARCH_SONGS()}>
                  <IconButton size="small" onClick={() => setSearchOpen(true)}>
                    <SearchIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title={LL.SHOWS()}>
                  <IconButton size="small" onClick={() => dispatch(setShowSelectorOpen(true))}>
                    <ViewListIcon />
                  </IconButton>
                </Tooltip>
                {isDirty && (
                  <Tooltip title={LL.SAVE_SHOW()}>
                    <IconButton size="small" onClick={handleSaveShow} color="warning">
                      <Badge variant="dot" color="warning">
                        <SaveIcon />
                      </Badge>
                    </IconButton>
                  </Tooltip>
                )}
                <Box flexGrow={1} />
                {currentShow && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180, mr: 1 }}>
                    {currentShow.title}
                  </Typography>
                )}
              </>
            )}
          </Stack>

          <Divider />

          {/* Show items list */}
          <DraggableList
            dense
            sx={{ flex: 1, overflow: 'auto', pt: 0 }}
            onItemsChanged={(source, destination) => {
              dispatch(reorderShowItems({ source, destination }));
            }}
          >
            {showItems.map((item, i) => {
              const itemParsed = parseOrderKey(item.order);
              const itemKey = item.key || itemParsed.key;
              const itemOrder = itemParsed.order;
              const isActive = i === activeItemIndex;
              const ItemIcon = getShowItemIcon(item.type, item.mediaSubType);
              const itemColor = getShowItemColor(item.type);
              return (
                <ListItem key={i} disablePadding>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => onSelectItem(i)}
                    dense
                    sx={{
                      ...(isActive ? { background: palette.primary.main, '&:hover': { background: palette.primary.dark } } : {}),
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <ItemIcon fontSize="small" sx={{ color: isActive ? '#fff' : itemColor }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" noWrap sx={{ color: isActive ? '#fff' : undefined }}>
                          {getItemLabel(item, i)}
                        </Typography>
                      }
                    />
                    {itemOrder && itemOrder !== 'Default' && (
                      <Chip
                        label={itemOrder}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontSize: '0.55rem',
                          height: 16,
                          maxWidth: 60,
                          ml: 0.5,
                          color: isActive ? '#fff' : undefined,
                          borderColor: isActive ? 'rgba(255,255,255,0.5)' : undefined,
                        }}
                      />
                    )}
                    {itemKey && (
                      <Chip
                        label={itemKey}
                        size="small"
                        sx={{
                          fontSize: '0.6rem',
                          height: 16,
                          ml: 0.5,
                          backgroundColor: isActive ? 'rgba(255,255,255,0.3)' : 'primary.main',
                          color: '#fff',
                        }}
                      />
                    )}
                    {blockIndicator && i === operatorActiveIndex && (
                      <Chip label="●" size="small" color="primary" sx={{ height: 16, fontSize: '0.6rem', ml: 0.25 }} />
                    )}
                    {item.type === 'song' && item.songNumber != null && pdfCounts && (pdfCounts[String(item.songNumber)] ?? 0) > 0 && (
                      <Tooltip title={LL.MUSICIAN_PDF_COUNT({ count: pdfCounts[String(item.songNumber)] })}>
                        <Chip
                          label={pdfCounts[String(item.songNumber)]}
                          deleteIcon={<PdfIcon sx={{ fontSize: '0.7rem !important' }} />}
                          onDelete={() => {
                            /* noop — icon-only display */
                          }}
                          size="small"
                          variant="outlined"
                          sx={{
                            height: 16,
                            fontSize: '0.55rem',
                            ml: 0.25,
                            color: isActive ? '#fff' : undefined,
                            borderColor: isActive ? 'rgba(255,255,255,0.5)' : undefined,
                            '& .MuiChip-deleteIcon': { color: 'inherit', ml: '-2px' },
                          }}
                        />
                      </Tooltip>
                    )}
                    <IconButton size="small" onClick={(e) => handleItemMenuOpen(e, i)} sx={{ ml: 0.25, p: 0.25 }}>
                      <MoreVertIcon sx={{ fontSize: '1rem', color: isActive ? '#fff' : undefined }} />
                    </IconButton>
                  </ListItemButton>
                </ListItem>
              );
            })}
          </DraggableList>
        </Stack>
      </Drawer>
    </>
  );
};
