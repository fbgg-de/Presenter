import { presenterApi } from './base.api';
import type { ApiSuccess } from './base.api';

export type MetricEvent = {
  id: number;
  account?: number;
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
  summary?: MetricsSummary | null;
  snapshot_id: number;
};

export type MetricAccount = {
  account: number;
  events: number;
  devices: number;
  errors: number;
  first_seen: string | null;
  last_seen: string | null;
  previous_events: number | null;
  previous_errors: number | null;
};
export type MetricCount = { name: string; events: number };
export type MetricDimension = MetricCount & { event: string; field: string };
export type MetricActivity = { day: string; events: number; devices: number; errors: number };

export type MetricsSummary = {
  totals: { events: number; devices: number; accounts: number; active_days: number; errors: number };
  daily: MetricActivity[];
  activity: MetricActivity[];
  patterns: { weekday: number; hour: number; events: number }[];
  features: { event: string; events: number; devices: number; accounts: number }[];
  eventTimeline: { day: string; event: string; events: number }[];
  entities: MetricCount[];
  accountFeatures: { account: number; event: string; events: number; devices: number }[];
  accountDaily: { account: number; day: string; events: number }[];
  accounts: MetricAccount[];
  comparison: { from: string; to: string; totals: { events: number; devices: number; accounts: number; errors: number } } | null;
  dimensions: MetricDimension[];
  topEntities: { account: number; event: string; entity_id: string; title: string | null; events: number }[];
  settingValues: { setting: string; name: string; devices: number }[];
  retention: { week: string; size: number; weeks: { offset: number; devices: number; complete: boolean }[] }[];
  observationTo: string;
  reliability: {
    affected_devices: number;
    daily: { day: string; errors: number; devices: number }[];
    issues: { source: string; message: string; events: number; devices: number; accounts: number; first_seen: string; last_seen: string }[];
  };
  workflow: {
    coverage: { events: number; tracked: number; sessions: number };
    transitions: { source: string; target: string; events: number; sessions: number }[];
  };
};

export type MetricsQuery = {
  from?: string;
  to?: string;
  event?: string;
  entity_type?: string;
  device_id?: string;
  limit?: number;
  offset?: number;
  account?: number;
  include_summary?: number;
  granularity?: 'day' | 'week' | 'month';
  snapshot_id?: number;
};

const metricsApi = presenterApi.injectEndpoints({
  endpoints: (build) => ({
    getMetrics: build.query<ApiSuccess<MetricsResponse>, MetricsQuery | void>({
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

export const { useGetMetricsQuery, useLazyGetMetricsQuery, useRecordMetricMutation } = metricsApi;
