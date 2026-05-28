/**
 * metricQueue — localStorage-backed offline metric queue.
 *
 * When the app is offline, metrics are stored here and flushed
 * automatically once connectivity is restored.
 */

const QUEUE_KEY = 'presenter_metrics_offline_queue';
const MAX_QUEUE_SIZE = 500;

export type QueuedMetric = {
  event: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  queued_at: string; // ISO timestamp
};

/** Append a metric to the offline queue (capped at MAX_QUEUE_SIZE). */
export function enqueueMetric(payload: Omit<QueuedMetric, 'queued_at'>): void {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const queue: QueuedMetric[] = raw ? (JSON.parse(raw) as QueuedMetric[]) : [];
    if (queue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest entry to make room
      queue.shift();
    }
    queue.push({ ...payload, queued_at: new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage not available — silently ignore
  }
}

/** Returns the current queue without clearing it. */
export function peekQueue(): QueuedMetric[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMetric[]) : [];
  } catch {
    return [];
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
