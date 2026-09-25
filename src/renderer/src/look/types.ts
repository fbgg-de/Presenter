/**
 * What a small picture of a screen draws behind the text: a colour, and an image or video.
 *
 * Themes only bring the colour; pictures and videos come from background entries of the agenda.
 * Dependency-free on purpose.
 */

export type BackgroundFit = 'cover' | 'contain';

export interface BackgroundLayer {
  /** A media-folder path or a URL. */
  path: string;
  fit?: BackgroundFit;
  position?: string;
  /** Pixels. */
  blur?: number;
}

export interface BackgroundData {
  color?: string;
  image?: BackgroundLayer;
  video?: BackgroundLayer;
}
