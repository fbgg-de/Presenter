/**
 * The block being edited, drawn by the real renderer in the look it would have on screen: the
 * theme of the agenda group the song sits in when it is part of the open show, else the show's and
 * the account's, for the first screen group.
 */
import { useMemo } from 'react';
import { Stack, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { lookInputFor, resolveLook } from '@/look/resolveLook';
import { contentForItem, parseSongLines } from '@/presentation/itemContent';
import { applyScreenGroup } from '@/presentation/groupContent';
import { SectionLabel } from '@/components/operator/SectionLabel';
import { PresentationFrame } from './PresentationFrame';

export const SongBlockPreview = ({
  name,
  lines,
  languages,
  songNumber,
  title,
}: {
  name: string;
  /** The block's stored lines (translations tagged), one page. */
  lines: string[];
  languages: string[];
  songNumber: number;
  title: string;
}) => {
  const { LL } = useI18nContext();
  const { globalStyleId, nextLinePreview } = useGetSettings('globalStyleId', 'nextLinePreview');
  const { currentShow } = useGetShow();
  const { data: styles } = useGetStylesQuery();
  const { data: groups = [] } = useGetScreenGroupsQuery();

  const content = useMemo(() => {
    // Where this song is in the open show decides its group theme.
    const item = currentShow?.order.find((entry) => entry.type === 'song' && entry.songNumber === songNumber);
    const style = resolveLook(lookInputFor({ globalStyleId, show: currentShow, item, styles })).style;
    const firstGroup = [...groups].filter((g) => g.enabled).sort((a, b) => a.sort_order - b.sort_order)[0];
    const base = contentForItem(
      { contentType: 'song', blocks: [{ name, lines: parseSongLines(lines) }], songLanguages: languages, title },
      {
        blockIndex: 0,
        lineIndex: 0,
        style,
        isBlack: false,
        hideText: false,
        nextLinePreview,
        transitionMode: 'cut',
        licenseLabel: LL.AUTH.LICENSE(),
      },
    );
    return applyScreenGroup(base, groups, firstGroup?.id);
  }, [name, lines, languages, songNumber, title, currentShow, globalStyleId, styles, groups, nextLinePreview, LL]);

  return (
    <Stack spacing={0.75}>
      <SectionLabel>{LL.PREVIEW.TITLE()}</SectionLabel>
      <PresentationFrame content={content} title={LL.PREVIEW.TITLE()} />
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {LL.PREVIEW.SONG_EDITOR_HINT()}
      </Typography>
    </Stack>
  );
};
