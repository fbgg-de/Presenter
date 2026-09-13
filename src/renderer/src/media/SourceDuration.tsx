import { useEffect, useRef, useState } from 'react';
import { Button, Typography } from '@mui/material';
import { Timer } from '@mui/icons-material';
import type { MediaSource } from './types';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { useMediaLabels } from './labels';

/** Explicit duration adoption avoids silently truncating already drawn regions. */
export function SourceDuration({
  source,
  onUse,
  autoUse = false,
  onUnavailable,
}: {
  source: MediaSource;
  autoUse?: boolean;
  onUse: (duration: number) => void;
  onUnavailable?: () => void;
}) {
  const l = useMediaLabels(),
    [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  useEffect(() => {
    if (!autoUse) return;
    const timer = setTimeout(() => {
      setFailed(true);
      unavailable.current?.();
    }, 15000);
    return () => clearTimeout(timer);
  }, [autoUse, source.path]);
  if (source.type !== 'video') return null;
  const length = Math.round((duration - source.offset) * 1000) / 1000;
  return (
    <>
      <video
        hidden
        muted
        preload="metadata"
        src={resolveMediaUrl(source.path)}
        onLoadedMetadata={(e) => {
          const value = e.currentTarget.duration;
          setDuration(value);
          if (autoUse && Number.isFinite(value) && value > source.offset) onUse(Math.round((value - source.offset) * 1000) / 1000);
        }}
        onError={() => {
          setDuration(0);
          setFailed(true);
          onUnavailable?.();
        }}
      />
      <Button
        size="small"
        color="inherit"
        startIcon={<Timer />}
        disabled={!Number.isFinite(length) || length <= 0}
        onClick={() => onUse(length)}
      >
        {l('useDuration')}
        {duration > 0 && Number.isFinite(length) ? ` · ${length.toFixed(3)} s` : ''}
      </Button>
      {autoUse && !duration && <Typography variant="caption">{l('readingDuration')}</Typography>}
      {failed && (
        <Typography variant="caption" color="warning.main">
          {l('durationUnavailable')}
        </Typography>
      )}
    </>
  );
}
