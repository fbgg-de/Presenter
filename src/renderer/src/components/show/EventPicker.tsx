import { useState, useEffect, useRef } from 'react';
import { Box, Button, CircularProgress, List, ListItem, ListItemButton, ListItemText, Typography } from '@mui/material';
import { KeyboardArrowUp as EarlierIcon, KeyboardArrowDown as MoreIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useLazyGetChurchToolsEventsQuery, type CtEvent } from '@/api/churchtools.api';

const PAGE = 10;

/** ChurchTools' events `from`/`to` filters expect a Y-m-d date, not a full ISO timestamp. */
const toDay = (iso: string) => iso.slice(0, 10);

interface EventPickerProps {
  value: CtEvent | null;
  onChange: (event: CtEvent | null) => void;
}

const sortKey = (e: CtEvent) => e.startDate ?? '';

/**
 * A ChurchTools event picker that pages bidirectionally through time. It starts from the
 * currently-assigned event's date (or today) and lets the user load earlier (past) and later
 * (future) events on demand. Used by the new-show and rename dialogs.
 */
export const EventPicker = ({ value, onChange }: EventPickerProps) => {
  const { LL } = useI18nContext();
  const [events, setEvents] = useState<CtEvent[]>([]);
  const [hasEarlier, setHasEarlier] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [fetchEvents, { isFetching }] = useLazyGetChurchToolsEventsQuery();
  const seeded = useRef(false);

  const merge = (incoming: CtEvent[], extra?: CtEvent | null) => {
    setEvents((prev) => {
      const byId = new Map<number, CtEvent>();
      for (const e of prev) byId.set(e.id, e);
      for (const e of incoming) byId.set(e.id, e);
      if (extra) byId.set(extra.id, extra);
      return Array.from(byId.values()).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    });
  };

  // Initial load: upcoming events from the assigned event's date (or today), forward.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const from = toDay(value?.startDate ?? new Date().toISOString());
    fetchEvents({ from, direction: 'forward', limit: PAGE })
      .unwrap()
      .then((r) => {
        merge(r.events, value);
        setHasMore(r.events.length >= PAGE);
      })
      .catch(() => merge([], value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use the earliest/latest events that actually have a date for the boundaries (the seed/assigned
  // event can carry a null startDate and must not skew the pagination cursor).
  const dated = events.filter((e) => e.startDate);

  const loadMore = () => {
    const last = dated[dated.length - 1];
    const from = toDay(last?.startDate ?? new Date().toISOString());
    fetchEvents({ from, direction: 'forward', limit: PAGE })
      .unwrap()
      .then((r) => {
        const gotNew = r.events.some((e) => !events.find((p) => p.id === e.id));
        merge(r.events);
        setHasMore(gotNew && r.events.length >= PAGE);
      })
      .catch(() => {});
  };

  const loadEarlier = () => {
    const first = dated[0];
    const to = toDay(first?.startDate ?? new Date().toISOString());
    fetchEvents({ to, direction: 'backward', limit: PAGE })
      .unwrap()
      .then((r) => {
        const gotNew = r.events.some((e) => !events.find((p) => p.id === e.id));
        merge(r.events);
        setHasEarlier(gotNew && r.events.length >= PAGE);
      })
      .catch(() => {});
  };

  return (
    <Box>
      <Button
        fullWidth
        size="small"
        onClick={loadEarlier}
        disabled={isFetching || !hasEarlier}
        startIcon={isFetching ? <CircularProgress size={16} /> : <EarlierIcon />}
      >
        {LL.SHOWS.EVENTS_LOAD_EARLIER()}
      </Button>
      <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
        <ListItem disablePadding divider={events.length > 0}>
          <ListItemButton selected={value === null} onClick={() => onChange(null)}>
            <ListItemText primary={<Typography variant="body1">{LL.SHOWS.NO_EVENT()}</Typography>} />
          </ListItemButton>
        </ListItem>
        {events.map((event, i) => (
          <ListItem key={event.id} disablePadding divider={i < events.length - 1}>
            <ListItemButton selected={value?.id === event.id} onClick={() => onChange(event)}>
              <ListItemText
                primary={<Typography variant="body1">{event.name ?? `#${event.id}`}</Typography>}
                secondary={
                  event.startDate ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {new Date(event.startDate).toLocaleString()}
                    </Typography>
                  ) : undefined
                }
                slotProps={{ secondary: { component: 'div' } as object }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Button
        fullWidth
        size="small"
        onClick={loadMore}
        disabled={isFetching || !hasMore}
        startIcon={isFetching ? <CircularProgress size={16} /> : <MoreIcon />}
      >
        {LL.SHOWS.EVENTS_LOAD_MORE()}
      </Button>
    </Box>
  );
};
