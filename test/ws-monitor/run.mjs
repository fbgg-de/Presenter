/**
 * WebSocket monitor integration test.
 *
 * Boots the real relay (ws-server/src/server.ts) plus a stand-in for the PHP backend's
 * /rest/ValidateMonitorToken, then drives a real service's worth of clients past a
 * monitor and asserts what the monitor sees.
 *
 *   node test/ws-monitor/run.mjs            # run everything
 *   node test/ws-monitor/run.mjs --verbose  # also stream the relay's own log
 *
 * What matters here is the separation: an account-scoped monitor must see its own
 * account's traffic and nothing else, a bad token must be refused, and the monitor must
 * never be relayed to as if it were a peer.
 *
 * Uses the same harness as test/ws-sync — see that README for what the client models cover.
 */
import http from 'node:http';
import { WebSocket } from 'ws';
import { startRelay, quiesce, waitFor, sleep, Reporter } from '../ws-sync/harness.mjs';
import { OperatorClient, MusicianClient, ViewerClient, makeShow } from '../ws-sync/clients.mjs';

const VERBOSE = process.argv.includes('--verbose');
const report = new Reporter();

const ACCOUNT_A = 41001;
const ACCOUNT_B = 41002;

/**
 * Stand-in for the PHP backend. Mirrors what api/ValidateMonitorToken.php returns, so the
 * relay's resolveMonitorToken path is exercised for real rather than stubbed out.
 *
 * Tokens are trivial here: "admin" is unrestricted, "acct:<n>" is bound to one account,
 * anything else is rejected. The real signing is MonitorToken's job and is tested by PHP.
 */
async function startFakeBackend() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.endsWith('/rest/ValidateMonitorToken')) {
      res.writeHead(404).end('{}');
      return;
    }
    const token = url.searchParams.get('token') ?? '';
    res.setHeader('content-type', 'application/json');
    if (token === 'admin') {
      res.writeHead(200).end(JSON.stringify({ scope: 'admin', account: null }));
      return;
    }
    const bound = /^acct:(\d+)$/.exec(token);
    if (bound) {
      res.writeHead(200).end(JSON.stringify({ scope: 'account', account: Number(bound[1]) }));
      return;
    }
    res.writeHead(403).end(JSON.stringify({ error: 'Invalid or expired monitor token.' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise((r) => server.close(r)) };
}

/** Minimal monitor client — the wire-level equivalent of useWsMonitor. */
class MonitorClient {
  constructor({ url, token, account = null }) {
    this.url = url;
    this.token = token;
    this.account = account;
    this.entries = [];
    this.accounts = [];
    this.bufferSize = null;
    this.limits = null;
    this.relayVersion = null;
    /** Size of the last replayed backlog, kept apart from entries the live tail adds after it. */
    this.backlogSize = 0;
    this.authError = null;
    this.closeCode = null;
    /** Anything that is not a monitor protocol frame — a monitor must never be relayed to. */
    this.strayMessages = [];
    this.lastMessageAt = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('monitor connect timed out')), 5000);

      this.ws.on('open', () => {
        this.ws.send(
          JSON.stringify({ action: 'auth', role: 'monitor', token: this.token, account: this.account, client: { role: 'monitor' } }),
        );
      });

      this.ws.on('message', (raw) => {
        this.lastMessageAt = Date.now();
        const msg = JSON.parse(raw.toString());
        switch (msg.type) {
          case 'monitor_ok':
            this.bufferSize = msg.bufferSize;
            this.limits = msg.limits;
            this.relayVersion = msg.version;
            this.accounts = msg.accounts ?? [];
            this.entries = msg.entries ?? [];
            this.backlogSize = this.entries.length;
            clearTimeout(timer);
            resolve(this);
            return;
          case 'trace':
            this.entries.push(msg.entry);
            return;
          case 'monitor_peers':
            this.accounts = msg.accounts ?? [];
            return;
          case 'monitor_config':
            this.bufferSize = msg.bufferSize;
            return;
          case 'monitor_cleared':
            this.entries = [];
            return;
          case 'auth_error':
            this.authError = msg.error;
            clearTimeout(timer);
            resolve(this);
            return;
          case 'error':
            this.lastError = msg.error;
            return;
          default:
            this.strayMessages.push(msg);
        }
      });

      this.ws.on('close', (code) => {
        this.closeCode = code;
        clearTimeout(timer);
        resolve(this);
      });
      this.ws.on('error', () => {});
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  close() {
    this.ws?.close();
  }

  /** Traces whose event matches, optionally restricted to one account. */
  find(event, account) {
    return this.entries.filter((e) => e.event === event && (account === undefined || e.account === account));
  }
}

// ── Scenarios ───────────────────────────────────────────────────────────────

const scenarios = [];
const scenario = (name, description, fn) => scenarios.push({ name, description, fn });

scenario('Bad token is refused', 'A token the backend does not recognise never becomes a monitor.', async ({ url }) => {
  const monitor = await new MonitorClient({ url, token: 'not-a-real-token' }).connect();
  report.check('auth_error returned', monitor.authError !== null, `authError=${monitor.authError}`);
  report.check('no backlog delivered', monitor.entries.length === 0, `got ${monitor.entries.length} entries`);
  await sleep(100);
  report.equal('socket closed with 4004', monitor.closeCode, 4004);
});

scenario('Live trace of a real service', 'An admin monitor sees the operator broadcast, with its fan-out count.', async ({ url }) => {
  const monitor = await new MonitorClient({ url, token: 'admin', account: ACCOUNT_A }).connect();
  report.check('relay version reported', typeof monitor.relayVersion === 'string', `version=${monitor.relayVersion}`);

  const show = makeShow();
  const operator = await new OperatorClient({ url, account: ACCOUNT_A, show, midiTrackingMaster: 'operator' }).connect();
  const musician = await new MusicianClient({ url, account: ACCOUNT_A, show, syncMode: 'operator', musicianName: 'Anna' }).connect();
  const viewer = await new ViewerClient({ url, account: ACCOUNT_A, name: 'viewer-A' }).connect();
  const clients = [operator, musician, viewer];
  await quiesce(clients);

  operator.setItemAndBlock(0, 1);
  await quiesce(clients);

  await waitFor(() => monitor.find('musician_sync', ACCOUNT_A).length > 0, { label: 'a musician_sync trace' });

  const syncs = monitor.find('musician_sync', ACCOUNT_A);
  report.check('operator broadcast was traced', syncs.length > 0, `${syncs.length} musician_sync entries`);
  report.note(`traced events: ${[...new Set(monitor.entries.map((e) => e.event))].join(', ')}`);

  const broadcast = syncs[syncs.length - 1];
  report.check('fan-out count recorded', broadcast.peers >= 2, `peers=${broadcast.peers}`);
  report.check('direction is inbound', broadcast.dir === 'in', `dir=${broadcast.dir}`);
  report.check('sender role recorded', broadcast.role === 'operator', `role=${broadcast.role}`);

  // The whole point of "include text payloads": the trace must carry the lyrics, not a summary.
  const payload = JSON.parse(broadcast.payload);
  report.check('payload is verbatim', typeof payload?.data?.blockName === 'string', `blockName=${payload?.data?.blockName}`);
  report.check(
    'payload carries block text',
    Array.isArray(payload?.data?.blockLines),
    `blockLines=${JSON.stringify(payload?.data?.blockLines)?.slice(0, 60)}`,
  );

  const auths = monitor.find('auth', ACCOUNT_A);
  report.check('connection handshakes traced', auths.length >= 3, `${auths.length} auth entries`);

  report.check('monitor was never relayed to', monitor.strayMessages.length === 0, JSON.stringify(monitor.strayMessages).slice(0, 200));

  clients.forEach((c) => c.close());
  monitor.close();
});

scenario('Accounts stay separated', 'A monitor bound to one account never sees another account.', async ({ url }) => {
  const monitorA = await new MonitorClient({ url, token: `acct:${ACCOUNT_A}`, account: ACCOUNT_A }).connect();
  const monitorAll = await new MonitorClient({ url, token: 'admin', account: null }).connect();

  const showA = makeShow();
  const showB = makeShow();
  const operatorA = await new OperatorClient({ url, account: ACCOUNT_A, show: showA, midiTrackingMaster: 'operator' }).connect();
  const operatorB = await new OperatorClient({ url, account: ACCOUNT_B, show: showB, midiTrackingMaster: 'operator' }).connect();
  await quiesce([operatorA, operatorB]);

  operatorA.setItemAndBlock(0, 1);
  operatorB.setItemAndBlock(0, 2);
  await quiesce([operatorA, operatorB]);
  await sleep(200);

  const leaked = monitorA.entries.filter((e) => e.account === ACCOUNT_B);
  report.equal('bound monitor saw no foreign traffic', leaked.length, 0);
  report.check(
    'bound monitor saw its own traffic',
    monitorA.find('musician_sync', ACCOUNT_A).length > 0,
    `${monitorA.entries.length} entries`,
  );

  report.check('all-accounts monitor saw account A', monitorAll.find('musician_sync', ACCOUNT_A).length > 0);
  report.check('all-accounts monitor saw account B', monitorAll.find('musician_sync', ACCOUNT_B).length > 0);

  // A bound token must not be able to switch scope by simply asking.
  monitorA.send({ action: 'monitor_subscribe', account: ACCOUNT_B });
  await sleep(200);
  const leakedAfter = monitorA.entries.filter((e) => e.account === ACCOUNT_B);
  report.equal('bound monitor cannot re-scope', leakedAfter.length, 0);
  report.check('re-scope was refused with an error', typeof monitorA.lastError === 'string', `error=${monitorA.lastError}`);

  operatorA.close();
  operatorB.close();
  monitorA.close();
  monitorAll.close();
});

scenario('The watched account can see the watcher', 'A monitor appears in the operator’s connected-clients list.', async ({ url }) => {
  const show = makeShow();
  const operator = await new OperatorClient({ url, account: ACCOUNT_A, show, midiTrackingMaster: 'operator' }).connect();
  await quiesce([operator]);
  const before = operator.peerCount;

  const monitor = await new MonitorClient({ url, token: 'admin', account: ACCOUNT_A }).connect();
  await waitFor(() => operator.peers.some((p) => p.role === 'monitor'), { label: 'the monitor to show up as a peer' });

  report.note(`operator peers: ${operator.peers.map((p) => p.role).join(', ')}`);
  report.equal('peer count grew by one', operator.peerCount, before + 1);
  report.check(
    'monitor is listed by role',
    operator.peers.some((p) => p.role === 'monitor'),
  );

  monitor.close();
  await waitFor(() => !operator.peers.some((p) => p.role === 'monitor'), { label: 'the monitor to disappear' });
  report.equal('peer count returns on disconnect', operator.peerCount, before);

  operator.close();
});

scenario('Buffer size is adjustable on the fly', 'Shrinking the buffer trims what is already held.', async ({ url }) => {
  const monitor = await new MonitorClient({ url, token: 'admin', account: ACCOUNT_A }).connect();
  report.check('limits advertised', monitor.limits?.min === 50 && monitor.limits?.max === 5000, JSON.stringify(monitor.limits));

  const show = makeShow();
  const operator = await new OperatorClient({ url, account: ACCOUNT_A, show, midiTrackingMaster: 'operator' }).connect();
  await quiesce([operator]);

  for (let i = 0; i < 40; i++) operator.setItemAndBlock(i % 3, i % 2);
  await quiesce([operator]);
  await sleep(200);
  report.note(`buffered ${monitor.entries.length} entries before resizing`);

  monitor.send({ action: 'monitor_config', bufferSize: 50 });
  await waitFor(() => monitor.bufferSize === 50, { label: 'the relay to confirm the new size' });
  report.equal('relay confirmed new buffer size', monitor.bufferSize, 50);

  // Re-subscribing replays the buffer, which is how we observe the trim server-side.
  // Asserted on the backlog rather than on `entries`: re-subscribing itself makes the relay
  // re-broadcast a peer_count, which is traced and arrives on the live tail straight after.
  monitor.entries = [];
  monitor.backlogSize = 0;
  monitor.send({ action: 'monitor_subscribe', account: ACCOUNT_A });
  await waitFor(() => monitor.backlogSize > 0, { label: 'a fresh backlog' });
  report.check('buffer honours the new cap', monitor.backlogSize <= 50, `${monitor.backlogSize} entries replayed`);

  // Put it back so a later scenario is not starved.
  monitor.send({ action: 'monitor_config', bufferSize: 500 });
  await waitFor(() => monitor.bufferSize === 500, { label: 'the buffer size to be restored' });

  monitor.send({ action: 'monitor_clear' });
  await waitFor(() => monitor.entries.length === 0, { label: 'the buffer to be cleared' });
  report.equal('clear empties the buffer', monitor.entries.length, 0);

  operator.close();
  monitor.close();
});

// ── Runner ──────────────────────────────────────────────────────────────────

const backend = await startFakeBackend();
const relay = await startRelay({ verbose: VERBOSE, backendUrl: backend.url });
console.log(`\x1b[90mrelay: ${relay.url}   backend: ${backend.url}\x1b[0m`);

try {
  for (const s of scenarios) {
    report.beginScenario(s.name, s.description);
    try {
      await s.fn({ url: relay.url });
    } catch (err) {
      report.scenarioError(err);
    }
  }
} finally {
  await relay.stop();
  await backend.stop();
}

const failed = report.summary();
process.exit(failed === 0 ? 0 : 1);
