# Presenter metrics

The dashboard has four views: Overview, Adoption, Content, and Reliability. Every statistical chart uses SQL aggregates over the entire authorized, filtered range. Raw records are fetched separately for the recent-event inspector and recent window configurations; those lists are explicitly bounded or paginated.

- Account trends compare the selected inclusive date range with the immediately preceding range of exactly the same duration. A zero baseline is shown as new activity or no baseline, never as an invented percentage increase. Accounts active only in the previous period remain visible.
- Adoption reach divides distinct known devices using a feature by all distinct known active devices for the account under the current filters. Matrix cells apply the account and event filters together. Event volume is available as a second measure.
- Retention cohorts start in the first active Monday-based week **inside the selected range**, rather than the first-ever visit. Returning-device counts are distinct within each week. Future weeks are blank; partial leading and trailing weeks are marked and excluded from the pooled curve. The curve weights eligible cohorts by their size.
- Reliability charts report error events, affected devices, and the share of recorded events that are errors. They do not estimate session crash rates. Recurring issues group by source and the first 240 characters of the message.
- Content rankings and metadata distributions cover the full range. Long bar-chart rankings combine the remainder into Other; song/show charts explicitly show the top ten, separated by account. Settings distributions use the latest observed change per account, setting, and known device within the range, rather than claiming to be a current device inventory.

Dates, daily/hourly buckets, and comparisons use the database's recording time and timezone. Day, week, and month activity queries count distinct devices within each bucket; they do not sum daily device counts.

## Workflow collection

The existing metrics switch controls session collection too. A renderer visit has an anonymous session ID and increasing action sequence. Sessions are independent per window, and rotate after reload, device changes, login, or 30 minutes without a recorded action. Events also carry their original action timestamp. Relevant actions (`show_loaded`, `song_selected`, `block_navigated`, `window_opened`, `presentation_opened`) include the previous observed workflow action in the same session.

The diagram groups observed transitions and shows their event and distinct session counts. Historical rows without session metadata are excluded, and coverage is displayed. It becomes populated as updated clients record events. An event filter hides the transition diagram because it removes the context needed to compare different actions.

Offline events retain their original session metadata. Flushes acknowledge only successful requests and preserve failures and events added during the flush. Concurrent flushes within one renderer share one operation. Delivery remains best effort; a transport failure after a server commit can still produce a duplicate on retry.

## Exports and deployment

Full event exports fetch every matching page with a fixed insertion-ID snapshot. New inserts cannot shift the export's pagination. Cancellation and failed requests produce no partial download. CSV exports escape quotes/newlines and neutralize formula-like strings.

Deploy the renderer, `api/Metrics.php`, and `classes/MetricsAnalytics.php` together. No schema migration is needed. The SQL uses CTEs and window functions supported by the repository's documented MySQL/MariaDB requirements. The existing metrics indexes support account, event, and date filtering; exceptionally large installations should measure query costs against their production dataset.

## Verification

```
node test/metrics/api.mjs
node test/metrics/unit.mjs
node test/metrics/ui.mjs
npm run typecheck:web
```

The PHP tests exercise the real controller's authorization/bindings and the real retention/comparison calculations with a SQL statement spy. The browser suite uses the fixture backend and checks all four views on desktop and phone, filtering, historical-session coverage, previous-only accounts, full-range totals above the raw-row cap, exports, and error recovery. Browser tests require localhost access and an installed Chrome/Edge. They save ignored preview PNGs in `test/metrics/screenshots/`. Live database execution requires separate validation on a configured MySQL/MariaDB instance.
