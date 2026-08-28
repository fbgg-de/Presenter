import type { ReactNode } from 'react';
import {
  Wallpaper as BackgroundIcon,
  TextFields as TextIcon,
  Dashboard as LayoutIcon,
  Copyright as CopyrightIcon,
  Code as CssIcon,
  Preview as PreviewIcon,
  type SvgIconComponent,
} from '@mui/icons-material';
import type { StyleFormCtx } from '@/components/style/styleFormContext';
import { BackgroundSection } from '@/components/style/sections/BackgroundSection';
import { TextSection } from '@/components/style/sections/TextSection';
import { LayoutSection } from '@/components/style/sections/LayoutSection';
import { CopyrightSection } from '@/components/style/sections/CopyrightSection';
import { CustomCssSection } from '@/components/style/sections/CustomCssSection';
import { PreviewSection } from '@/components/style/sections/PreviewSection';

/**
 * What the style editor contains, in the order it is offered.
 *
 * The nav, the headings and the search all read this one list, so moving a category or
 * renaming it is a single edit here rather than three that can drift apart.
 */
export type StyleCategory = {
  id: string;
  label: string;
  description: string;
  icon: SvgIconComponent;
  render: (ctx: StyleFormCtx) => ReactNode;
  /** Property labels this category holds — the only thing search needs to match on. */
  keywords: string[];
};

export const buildStyleCategories = (LL: StyleFormCtx['LL']): StyleCategory[] => {
  const S = LL.STYLE;
  const D = S.CATEGORY_DESC;

  return [
    {
      id: 'background',
      label: S.SECTION_BACKGROUND(),
      description: D.BACKGROUND(),
      icon: BackgroundIcon,
      render: (ctx) => <BackgroundSection ctx={ctx} />,
      keywords: [
        S.BACKGROUND_COLOR(),
        S.BACKGROUND_IMAGE(),
        S.BACKGROUND_IMAGE_NONE(),
        S.BACKGROUND_VIDEO(),
        S.BACKGROUND_VIDEO_NONE(),
        S.BG_ZOOM(),
        S.BG_BLUR(),
        S.VIDEO_EASE_IN(),
        S.VIDEO_EASE_OUT(),
      ],
    },
    {
      id: 'layout',
      label: S.SECTION_LAYOUT(),
      description: D.LAYOUT(),
      icon: LayoutIcon,
      render: (ctx) => <LayoutSection ctx={ctx} />,
      keywords: [S.ALIGNMENT(), S.VERTICAL_ALIGN(), S.TRANSFORM(), S.LINE_HEIGHT(), S.PADDING(), S.PARAGRAPH_PADDING()],
    },
    {
      id: 'text',
      label: S.SECTION_TEXT(),
      description: D.TEXT(),
      icon: TextIcon,
      render: (ctx) => <TextSection ctx={ctx} />,
      keywords: [
        S.FONT_FAMILY(),
        S.FONT_SIZE(),
        S.SHADOW_COLOR(),
        S.STROKE_WIDTH(),
        S.FONT_COLOR(),
        S.FONT_BOLD_ITALIC(),
        S.LETTER_SPACING(),
        S.TEXT_SHADOW(),
        S.TEXT_STROKE(),
        S.OPACITY(),
        S.NEXT_LINE_PREVIEW(),
        S.HIDE_TEXT(),
        S.SLOT_MAIN(),
        S.SLOT_ADD(),
        S.SHOW_OTHER_LANGUAGES(),
      ],
    },
    {
      id: 'copyright',
      label: S.SECTION_COPYRIGHT(),
      description: D.COPYRIGHT(),
      icon: CopyrightIcon,
      render: (ctx) => <CopyrightSection ctx={ctx} />,
      keywords: [
        S.COPYRIGHT_FONT(),
        S.COPYRIGHT_PADDING(),
        S.COPYRIGHT_SIZE(),
        S.COPYRIGHT_COLOR(),
        S.COPYRIGHT_ALIGNMENT(),
        S.COPYRIGHT_OPACITY(),
        S.COPYRIGHT_BOLD_ITALIC(),
        S.COPYRIGHT_TITLE_SIZE(),
        S.COPYRIGHT_TITLE_BOLD_ITALIC(),
        S.COPYRIGHT_TITLE_SPACING(),
        S.COPYRIGHT_SHOW_SONG_NUMBER(),
      ],
    },
    {
      id: 'preview',
      label: S.PREVIEW(),
      description: D.PREVIEW(),
      icon: PreviewIcon,
      render: (ctx) => <PreviewSection ctx={ctx} />,
      keywords: [S.PREVIEW_LINES(), S.PREVIEW_PANES(), S.PREVIEW_PANE_SAMPLE()],
    },
    {
      id: 'css',
      label: S.SECTION_CUSTOM_CSS(),
      description: D.CSS(),
      icon: CssIcon,
      render: (ctx) => <CustomCssSection ctx={ctx} />,
      keywords: [S.SECTION_CUSTOM_CSS(), 'css'],
    },
  ];
};

/** Categories whose label, blurb or property names contain `query`. */
export const filterStyleCategories = (categories: StyleCategory[], query: string): StyleCategory[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return categories;
  const hit = (text: string) => text.toLowerCase().includes(needle);
  return categories.filter(
    (category) => hit(category.label) || hit(category.description) || category.keywords.some((keyword) => hit(keyword)),
  );
};
