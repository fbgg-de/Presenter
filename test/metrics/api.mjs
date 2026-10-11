// Run the actual controller with a SQL statement spy, and test the actual PHP cohort logic.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'presenter-metrics-'));
mkdirSync(join(dir, 'api'));
mkdirSync(join(dir, 'classes'));
copyFileSync('api/Metrics.php', join(dir, 'api/Metrics.php'));
copyFileSync('classes/MetricsAnalytics.php', join(dir, 'classes/MetricsAnalytics.php'));
writeFileSync(
  join(dir, 'api/RestController.php'),
  `<?php
class RestController { public static array $queries=[]; static function prepare($sql) { return new SpyStatement($sql); } }
class SpyStatement {
  public $index;
  function __construct($sql) { $this->index=count(RestController::$queries); RestController::$queries[]=['sql'=>$sql,'types'=>'','values'=>[]]; }
  function bind_param($types,...$values) { if (!$types || strlen($types)!==count($values)) throw new Exception('invalid binding'); RestController::$queries[$this->index]['types']=$types; RestController::$queries[$this->index]['values']=$values; return $this; }
  function execute() { return $this; }
  function fetchAll(&$rows) {
    $sql=RestController::$queries[$this->index]['sql']; $rows=[];
    if (str_contains($sql,'AS snapshot_id')) $rows=[['snapshot_id'=>'15040']];
    elseif ($sql==='SELECT CURRENT_DATE AS day') $rows=[['day'=>'2026-10-09']];
    elseif (str_contains($sql,'AS total')) $rows=[['total'=>'12040']];
    elseif (str_contains($sql,'AS active_days')) $rows=[['events'=>'12040','devices'=>'18','accounts'=>'3','active_days'=>'30','errors'=>null]];
    elseif (str_contains($sql,'AS tracked')) $rows=[['events'=>'50','tracked'=>'40','sessions'=>'8']];
    elseif (str_contains($sql,'AS day,') && !str_contains($sql,'GROUP BY') ) $rows=[];
    elseif (str_contains($sql,'AS day,') && str_contains($sql,'SUM(')) $rows=[['day'=>'2026-10-09','events'=>'3','devices'=>'2','errors'=>'0']];
    elseif (str_contains($sql,'AS weekday')) $rows=[['weekday'=>'4','hour'=>'8','events'=>'3']];
    elseif (str_contains($sql,'GROUP BY '.chr(96).'event'.chr(96))) $rows=[['event'=>'song_selected','events'=>'3','devices'=>'2','accounts'=>'1']];
    elseif (str_contains($sql,'COUNT(*) AS events') && !str_contains($sql,'GROUP BY')) $rows=[['events'=>'3000','devices'=>'8','accounts'=>'2','errors'=>'3']];
    elseif (str_contains($sql,'SELECT COUNT(DISTINCT') && !str_contains($sql,'GROUP BY')) $rows=[['devices'=>'2']];
    elseif (str_contains($sql,'SELECT '.chr(96).'id'.chr(96))) $rows=[['id'=>1,'event'=>'song_selected','metadata'=>'{"device_id":"demo"}']];
    return $this;
  }
  function close() {}
}
class Query { function __construct(public array $values) {} function get($key,$default=null,$unused=false) { return $this->values[$key]??$default; } function getAsInt($key,$default=0) { return (int)($this->values[$key]??$default); } }
class Request { function __construct(public Query $query,public int $account=7) {} }
class Response { function success($data): never { echo json_encode(['data'=>$data,'queries'=>RestController::$queries]); exit; } function error($status,$error): never { echo json_encode(['status'=>$status,'error'=>$error]); exit; } }
`,
);
writeFileSync(
  join(dir, 'run.php'),
  `<?php
require __DIR__.'/api/Metrics.php';
class ExposedMetrics extends Metrics { public function run(Request &$req,Response &$res): never { $this->get($req,$res); } }
$_SESSION=['authType'=>$argv[1]]; $req=new Request(new Query(json_decode($argv[2],true))); $res=new Response();
(new ExposedMetrics())->run($req,$res);
`,
);
function run(admin, query) {
  const result = spawnSync('php', [join(dir, 'run.php'), admin ? 'oidc_admin' : 'oidc', JSON.stringify(query)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
const normal = run(false, {
  account: 99,
  include_summary: 1,
  from: '2026-10-01',
  to: '2026-10-09',
  event: 'song_selected',
  device_id: 'demo',
  limit: 999999,
  offset: -1,
});
assert.equal(normal.data.limit, 10000);
assert.equal(normal.data.offset, 0);
assert.equal(normal.data.snapshot_id, 15040);
assert.equal(normal.data.summary.totals.events, 12040);
assert.equal(normal.data.summary.totals.errors, 0);
assert.equal(normal.data.summary.daily[0].day, '2026-10-09');
assert.equal(normal.data.summary.patterns[0].weekday, 4);
assert.equal(normal.data.metrics[0].metadata.device_id, 'demo');
assert.equal(normal.data.summary.workflow.coverage.tracked, 40);
assert.equal(normal.data.summary.comparison.from, '2026-09-22 00:00:00');
assert.equal(normal.data.summary.comparison.to, '2026-09-30 23:59:59');
for (const query of normal.queries.filter((query) => query.sql !== 'SELECT CURRENT_DATE AS day')) {
  assert.equal(query.values[0], 7, 'non-admin cannot override session account');
  assert.ok(query.sql.includes('$.device_id'));
  assert.ok(query.values.includes('demo'));
  assert.ok(query.sql.includes("'unknown'"));
  assert.equal(query.types.length, query.values.length);
}
assert.ok(
  normal.queries.slice(0, -1).every((query) => !query.sql.includes('LIMIT')),
  'every aggregate must be independent of raw pagination',
);
assert.deepEqual(normal.queries.at(-1).values.slice(-2), [10000, 0]);
const admin = run(true, { include_summary: 1, granularity: 'week' });
assert.equal(admin.queries[0].types, '', 'all-account snapshot query needs no bindings');
assert.ok(admin.queries.some((query) => query.sql.includes('INTERVAL WEEKDAY')));
const filtered = run(true, { account: 42, snapshot_id: 9 });
assert.deepEqual(filtered.queries[0].values, [42, 9]);
assert.equal(filtered.data.summary, null);
for (const query of [{ from: '2026-02-30' }, { from: '2026-10-10', to: '2026-10-09' }, { to: 'garbage' }])
  assert.equal(run(true, query).status, 400);

writeFileSync(
  join(dir, 'pure.php'),
  `<?php
require __DIR__.'/classes/MetricsAnalytics.php';
$weeks=[['device'=>'a','week'=>'2026-09-07'],['device'=>'b','week'=>'2026-09-07'],['device'=>'a','week'=>'2026-09-21'],['device'=>'c','week'=>'2026-09-14'],['device'=>'c','week'=>'2026-09-21']];
echo json_encode(['cohorts'=>MetricsAnalytics::retention($weeks,'2026-09-23'), 'range'=>MetricsAnalytics::previousRange('2028-03-01 00:00:00','2028-03-31 23:59:59'), 'invalid'=>MetricsAnalytics::previousRange('2026-02-30 00:00:00','2026-03-10 23:59:59')]);
`,
);
const pureRun = spawnSync('php', [join(dir, 'pure.php')], { encoding: 'utf8' });
assert.equal(pureRun.status, 0, pureRun.stderr);
const pure = JSON.parse(pureRun.stdout);
assert.deepEqual(pure.cohorts, [
  {
    week: '2026-09-07',
    size: 2,
    weeks: [
      { offset: 0, devices: 2, complete: true },
      { offset: 1, devices: 0, complete: true },
      { offset: 2, devices: 1, complete: false },
    ],
  },
  {
    week: '2026-09-14',
    size: 1,
    weeks: [
      { offset: 0, devices: 1, complete: true },
      { offset: 1, devices: 1, complete: false },
    ],
  },
]);
assert.deepEqual(pure.range, { from: '2028-01-30 00:00:00', to: '2028-02-29 23:59:59' });
assert.equal(pure.invalid, null);
console.log(
  'PASS: authorized SQL scopes, full-range aggregates, snapshot pagination, numeric shapes, invalid dates, equal periods, actual PHP retention including gaps and incomplete weeks',
);
