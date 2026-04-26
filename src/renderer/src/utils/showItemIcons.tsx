import {
  MusicNote as MusicNoteIcon,
  Image as ImageIcon,
  MenuBook as MenuBookIcon,
  Videocam as VideocamIcon,
  Palette as PaletteIcon,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ShowItemType, MediaSubType } from '@/api/shows.api';
import { DEFAULT_BIBLE_ITEM_COLOR, DEFAULT_MEDIA_ITEM_COLOR, DEFAULT_SONG_ITEM_COLOR } from '@/theme';

/** Map of MUI icon name strings to components */
const ICON_MAP: Record<string, SvgIconComponent> = {
  MusicNote: MusicNoteIcon,
  Image: ImageIcon,
  MenuBook: MenuBookIcon,
  Videocam: VideocamIcon,
  Palette: PaletteIcon,
};

/** Default colors per show item type */
export const DEFAULT_ITEM_COLORS: Record<ShowItemType, string> = {
  song: DEFAULT_SONG_ITEM_COLOR,
  media: DEFAULT_MEDIA_ITEM_COLOR,
  bible_verse: DEFAULT_BIBLE_ITEM_COLOR,
};

/** Default icon names per show item type */
export const DEFAULT_ITEM_ICONS: Record<ShowItemType, string> = {
  song: 'MusicNote',
  media: 'Image',
  bible_verse: 'MenuBook',
};

/**
 * Resolve an MUI icon component from a string name.
 * Falls back to MusicNoteIcon if not found.
 */
export const getIconComponent = (iconName: string): SvgIconComponent => {
  return ICON_MAP[iconName] ?? MusicNoteIcon;
};

/**
 * Get the appropriate icon for a show item based on type and media sub-type.
 */
export const getShowItemIcon = (type: ShowItemType, mediaSubType?: MediaSubType): SvgIconComponent => {
  if (type === 'media') {
    switch (mediaSubType) {
      case 'video':
        return VideocamIcon;
      case 'color':
        return PaletteIcon;
      default:
        return ImageIcon;
    }
  }
  const iconName = DEFAULT_ITEM_ICONS[type] ?? 'MusicNote';
  return getIconComponent(iconName);
};

/**
 * Get the color for a show item type.
 */
export const getShowItemColor = (type: ShowItemType): string => {
  return DEFAULT_ITEM_COLORS[type] ?? '#1976d2';
};
