/**
 * The ChurchTools agenda sync (ChurchToolsCcli::syncAgendaSongs) against an in-memory agenda:
 * a missing agenda is created from the event's calendar, song slots are filled in place (so songs
 * stay between the agenda's headers and keep their notes), extra songs land after the last song,
 * leftover slots go, and a locked agenda is left alone.
 *
 *   node test/churchtools/run.mjs
 */
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let failed = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) {
    failed++;
    console.log(`FAIL ${name}\n  got  ${a}\n  want ${b}`);
  } else {
    console.log(`ok   ${name}`);
  }
};

if (spawnSync('php', ['-v']).status !== 0) {
  console.log('skip: php is not available');
  process.exit(0);
}

// ChurchToolsCcli requires its client from __DIR__, so it runs from a copy next to a fake client.
const dir = mkdtempSync(join(tmpdir(), 'ct-agenda-'));
copyFileSync('classes/ChurchToolsCcli.php', join(dir, 'ChurchToolsCcli.php'));
writeFileSync(join(dir, 'Logging.php'), '<?php class Logging { static function debug($m) {} }');
writeFileSync(
  join(dir, 'ChurchToolsClient.php'),
  `<?php
/** Fake ChurchTools: one event, its agenda (or none) as an ordered item list. */
class ChurchToolsClient {
  static $agenda = null; static $nextId = 100; static $writes = 0; static $calendarId = null;
  static function item($id) { foreach (self::$agenda['items'] as $i => $it) if ($it['id'] == $id) return $i; return null; }
  static function get($path, $params = [], $cfg = []) {
    if (preg_match('#/agenda$#', $path)) return self::$agenda ? ['data' => self::$agenda] : ['message' => 'not found'];
    return ['data' => ['calendar' => ['domainIdentifier' => '7', 'title' => 'Gottesdienst']]];
  }
  static function post($path, $params = [], $data = [], $cfg = []) {
    self::$writes++;
    $it = ['id' => self::$nextId++, 'type' => 'song', 'song' => ['arrangementId' => $data['arrangementId']], 'note' => null];
    self::$agenda['items'][] = $it;
    return ['data' => $it];
  }
  static function put($path, $params = [], $data = [], $cfg = []) {
    self::$writes++;
    if (preg_match('#/agenda$#', $path)) {
      self::$calendarId = $data['calendarId'];
      self::$agenda = ['id' => 1, 'isLocked' => false, 'items' => []];
      return ['data' => self::$agenda];
    }
    $i  = self::item((int)basename($path));
    $it = self::$agenda['items'][$i];
    $it['song'] = ['arrangementId' => $data['arrangementId']];
    $it['note'] = $data['note'] ?? null;
    self::$agenda['items'][$i] = $it;
    if (isset($params['after_id'])) {
      array_splice(self::$agenda['items'], $i, 1);
      array_splice(self::$agenda['items'], self::item($params['after_id']) + 1, 0, [$it]);
    }
    return ['data' => $it];
  }
  static function delete($path, $params = [], $cfg = []) {
    self::$writes++;
    array_splice(self::$agenda['items'], self::item((int)basename($path)), 1);
    return null;
  }
}`,
);

const harness = join(dir, 'run.php');
writeFileSync(
  harness,
  `<?php
require __DIR__ . '/ChurchToolsCcli.php';
$sync = new ReflectionMethod('ChurchToolsCcli', 'syncAgendaSongs');
$h = fn ($id, $title) => ['id' => $id, 'type' => 'header', 'title' => $title];
$s = fn ($id, $arr, $note = null) => ['id' => $id, 'type' => 'song', 'song' => $arr ? ['arrangementId' => $arr] : null, 'note' => $note, 'duration' => 300];
// Agenda as labels: headers by title, songs by arrangement (+ note).
$view = fn () => array_map(fn ($it) => $it['type'] === 'song' ? ($it['song']['arrangementId'] ?? 0) . ($it['note'] ? ':' . $it['note'] : '') : $it['title'], ChurchToolsClient::$agenda['items'] ?? []);
$run = function ($agenda, $songs) use ($sync, $view) {
  ChurchToolsClient::$agenda = $agenda; ChurchToolsClient::$writes = 0; ChurchToolsClient::$calendarId = null;
  $fail = $sync->invoke(null, 42, $songs, []);
  return ['fail' => $fail, 'agenda' => $view(), 'writes' => ChurchToolsClient::$writes, 'calendarId' => ChurchToolsClient::$calendarId];
};
$out = [];
$out['create'] = $run(null, [10, 20]);
$template = ['id' => 1, 'isLocked' => false, 'items' => [$h(1, 'Welcome'), $s(2, null, 'band'), $s(3, null), $h(4, 'Sermon')]];
$out['fill'] = $run($template, [10, 20, 30]);
$full = ['id' => 1, 'isLocked' => false, 'items' => [$h(1, 'Welcome'), $s(2, 10, 'band'), $s(3, 20), $s(5, 30), $h(4, 'Sermon')]];
$out['shrink'] = $run($full, [20]);
$out['same'] = $run($full, [10, 20, 30]);
$out['locked'] = $run(['isLocked' => true] + $full, [30]);
echo json_encode($out);
`,
);

const res = spawnSync('php', [harness], { encoding: 'utf8' });
if (res.status !== 0) {
  console.log(res.stdout, res.stderr);
  process.exit(1);
}
const out = JSON.parse(res.stdout);

eq('missing agenda is created from the event calendar', [out.create.fail, out.create.agenda, out.create.calendarId], [null, ['10', '20'], 7]);
eq('template slots are filled in place, extra song after the last one', out.fill.agenda, ['Welcome', '10:band', '20', '30', 'Sermon']);
eq('leftover song slots are removed', out.shrink.agenda, ['Welcome', '20:band', 'Sermon']);
eq('an agenda already in sync is not written', out.same.writes, 0);
eq('a locked agenda is left alone', [out.locked.fail, out.locked.writes], ['locked', 0]);

process.exit(failed ? 1 : 0);
