import { useEffect, useState } from 'react';
import { Chip, Tooltip } from '@mui/material';
import { Timer as TimerIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useGetShow } from '@/store/showSlice';
import { useGetPresentationSettings } from '@/store/presentationSlice';
import { formatMmss } from '@/components/stage/StageCueEditor';

/**
 * Time left of the live agenda entry's planned duration — "2:10", then "+0:45" in red once it runs
 * over. ProPresenter's "End Item on Time" idea, fed by the inspector or the ChurchTools agenda.
 * Its own leaf with its own one-second tick, so the top bar does not re-render every second.
 */
export const AgendaTimerChip = () => {
  const { LL } = useI18nContext();
  const { currentShow } = useGetShow();
  const { activeItemIndex, activeItemSince } = useGetPresentationSettings('activeItemIndex', 'activeItemSince');
  const planned = currentShow?.order?.[activeItemIndex]?.plannedDuration;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!planned) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [planned]);

  if (!planned) return null;
  const left = Math.round((activeItemSince + planned * 1000 - now) / 1000);
  const over = left < 0;
  return (
    <Tooltip title={LL.OPERATOR.AGENDA_TIMER_HINT({ planned: formatMmss(planned) })}>
      <Chip
        size="small"
        icon={<TimerIcon />}
        label={over ? `+${formatMmss(-left)}` : formatMmss(left)}
        color={over ? 'error' : left <= 60 ? 'warning' : 'default'}
        variant={over ? 'filled' : 'outlined'}
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      />
    </Tooltip>
  );
};
