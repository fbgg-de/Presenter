/**
 * The media playback settings of one agenda group: how its images, videos and slideshows play
 * together, and what its backgrounds do. Shown as a tab of the group settings; saved with the show,
 * on the group.
 */
import { Button, Stack, Switch, Typography } from '@mui/material';
import { useI18nContext } from '@/i18n/i18n-react';
import { InspectorRow, InspectorSection, Segmented } from '@/components/media/Viewer';
import {
  DEFAULT_GROUP_BACKGROUNDS,
  DEFAULT_GROUP_MEDIA,
  type GroupBackgroundSettings,
  type GroupMediaSettings,
} from '@/media/groupPlayback';

/** A setting: name and a line of explanation on the left, the control on the right. */
const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <InspectorRow
    labelWidth={210}
    align="start"
    label={
      <Stack component="span" sx={{ minWidth: 0 }}>
        <Typography component="span" sx={{ fontSize: 13, color: 'text.primary' }}>
          {label}
        </Typography>
        {hint && (
          <Typography component="span" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.3 }}>
            {hint}
          </Typography>
        )}
      </Stack>
    }
  >
    {children}
  </InspectorRow>
);

export const GroupPlaybackFields = ({
  media,
  backgrounds,
  onMediaChange,
  onBackgroundsChange,
}: {
  media: GroupMediaSettings;
  backgrounds: GroupBackgroundSettings;
  onMediaChange: (media: GroupMediaSettings) => void;
  onBackgroundsChange: (backgrounds: GroupBackgroundSettings) => void;
}) => {
  const { LL } = useI18nContext();
  const P = LL.GROUP_PLAYBACK;
  const patchMedia = (patch: Partial<GroupMediaSettings>) => onMediaChange({ ...media, ...patch });
  const setBackgrounds = (update: (current: GroupBackgroundSettings) => GroupBackgroundSettings) =>
    onBackgroundsChange(update(backgrounds));

  return (
    <Stack sx={{ mx: -1.5 }}>
      <InspectorSection id="group-media" title={P.SECTION_MEDIA()}>
        <Row label={P.ORDER()} hint={media.mode === 'together' ? P.ORDER_TOGETHER_HINT() : P.ORDER_SEQUENCE_HINT()}>
          <Segmented
            value={media.mode}
            options={[
              { value: 'sequence', label: P.ORDER_SEQUENCE() },
              { value: 'together', label: P.ORDER_TOGETHER() },
            ]}
            onChange={(mode) => patchMedia({ mode })}
          />
        </Row>
        <Row label={P.AUTO_ADVANCE()} hint={P.AUTO_ADVANCE_HINT()}>
          <Switch
            checked={media.autoAdvance}
            disabled={media.mode === 'together'}
            onChange={(e) => patchMedia({ autoAdvance: e.target.checked })}
          />
        </Row>
        <Row label={P.MAX_AT_ONCE()} hint={P.MAX_AT_ONCE_HINT()}>
          <Segmented
            value={String(media.maxAtOnce)}
            options={[
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '0', label: P.ALL() },
            ]}
            onChange={(maxAtOnce) => patchMedia({ maxAtOnce: Number(maxAtOnce) })}
          />
        </Row>
        <Row label={P.TOP_LAYER()}>
          <Segmented
            value={media.topLayer}
            options={[
              { value: 'lastStarted', label: P.TOP_LAST_STARTED() },
              { value: 'agendaOrder', label: P.TOP_AGENDA_ORDER() },
            ]}
            onChange={(topLayer) => patchMedia({ topLayer })}
          />
        </Row>
        <Row label={P.START_WITH_SONG()} hint={P.START_WITH_SONG_HINT()}>
          <Switch checked={media.startWithSong} onChange={(e) => patchMedia({ startWithSong: e.target.checked })} />
        </Row>
        <Row label={P.MEDIA_ON_LEAVE()} hint={P.MEDIA_ON_LEAVE_HINT()}>
          <Segmented
            value={media.onLeave}
            options={[
              { value: 'keep', label: P.KEEP_PLAYING() },
              { value: 'fade', label: P.FADE_OUT() },
              { value: 'stop', label: P.STOP() },
            ]}
            onChange={(onLeave) => patchMedia({ onLeave })}
          />
        </Row>
      </InspectorSection>
      <InspectorSection id="group-backgrounds" title={P.SECTION_BACKGROUNDS()}>
        <Row label={P.BACKGROUND_TRANSITION()}>
          <Segmented
            value={backgrounds.transition}
            options={[
              { value: 'cut', label: P.CUT() },
              { value: 'fade', label: P.FADE() },
            ]}
            onChange={(transition) => setBackgrounds((current) => ({ ...current, transition }))}
          />
        </Row>
        <Row label={P.BACKGROUND_ON_LEAVE()} hint={P.BACKGROUND_ON_LEAVE_HINT()}>
          <Segmented
            value={backgrounds.onLeave}
            options={[
              { value: 'keep', label: P.KEEP() },
              { value: 'fade', label: P.FADE_OUT() },
              { value: 'hide', label: P.HIDE_NOW() },
            ]}
            onChange={(onLeave) => setBackgrounds((current) => ({ ...current, onLeave }))}
          />
        </Row>
      </InspectorSection>
      <Button
        color="inherit"
        size="small"
        onClick={() => {
          onMediaChange(DEFAULT_GROUP_MEDIA);
          onBackgroundsChange(DEFAULT_GROUP_BACKGROUNDS);
        }}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', mx: 1.5, mt: 1 }}
      >
        {P.DEFAULTS()}
      </Button>
    </Stack>
  );
};
