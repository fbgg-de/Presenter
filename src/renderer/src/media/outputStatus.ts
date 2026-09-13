import { useEffect, useState } from 'react';
import { isPresentationWindowSource } from '@/utils/presentationBridge';

import type { CueOutputStatus } from './types';

export function useCueOutputStatus(session?: string) {
  const [statuses, setStatuses] = useState<Record<string, CueOutputStatus & { received: number }>>({});
  useEffect(() => {
    setStatuses({});
    const receive = (cue?: CueOutputStatus) => {
      if (
        !cue ||
        cue.session !== session ||
        typeof cue.role !== 'string' ||
        !cue.sources ||
        typeof cue.sources !== 'object' ||
        !Object.values(cue.sources).every((s) => ['ready', 'error', 'buffering', 'playback'].includes(s))
      )
        return;
      setStatuses((previous) => ({ ...previous, [cue.role]: { ...cue, received: Date.now() } }));
    };
    const off = window.api?.onVideoStatus((status) => receive(status.cue));
    const message = (event: MessageEvent) => {
      if (event.origin === location.origin && isPresentationWindowSource(event.source) && event.data?.type === 'MEDIA_CUE_STATUS')
        receive(event.data.cue);
    };
    window.addEventListener('message', message);
    const timer = setInterval(
      () =>
        setStatuses((previous) => {
          const fresh = Object.entries(previous).filter(([, value]) => Date.now() - value.received < 3000);
          return fresh.length === Object.keys(previous).length ? previous : Object.fromEntries(fresh);
        }),
      1000,
    );
    return () => {
      off?.();
      clearInterval(timer);
      window.removeEventListener('message', message);
    };
  }, [session]);
  return statuses;
}
