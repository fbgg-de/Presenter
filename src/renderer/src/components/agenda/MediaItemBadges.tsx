import { Stack } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import type { ShowItem } from '@/api/shows.api';
import { LookPill } from '@/components/operator/LookPill';
import { activeVersionOf, mediaItemDataOf } from '@/media/mediaItem';
import { usePlaybacks } from '@/media/playback';
import { playbackKeyOf } from '@/media/useMediaHost';

/**
 * Pills under an image or video entry of the agenda: Background for the background role, the
 * version when there are several, and On screen while it runs. Subscribes on its own, so the
 * agenda does not re-render with every media clock tick.
 */
export const MediaItemBadges = ({ item, index, inverted }: { item: ShowItem; index: number; inverted?: boolean }) => {
  const { LL } = useI18nContext();
  const M = LL.MEDIA_ITEM;
  const data = mediaItemDataOf(item);
  const key = playbackKeyOf(item, index);
  const running = usePlaybacks().some((p) => p.key === key && p.endsAt === undefined && !p.hidden);
  if (!data) return null;
  const pills = [
    ...(data.role === 'background' ? [{ kind: 'background' as const, label: M.ROLE_BACKGROUND() }] : []),
    ...(data.versions.length > 1 ? [{ kind: 'plain' as const, label: activeVersionOf(data).name }] : []),
    ...(activeVersionOf(data).slideshow
      ? [{ kind: 'plain' as const, label: M.IMAGES({ count: activeVersionOf(data).sources.length }) }]
      : []),
    ...(running ? [{ kind: 'tweak' as const, label: M.STATUS_ON_SCREEN() }] : []),
  ];
  if (!pills.length) return null;
  return (
    <Stack direction="row" sx={{ gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
      {pills.map((pill) => (
        <LookPill key={pill.label} kind={pill.kind} label={pill.label} inverted={inverted} />
      ))}
    </Stack>
  );
};
