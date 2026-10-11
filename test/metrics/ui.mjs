import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser } from '../viewport/cdp.mjs';
import { startApp } from '../viewport/servers.mjs';

const app = await startApp({ admin: true });
let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ device: { width: 1440, height: 1050, mobile: false } });
  const body = () => page.evaluate(() => document.body.innerText);
  const click = (text, selector = 'button') =>
    page.evaluate(
      (text, selector) => {
        const element = [...document.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);
        if (!element) throw new Error(`Missing control: ${text}`);
        element.click();
      },
      text,
      selector,
    );
  const tab = async (name, heading) => {
    await click(name, '[role="tab"]');
    await page.waitFor((heading) => document.body.innerText.includes(heading), { label: heading }, heading);
  };
  await page.goto(`${app.origin}/admin.html`);
  await page.waitFor(() => [...document.querySelectorAll('[role="tab"]')].some((el) => el.textContent === 'Metrics'), { timeout: 60000 });
  await click('Metrics', '[role="tab"]');
  await page.waitFor(() => document.body.innerText.includes('Account activity and trends'), { timeout: 60000 });
  assert.ok((await body()).includes('12,040'), (await body()).slice(0, 1600));
  assert.ok(!(await body()).includes('newest 10000'), 'charts must not be sampled');
  mkdirSync('test/metrics/screenshots', { recursive: true });
  const capture = async (filename, overview = false) => {
    await page.evaluate((overview) => {
      const panel = document.querySelector('[role="tabpanel"]');
      window.scrollTo(0, overview ? 0 : panel.getBoundingClientRect().top + window.scrollY - 16);
    }, overview);
    await page.raf();
    writeFileSync(`test/metrics/screenshots/${filename}.png`, await page.screenshot());
  };
  const noOverflow = async () => {
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(size.scroll <= size.width + 1, `page overflows: ${JSON.stringify(size)}`);
  };
  await capture('overview-desktop', true);
  await tab('Adoption', 'Feature adoption by account');
  assert.ok((await body()).includes('Returning devices'));
  await capture('adoption-desktop');
  await tab('Content', 'Presentation workflow');
  assert.ok((await body()).includes('observed sessions'));
  assert.ok(await page.evaluate(() => document.querySelectorAll('svg[role="img"] path[tabindex="0"]').length > 0));
  await capture('content-desktop');
  await tab('Reliability', 'Recurring errors');
  assert.ok((await body()).includes('Media unavailable'));
  await capture('reliability-desktop');
  for (const [name, heading] of [
    ['Overview', 'Account activity and trends'],
    ['Adoption', 'Feature adoption by account'],
    ['Content', 'Presentation workflow'],
    ['Reliability', 'Recurring errors'],
  ]) {
    await tab(name, heading);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.raf();
    await noOverflow();
    await capture(`${name.toLowerCase()}-mobile`);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  }
  await tab('Adoption', 'Feature adoption by account');
  await click('All features');
  await page.evaluate(() => document.querySelector('button[aria-label*="song_selected"]').click());
  await page.waitFor(() => document.body.innerText.includes('song_selected') && !document.querySelector('.MuiCircularProgress-root'), {
    label: 'matrix drill-down',
  });
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some((el) => el.textContent === 'Reset filters')));
  await click('Reset filters');
  await tab('Overview', 'Account activity and trends');
  await click('Last 7 days', '.MuiChip-root');
  await page.waitFor(() => !document.body.innerText.includes('12,040') && document.body.innerText.includes('Feature reach'), {
    label: 'date preset updates',
  });
  await page.evaluate(() => {
    const input = document.querySelector('input[type="date"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2099-01-01');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitFor(() => document.body.innerText.includes('Choose a start date'));
  assert.ok(!(await body()).includes('Feature reach'));
  await click('Last 30 days', '.MuiChip-root');
  await page.waitFor(() => document.body.innerText.includes('12,040'));

  const from = await page.evaluate(() => document.querySelector('input[type="date"]').value);
  const to = await page.evaluate(() => document.querySelectorAll('input[type="date"]')[1].value);
  const params = new URLSearchParams({ from: from + ' 00:00:00', to: to + ' 23:59:59', include_summary: '1', limit: '1' });
  const full = await fetch(`${app.backendOrigin}/rest/Metrics?${params}`).then((r) => r.json());
  assert.equal(full.metrics.length, 1);
  assert.equal(full.total, 12040);
  assert.equal(
    full.summary.eventTimeline.reduce((sum, row) => sum + row.events, 0),
    12040,
  );
  assert.equal(
    full.summary.accounts.reduce((sum, row) => sum + row.events, 0),
    12040,
  );
  assert.ok(full.summary.accounts.some((row) => row.account === 4 && row.events === 0 && row.previous_events > 0));
  assert.ok(full.summary.workflow.coverage.tracked < full.summary.workflow.coverage.events);
  const filter = new URLSearchParams(params);
  filter.set('device_id', 'demo-device-0');
  const device = await fetch(`${app.backendOrigin}/rest/Metrics?${filter}`).then((r) => r.json());
  assert.equal(device.summary.totals.devices, 1);
  const first = new URLSearchParams(params);
  first.set('include_summary', '0');
  first.set('limit', '10000');
  const p1 = await fetch(`${app.backendOrigin}/rest/Metrics?${first}`).then((r) => r.json());
  first.set('offset', '10000');
  first.set('snapshot_id', String(p1.snapshot_id));
  const p2 = await fetch(`${app.backendOrigin}/rest/Metrics?${first}`).then((r) => r.json());
  assert.equal(p1.metrics.length + p2.metrics.length, 12040);
  assert.equal(new Set([...p1.metrics, ...p2.metrics].map((row) => row.id)).size, 12040);
  // Inspect the actual export produced by the UI without placing a file in the user's downloads.
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      blob.text().then((csv) => {
        window.__metricsExport = csv;
      });
      return create(blob);
    };
    document.addEventListener(
      'click',
      (e) => {
        if (e.target instanceof HTMLAnchorElement && e.target.download) e.preventDefault();
      },
      true,
    );
  });
  await click('Export all events');
  await page.waitFor(() => typeof window.__metricsExport === 'string', { timeout: 30000, label: 'complete UI export' });
  assert.equal(await page.evaluate(() => window.__metricsExport.trim().split('\r\n').length), 12041);
  await page.evaluate(() => { delete window.__metricsExport; });
  await page.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: -1, uploadThroughput: -1 });
  await click('Export all events');
  await page.waitFor(() => document.body.innerText.includes('Preparing export'));
  await click('Cancel');
  await page.waitFor(() => !document.body.innerText.includes('Preparing export'));
  assert.equal(await page.evaluate(() => window.__metricsExport), undefined, 'cancelled export must not download');
  await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // Force a metrics request failure and verify an actionable error, rather than stale charts.
  await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['*rest/Metrics*'] });
  await click('Refresh');
  await page.waitFor(() => document.body.innerText.includes('Metrics could not be loaded'), { label: 'metrics failure state' });
  await page.send('Network.setBlockedURLs', { urls: [] });
  await click('Refresh');
  await page.waitFor(() => document.body.innerText.includes('Account activity and trends'));
  assert.deepEqual(page.pageErrors, []);
  console.log(
    'PASS: all four tabs at desktop/phone sizes, diagrams, full-range content/account counts, prior-only accounts, honest session coverage, matrix drill-down, date validation, device filter, complete snapshot export, error recovery, no overflow or runtime exceptions',
  );
} finally {
  if (browser) await browser.close();
  await app.stop();
}
