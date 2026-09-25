/**
 * The right-hand column of the operator view: the inspector of one agenda entry, in folding
 * sections like the media card's (an editing suite's inspector) — so everything about the entry
 * is visible at once instead of behind tabs:
 *
 * - **Entry** — name, agenda group, arrangement and key (songs), role (media), and the theme with
 *   where it comes from (the agenda group, the show or the account).
 * - **Backgrounds** — the background entries of the entry's agenda group, the one running on each
 *   screen, and a click to switch to another.
 * - **Stage** — the stage actions this entry fires when it goes live.
 *
 * Prepare describes the entry open in the operator view; Live describes what is on screen, and
 * marks itself read-only — switching backgrounds stays possible, because that is what they are for.
 */
import { Box, ButtonBase, IconButton, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Lock as LockIcon, TuneOutlined as GroupSettingsIcon } from '@mui/icons-material';
import { useAppDispatch } from '@/store';
import { setShowGroups } from '@/store/showSlice';
import { useGetStylesQuery } from '@/api/styles.api';
import { emitAppEvent } from '@/utils/appEvents';
import { parseOrderKey } from '@/utils/orderKeyUtils';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetSettings } from '@/store/settingsSlice';
import { useGetShow } from '@/store/showSlice';
import { useOpenItem } from '@/store/presentationSlice';
import { useGetScreenGroupsQuery } from '@/api/screenGroups.api';
import { useGetStageLayersQuery } from '@/api/stage.api';
import { useActiveLook } from '@/hooks/useActiveLook';
import { themeSource, type LookLevelName } from '@/look/resolveLook';
import { BackgroundThumb } from '@/components/look/BackgroundThumb';
import { InspectorRow, InspectorSection } from '@/components/media/Viewer';
import { PLAYHEAD } from '@/components/media/Transport';
import { activeVersionOf, mediaItemDataOf, mediaItemLabel } from '@/media/mediaItem';
import { usePlaybacks } from '@/media/playback';
import { playbackKeyOf, screenKeysOf, startItem } from '@/media/useMediaHost';
import { DEFAULT_GROUP_ID, groupDisplayName, updateGroup } from '@/utils/showGroups';
import { SectionLabel } from './SectionLabel';

const LABEL_WIDTH = 92;

/** A read-only value in an inspector row. */
const Value = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <Typography variant="body2" noWrap sx={{ fontWeight: muted ? 400 : 500, color: muted ? 'text.secondary' : 'text.primary', minWidth: 0 }}>
    {children}
  </Typography>
);

/** The background entries of the entry's agenda group: click one to switch to it. */
const GroupBackgrounds = ({ itemIndex }: { itemIndex?: number }) => {
  const { LL } = useI18nContext();
  const M = LL.MEDIA_ITEM;
  const { currentShow } = useGetShow();
  const { item } = useActiveLook(itemIndex);
  const { data: screenGroups = [] } = useGetScreenGroupsQuery();
  const { hideTransitionMode, hideTransitionDuration } = useGetSettings('hideTransitionMode', 'hideTransitionDuration');
  const playbacks = usePlaybacks();
  if (!currentShow || !item) return null;
  const agendaGroupId = item.groupId ?? DEFAULT_GROUP_ID;
  const entries = currentShow.order
    .map((entry, index) => ({ entry, index, data: mediaItemDataOf(entry) }))
    .filter(({ entry, data }) => (entry.groupId ?? DEFAULT_GROUP_ID) === agendaGroupId && data?.role === 'background');

  if (!entries.length) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {M.NO_GROUP_BACKGROUNDS()}
      </Typography>
    );
  }

  const screenNames = (keys: string[]) =>
    keys
      .map((key) => screenGroups.find((group) => String(group.id) === key)?.name)
      .filter((name): name is string => !!name)
      .join(' · ') || M.ALL_SCREENS();

  return (
    <Stack spacing={0.75}>
      {entries.map(({ entry, index, data }, position) => {
        const version = activeVersionOf(data!);
        const source = version.sources[0];
        const playback = playbacks.find((p) => p.key === playbackKeyOf(entry, index) && p.endsAt === undefined);
        const shownOn = playback ? playback.screens.filter((screen) => !playback.covered.includes(screen)) : [];
        const live = shownOn.length > 0;
        return (
          <ButtonBase
            key={index}
            onClick={() => void startItem(currentShow, index, screenGroups, hideTransitionMode === 'fade' ? hideTransitionDuration : 0)}
            sx={{
              display: 'flex',
              justifyContent: 'flex-start',
              gap: 1,
              p: 0.6,
              borderRadius: 1,
              border: 1,
              borderColor: live ? PLAYHEAD : 'divider',
              bgcolor: live ? 'rgba(229,72,77,0.08)' : 'transparent',
              textAlign: 'left',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Box sx={{ width: 56, flexShrink: 0, position: 'relative' }}>
              <BackgroundThumb data={source ? { [source.type]: { path: source.path, fit: 'cover' } } : undefined} />
              {position < 9 && (
                <Box
                  component="span"
                  sx={{
                    position: 'absolute',
                    left: 3,
                    top: 2,
                    px: 0.4,
                    borderRadius: 0.5,
                    fontSize: 10,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: '#fff',
                    bgcolor: live ? PLAYHEAD : 'rgba(0,0,0,0.65)',
                  }}
                >
                  {position + 1}
                </Box>
              )}
            </Box>
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                {mediaItemLabel(entry)}
              </Typography>
              <Typography variant="caption" noWrap sx={{ color: live ? PLAYHEAD : 'text.secondary' }}>
                {live
                  ? M.RUNNING_ON({ screens: screenNames(shownOn) })
                  : M.SWITCH_TO({ screens: screenNames(screenKeysOf(version, screenGroups)) })}
              </Typography>
            </Stack>
          </ButtonBase>
        );
      })}
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {M.GROUP_BACKGROUNDS_HINT()}
      </Typography>
    </Stack>
  );
};

export const ItemInspector = ({ width = 290 }: { width?: number | string }) => {
  const { LL } = useI18nContext();
  const O = LL.OPERATOR;
  const L = LL.LOOK;
  const M = LL.MEDIA_ITEM;
  const { operatorMode } = useGetSettings('operatorMode');
  const live = operatorMode === 'live';
  const opened = useOpenItem();
  const itemIndex = live ? undefined : opened.index;
  const { input, item, song } = useActiveLook(itemIndex);
  const { currentShow } = useGetShow();
  const { data: stageLayers = [] } = useGetStageLayersQuery();

  const theme = themeSource(input);
  const dispatch = useAppDispatch();
  const { data: styles = [] } = useGetStylesQuery();
  const parsed = item?.type === 'song' ? parseOrderKey(item.order) : undefined;
  const songKey = item?.type === 'song' ? item.key || parsed?.key : undefined;
  const agendaGroup = item ? currentShow?.groups?.find((g) => g.id === (item.groupId ?? DEFAULT_GROUP_ID)) : undefined;
  const media = mediaItemDataOf(item);
  const setGroupTheme = (styleId: number | undefined) => {
    if (!agendaGroup || !currentShow?.groups) return;
    dispatch(setShowGroups(updateGroup(currentShow.groups, agendaGroup.id, { styleId })));
  };
  const openGroupSettings = (tab: 'general' | 'theme' | 'playback') =>
    agendaGroup && emitAppEvent('presenter:group-settings', { groupId: agendaGroup.id, tab });
  const triggers = item?.stageTriggers ?? [];
  const backgroundCount = item
    ? (currentShow?.order ?? []).filter(
        (entry) =>
          (entry.groupId ?? DEFAULT_GROUP_ID) === (item.groupId ?? DEFAULT_GROUP_ID) && mediaItemDataOf(entry)?.role === 'background',
      ).length
    : 0;

  const levelName = (level: LookLevelName | undefined): string =>
    level ? { global: L.LEVEL_GLOBAL(), show: L.LEVEL_SHOW(), group: L.LEVEL_GROUP() }[level] : L.LEVEL_DEFAULT();
  const triggerLabel = (action: string) =>
    ({ start: O.TRIGGER_START(), next: O.TRIGGER_NEXT(), reset: O.TRIGGER_RESET(), hide: O.TRIGGER_HIDE(), show: O.TRIGGER_SHOW() })[
      action
    ] ?? action;

  const name = !item
    ? ''
    : item.type === 'song'
      ? (song?.title ?? item.label ?? '')
      : item.type === 'bible_verse'
        ? item.bibleRef || LL.BIBLE.VERSE()
        : mediaItemLabel(item);

  return (
    <Stack sx={{ width, flex: 1, flexShrink: 0, minHeight: 0 }}>
      {live && (
        // Live: what is on screen, nothing to edit by accident.
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1.5, py: 0.9, borderBottom: 1, borderColor: 'divider' }}>
          <SectionLabel>{O.NOW_ON_SCREEN()}</SectionLabel>
          <Box sx={{ flex: 1 }} />
          <LockIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        </Stack>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!item ? (
          <Typography variant="body2" sx={{ p: 2, color: 'text.secondary' }}>
            {O.SELECT_ITEM()}
          </Typography>
        ) : (
          <>
            <InspectorSection id="op-entry" title={O.SECTION_ENTRY()} summary={name}>
              <InspectorRow labelWidth={LABEL_WIDTH} label={O.ENTRY_NAME()}>
                <Value>{name}</Value>
              </InspectorRow>
              <InspectorRow labelWidth={LABEL_WIDTH} label={O.AGENDA_GROUP()}>
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: agendaGroup?.color ?? 'text.disabled', flexShrink: 0 }} />
                <Value>{agendaGroup ? groupDisplayName(agendaGroup, LL.SHOW_GROUPS.DEFAULT()) : '—'}</Value>
                {agendaGroup && !live && (
                  <Tooltip title={LL.SHOW_GROUPS.SETTINGS()}>
                    <IconButton size="small" onClick={() => openGroupSettings('general')} sx={{ ml: 'auto' }}>
                      <GroupSettingsIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )}
              </InspectorRow>
              {item.type === 'song' && (
                <InspectorRow labelWidth={LABEL_WIDTH} label={O.ARRANGEMENT()}>
                  <Value>{parsed?.order || 'Default'}</Value>
                </InspectorRow>
              )}
              {songKey && (
                <InspectorRow labelWidth={LABEL_WIDTH} label={O.SUMMARY_KEY()}>
                  <Value>{songKey}</Value>
                </InspectorRow>
              )}
              {item.type === 'bible_verse' && item.bibleTranslation && (
                <InspectorRow labelWidth={LABEL_WIDTH} label={O.TRANSLATION()}>
                  <Value>{item.bibleTranslation}</Value>
                </InspectorRow>
              )}
              {media && (
                <InspectorRow labelWidth={LABEL_WIDTH} label={O.ROLE()}>
                  <Value>{media.role === 'background' ? M.ROLE_BACKGROUND() : M.ROLE_CONTENT()}</Value>
                </InspectorRow>
              )}
              <InspectorRow labelWidth={LABEL_WIDTH} label={L.THEME()} align="start">
                {live || !agendaGroup ? (
                  <Stack sx={{ minWidth: 0 }}>
                    <Value>{theme.name ?? L.NO_THEME()}</Value>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {theme.name ? `${levelName(theme.level)} · ` : ''}
                      {live ? O.LIVE_SWITCH_HINT() : O.THEME_ON_GROUP()}
                    </Typography>
                  </Stack>
                ) : (
                  // Quick edit: the theme of the entry's agenda group, right here.
                  <Stack spacing={0.5} sx={{ minWidth: 0, width: '100%' }}>
                    <Select
                      size="small"
                      value={agendaGroup.styleId !== undefined ? String(agendaGroup.styleId) : ''}
                      displayEmpty
                      onChange={(e) => setGroupTheme(e.target.value === '' ? undefined : Number(e.target.value))}
                      sx={{ height: 30, fontSize: 13, width: '100%' }}
                    >
                      <MenuItem value="">{LL.SHOW_GROUPS.THEME_FOLLOW_SHOW()}</MenuItem>
                      {styles
                        .filter((style) => style.enabled)
                        .map((style) => (
                          <MenuItem key={style.id} value={String(style.id)}>
                            {style.name}
                          </MenuItem>
                        ))}
                    </Select>
                    <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
                      <Typography variant="caption" noWrap sx={{ color: 'text.secondary', flex: 1, minWidth: 0 }}>
                        {theme.name ? levelName(theme.level) : L.NO_THEME()}
                      </Typography>
                      {theme.id !== undefined && (
                        <Tooltip title={LL.SHOW_GROUPS.EDIT_THEME()}>
                          <IconButton size="small" onClick={() => emitAppEvent('presenter:edit-style', { styleId: theme.id })}>
                            <EditIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={LL.SHOW_GROUPS.NEW_THEME()}>
                        <IconButton size="small" onClick={() => openGroupSettings('theme')}>
                          <AddIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                )}
              </InspectorRow>
            </InspectorSection>

            <InspectorSection id="op-backgrounds" title={O.TAB_BACKGROUNDS()} summary={backgroundCount ? String(backgroundCount) : '—'}>
              <GroupBackgrounds itemIndex={itemIndex} />
            </InspectorSection>

            <InspectorSection
              id="op-stage"
              title={O.TAB_STAGE()}
              defaultOpen={false}
              summary={triggers.length ? String(triggers.length) : '—'}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {O.TRIGGERS_HINT()}
              </Typography>
              {triggers.length === 0 ? (
                <Value muted>{O.NO_TRIGGERS()}</Value>
              ) : (
                triggers.map((trigger, index) => (
                  <InspectorRow key={index} labelWidth={LABEL_WIDTH} label={triggerLabel(trigger.action)}>
                    <Value>{stageLayers.find((layer) => layer.id === trigger.layerId)?.name ?? `#${trigger.layerId}`}</Value>
                  </InspectorRow>
                ))
              )}
            </InspectorSection>
          </>
        )}
      </Box>
    </Stack>
  );
};
