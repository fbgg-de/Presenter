import {
  MusicNote as MusicNoteIcon,
  Lyrics as SongIcon,
  Image as ImageIcon,
  MenuBook as MenuBookIcon,
  Videocam as VideocamIcon,
  Palette as PaletteIcon,
  Audiotrack as AudioIcon,
  Collections as SlideshowIcon,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import type { ShowItemType, MediaSubType } from '@/api/shows.api';
import { DEFAULT_BIBLE_ITEM_COLOR, DEFAULT_MEDIA_ITEM_COLOR, DEFAULT_SONG_ITEM_COLOR } from '@/theme';

/** Map of MUI icon name strings to components */
const ICON_MAP: Record<string, SvgIconComponent> = {
  MusicNote: MusicNoteIcon,
  Lyrics: SongIcon,
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
  // Lyrics, so a song never looks like an audio entry (a note).
  song: 'Lyrics',
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
      case 'audio':
        return AudioIcon;
      case 'slideshow':
        return SlideshowIcon;
      default:
        return ImageIcon;
    }
  }
  const iconName = DEFAULT_ITEM_ICONS[type] ?? 'Lyrics';
  return getIconComponent(iconName);
};

/**
 * Get the color for a show item type.
 */
export const getShowItemColor = (type: ShowItemType): string => {
  return DEFAULT_ITEM_COLORS[type] ?? '#1976d2';
};
