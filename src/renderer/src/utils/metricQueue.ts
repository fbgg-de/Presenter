/**
 * metricQueue — localStorage-backed offline metric queue.
 *
 * When the app is offline, metrics are stored here and flushed
 * automatically once connectivity is restored.
 */

import { metricId } from './metricSession';

const QUEUE_KEY = 'presenter_metrics_offline_queue';
const MAX_QUEUE_SIZE = 500;
let flushing: Promise<void> | undefined;

export type QueuedMetric = {
  queue_id: string;
  event: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  queued_at: string; // ISO timestamp
};

/** Append a metric to the offline queue (capped at MAX_QUEUE_SIZE). */
export function enqueueMetric(payload: Omit<QueuedMetric, 'queued_at' | 'queue_id'>): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedMetric[] = raw ? (JSON.parse(raw) as QueuedMetric[]) : [];
    if (queue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest entry to make room
      queue.shift();
    }
    queue.push({ ...payload, queue_id: metricId(), queued_at: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage not available — silently ignore
  }
}

/** Returns the current queue without clearing it. */
export function peekQueue(): QueuedMetric[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedMetric[] = raw ? JSON.parse(raw) : [];
    // Give legacy entries an identity once, before a flush can race with new arrivals.
    let changed = false;
    for (const entry of queue)
      if (!entry.queue_id) {
        entry.queue_id = metricId();
        changed = true;
      }
    if (changed) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return queue;
  } catch {
    return [];
  }
}

export function removeQueuedMetrics(ids: string[]): void {
  if (!ids.length) return;
  try {
    const accepted = new Set(ids);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(peekQueue().filter((entry) => !accepted.has(entry.queue_id))));
  } catch {
    // Leave the queue for a later retry when storage is available.
  }
}

export async function flushMetricQueue(send: (payload: Omit<QueuedMetric, 'queue_id' | 'queued_at'>) => Promise<unknown>): Promise<void> {
  if (flushing) return flushing;
  const queue = peekQueue();
  if (!queue.length) return;
  flushing = (async () => {
    for (let i = 0; i < queue.length; i += 10) {
      const batch = queue.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((m) =>
          send({
            event: m.event,
            entity_type: m.entity_type,
            entity_id: m.entity_id,
            metadata: { ...m.metadata, queued_at: m.queued_at },
          }),
        ),
      );
      removeQueuedMetrics(batch.filter((_, j) => results[j].status === 'fulfilled').map((m) => m.queue_id));
      if (results.some((result) => result.status === 'rejected')) break;
    }
  })();
  try {
    await flushing;
  } finally {
    flushing = undefined;
  }
}

/** Clear the queue (call after successful flush). */
export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}
