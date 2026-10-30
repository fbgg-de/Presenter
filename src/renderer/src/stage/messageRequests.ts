import type { MessageRequest } from '@/store/stageSlice';
import { emitAppEvent } from '@/utils/appEvents';
import { templateFields, type StageLayerEntity } from './types';

/**
 * Messages asked for on the /message page travel over the relay as `message_request`; the live
 * operator collects them (MessageRequestsChip) and answers each with `message_request_ack` once it
 * was shown or dismissed, so the sender knows. The relay socket lives in usePresentationSync —
 * it hands its sender over here.
 */
let send: ((action: string, data: Record<string, unknown>) => void) | null = null;

export const setMessageRequestSender = (sender: typeof send): void => {
  send = sender;
};

export const ackMessageRequest = (id: string, status: 'shown' | 'dismissed'): void => send?.('message_request_ack', { id, status });

const MAX_FIELDS = 10;
const MAX_VALUE = 200;

/** A request off the wire, checked and trimmed — or null. Anyone signed in to the account can send one. */
export function parseMessageRequest(data: unknown, now = Date.now()): MessageRequest | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== 'string' || !d.id || d.id.length > 64) return null;
  if (typeof d.layerId !== 'number' || !Number.isInteger(d.layerId)) return null;
  if (typeof d.cueId !== 'string' || !d.cueId) return null;
  const fields: Record<string, string> = {};
  if (d.fields && typeof d.fields === 'object') {
    for (const [key, value] of Object.entries(d.fields as Record<string, unknown>).slice(0, MAX_FIELDS)) {
      if (typeof value === 'string') fields[key.slice(0, 30)] = value.slice(0, MAX_VALUE);
    }
  }
  return {
    id: d.id,
    layerId: d.layerId,
    cueId: d.cueId,
    fields,
    from: typeof d.from === 'string' ? d.from.slice(0, 60) : undefined,
    at: now,
  };
}

/**
 * Starting a message that has `{fields}` first asks for their values (MessageFieldsDialog). Returns
 * true when it opened the dialog — the caller then leaves the layer alone; the dialog puts it up.
 */
export function askMessageFields(layer: StageLayerEntity, cueIndex: number): boolean {
  const cue = layer.data.cues[cueIndex];
  if (cue?.kind !== 'message' || templateFields(cue.text).length === 0) return false;
  emitAppEvent('presenter:message-fields', { layerId: layer.id, cueIndex });
  return true;
}
