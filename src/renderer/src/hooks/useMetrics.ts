import { useCallback } from 'react';
import { useRecordMetricMutation } from '@/api/metrics.api';

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
  | 'search_performed';

export type MetricEntityType = 'song' | 'show' | 'style' | 'window' | 'bible' | 'media';

/**
 * Hook for recording usage metrics.
 * Wraps the recordMetric RTK mutation with a convenient API.
 *
 * Usage:
 * ```ts
 * const { trackEvent } = useMetrics();
 * trackEvent('song_selected', 'song', '42');
 * ```
 */
export const useMetrics = () => {
  const [recordMetric] = useRecordMetricMutation();

  const trackEvent = useCallback(
    (event: MetricEventType, entityType?: MetricEntityType, entityId?: string, metadata?: Record<string, unknown>) => {
      recordMetric({
        event,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
      }).catch((err) => {
        // Silently fail — metrics should never block the user
        console.debug('Failed to record metric:', err);
      });
    },
    [recordMetric],
  );

  return { trackEvent };
};
