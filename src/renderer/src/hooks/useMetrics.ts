import { useCallback } from 'react';
import { useRecordMetricMutation } from '@/api/metrics.api';
import { getSetting } from '@/store/settingsSlice';
import { enqueueMetric, peekQueue, clearQueue } from '@/utils/metricQueue';
import { getDeviceId } from '@/utils/deviceId';

export type MetricEventType =
  | 'song_selected'
  | 'show_created'
  | 'show_loaded'
  | 'show_saved'
  | 'block_navigated'
  | 'login'
  | 'presentation_opened'
  | 'style_changed'
  | 'bible_verse_added'
  | 'media_added'
  | 'song_imported'
  | 'song_deleted'
  | 'show_deleted'
  | 'search_performed'
  | 'setting_changed'
  | 'window_opened'
  | 'pdf_uploaded'
  | 'pdf_viewed'
  | 'pdf_deleted'
  | 'modal_opened'
  | 'musician_button_clicked'
  | 'musician_edit_tool_used'
  | 'musician_layer_action'
  | 'musician_mapping_used'
  | 'ws_companion_connected'
  | 'ws_companion_command'
  | 'fresh_start'
  | 'uncaught_error'
  | 'metrics_disabled';

export type MetricEntityType = 'song' | 'show' | 'style' | 'window' | 'bible' | 'media' | 'pdf' | 'setting';

/**
 * Hook for recording usage metrics.
 * - When online: fires immediately via the REST API.
 * - When offline: stores in localStorage queue; call flushQueue() on reconnect.
 *
 * Usage:
 * ```ts
 * const { trackEvent, flushQueue } = useMetrics();
 * trackEvent('song_selected', 'song', '42');
 * ```
 */
export const useMetrics = () => {
  const [recordMetric] = useRecordMetricMutation();

  const trackEvent = useCallback(
    (event: MetricEventType, entityType?: MetricEntityType, entityId?: string, metadata?: Record<string, unknown>) => {
      const metricsEnabled = getSetting('metricsEnabled') as boolean;
      // When metrics are disabled, only allow the opt-out event itself through
      if (!metricsEnabled && event !== 'metrics_disabled') return;

      const enriched = { device_id: getDeviceId(), ...metadata };
      const offline = getSetting('offlineMode') as boolean;
      if (offline) {
        enqueueMetric({ event, entity_type: entityType, entity_id: entityId, metadata: enriched });
        return;
      }
      recordMetric({ event, entity_type: entityType, entity_id: entityId, metadata: enriched }).catch(() => {
        // Network error while "online" — fall back to queue
        enqueueMetric({ event, entity_type: entityType, entity_id: entityId, metadata: enriched });
      });
    },
    [recordMetric],
  );

  /** Flush any queued offline metrics. Safe to call repeatedly. */
  const flushQueue = useCallback(async () => {
    const queue = peekQueue();
    if (queue.length === 0) return;
    try {
      await Promise.all(
        queue.map((m) =>
          recordMetric({
            event: m.event,
            entity_type: m.entity_type,
            entity_id: m.entity_id,
            metadata: { ...m.metadata, queued_at: m.queued_at },
          }),
        ),
      );
      clearQueue();
    } catch {
      // Keep queue intact on failure — will retry next time
    }
  }, [recordMetric]);

  return { trackEvent, flushQueue };
};
