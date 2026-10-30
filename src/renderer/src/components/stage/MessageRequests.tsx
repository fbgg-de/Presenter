import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Close as DismissIcon, Edit as EditIcon, MarkEmailUnread as RequestIcon } from '@mui/icons-material';
import { useI18nContext } from '@/i18n/i18n-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { removeMessageRequest, stageShowMessage, type MessageRequest } from '@/store/stageSlice';
import { useGetStageLayersQuery } from '@/api/stage.api';
import { fillTemplate, templateFields, type StageLayerEntity } from '@/stage/types';
import { ackMessageRequest } from '@/stage/messageRequests';
import { emitAppEvent, useAppEvent } from '@/utils/appEvents';

/** The layer and cue a request or dialog is about, by id — the list may have changed meanwhile. */
const findCue = (layers: StageLayerEntity[], layerId: number, cueIdOrIndex: string | number) => {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return null;
  const cueIndex = typeof cueIdOrIndex === 'number' ? cueIdOrIndex : layer.data.cues.findIndex((cue) => cue.id === cueIdOrIndex);
  const cue = layer.data.cues[cueIndex];
  return cue?.kind === 'message' ? { layer, cue, cueIndex } : null;
};

/**
 * Fill in a message's `{fields}` before it goes up ("Kind {Nummer} bitte abholen"). Opened by
 * Start/Go on such a cue (askMessageFields) and by "Edit" on a request from the /message page.
 * Mount once.
 */
export const MessageFieldsDialog = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const { data: layers = [] } = useGetStageLayersQuery();
  const [open, setOpen] = useState<{ layerId: number; cueIndex: number; requestId?: string } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useAppEvent('presenter:message-fields', (detail) => {
    setValues(detail.fields ?? {});
    setOpen({ layerId: detail.layerId, cueIndex: detail.cueIndex, requestId: detail.requestId });
  });

  const target = open ? findCue(layers, open.layerId, open.cueIndex) : null;
  if (!open || !target) return null;
  const names = templateFields(target.cue.text);
  const show = () => {
    dispatch(stageShowMessage({ layerId: open.layerId, cueIndex: open.cueIndex, fields: values, at: Date.now() }));
    if (open.requestId) {
      dispatch(removeMessageRequest(open.requestId));
      ackMessageRequest(open.requestId, 'shown');
    }
    setOpen(null);
  };

  return (
    <Dialog open onClose={() => setOpen(null)} maxWidth="xs" fullWidth>
      <DialogTitle>{target.layer.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          {names.map((name, i) => (
            <TextField
              key={name}
              label={name}
              size="small"
              autoFocus={i === 0}
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && show()}
            />
          ))}
          <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {LL.STAGE.MESSAGE_ON_SCREEN()}
            </Typography>
            <Typography variant="body2">{fillTemplate(target.cue.text, values)}</Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpen(null)}>{LL.COMMON.CANCEL()}</Button>
        <Button variant="contained" onClick={show}>
          {LL.STAGE.MESSAGE_SHOW()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

/**
 * Requests from the /message page, waiting for the operator: nothing reaches the screens until it
 * is shown here. A top-bar chip that only exists while something is waiting.
 */
export const MessageRequestsChip = () => {
  const { LL } = useI18nContext();
  const dispatch = useAppDispatch();
  const requests = useAppSelector((state) => state.stage.messageRequests);
  const { data: layers = [] } = useGetStageLayersQuery();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (requests.length === 0) return null;

  const resolve = (request: MessageRequest) => findCue(layers, request.layerId, request.cueId);
  const dismiss = (request: MessageRequest) => {
    dispatch(removeMessageRequest(request.id));
    ackMessageRequest(request.id, 'dismissed');
  };
  const show = (request: MessageRequest) => {
    const target = resolve(request);
    if (!target) return dismiss(request);
    dispatch(stageShowMessage({ layerId: request.layerId, cueIndex: target.cueIndex, fields: request.fields, at: Date.now() }));
    dispatch(removeMessageRequest(request.id));
    ackMessageRequest(request.id, 'shown');
    if (requests.length === 1) setAnchor(null);
  };

  return (
    <>
      <Tooltip title={LL.STAGE.MESSAGE_REQUESTS()}>
        <Badge badgeContent={requests.length} color="error">
          <Chip
            size="small"
            color="warning"
            icon={<RequestIcon />}
            label={LL.STAGE.MESSAGE_REQUEST_CHIP()}
            onClick={(e) => setAnchor(e.currentTarget)}
          />
        </Badge>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Stack spacing={1} sx={{ p: 1.5, width: 360 }}>
          {requests.map((request) => {
            const target = resolve(request);
            return (
              <Stack key={request.id} spacing={0.5} sx={{ p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {[target?.layer.name, request.from, new Date(request.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]
                    .filter(Boolean)
                    .join(' · ')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {target ? fillTemplate(target.cue.text, request.fields) : LL.STAGE.MESSAGE_GONE()}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                  <Tooltip title={LL.COMMON.CANCEL()}>
                    <IconButton size="small" onClick={() => dismiss(request)} aria-label={LL.COMMON.CANCEL()}>
                      <DismissIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {target && (
                    <Tooltip title={LL.STAGE.MESSAGE_EDIT()}>
                      <IconButton
                        size="small"
                        aria-label={LL.STAGE.MESSAGE_EDIT()}
                        onClick={() => {
                          setAnchor(null);
                          emitAppEvent('presenter:message-fields', {
                            layerId: request.layerId,
                            cueIndex: target.cueIndex,
                            fields: request.fields,
                            requestId: request.id,
                          });
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Button size="small" variant="contained" disabled={!target} onClick={() => show(request)}>
                    {LL.STAGE.MESSAGE_SHOW()}
                  </Button>
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </Popover>
    </>
  );
};
