import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type MetricEvent = {
  id: number;
  user_sub?: string;
  event: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type MetricsResponse = {
  total: number;
  limit: number;
  offset: number;
  metrics: MetricEvent[];
};

const metricsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getMetrics: build.query<
      ApiSuccess<MetricsResponse>,
      { from?: string; to?: string; event?: string; entity_type?: string; limit?: number; offset?: number; account?: number } | void
    >({
      query: (arg) => ({
        url: 'rest/Metrics',
        params: arg ?? {},
      }),
      providesTags: [{ type: 'Metrics', id: 'LIST' }],
    }),
    recordMetric: build.mutation<
      ApiSuccess<{ message: string }>,
      { event: string; entity_type?: string; entity_id?: string; metadata?: Record<string, unknown> }
    >({
      query: (body) => ({ url: 'rest/Metrics', method: 'POST', body }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetMetricsQuery, useRecordMetricMutation } = metricsApi;
