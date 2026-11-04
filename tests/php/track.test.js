// Tests public/track.php on the PHP version of the web host, in Docker. A stub of the Niu API
// (niu-stub.php) runs in the same container, so the tests never reach the real Niu servers.
// PHP runs with short tags off and every error, warning and deprecation printed into the response.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { PHP_VERSION } from './php-version.js';

const CONTAINER = 'niustats-php-test';
const PORT = 8093;
const TRACK_URL = `http://127.0.0.1:${PORT}/track.php`;
const USER_AGENT = 'manager/5.2.0 (android; SM-A202F 11);lang=pl-PL;clientIdentifier=Overseas;timezone=Europe/Warsaw;model=samsung_SM-A202F;deviceName=SM-A202F;ostype=android';

const repoPath = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

before(async () => {
  try {
    docker('rm', '-f', CONTAINER);
  } catch {
    // No container left over from an earlier run.
  }
  docker(
    'run', '--rm', '--detach', '--name', CONTAINER,
    '--publish', `127.0.0.1:${PORT}:8000`,
    '--volume', `${repoPath('public')}:/app:ro`,
    '--volume', `${repoPath('tests/php')}:/stub:ro`,
    '--env', 'NIU_API_URL=http://127.0.0.1:9000',
    '--env', 'PHP_CLI_SERVER_WORKERS=4',
    `php:${PHP_VERSION}-cli`, 'sh', '-c',
    'php -S 127.0.0.1:9000 /stub/niu-stub.php & ' +
      'exec php -d short_open_tag=0 -d display_errors=1 -d error_reporting=-1 -S 0.0.0.0:8000 -t /app',
  );
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/robots.txt`)).ok) break;
    } catch {
      // The server is not up yet.
    }
    if (attempt === 50) throw new Error(`PHP did not start:\n${docker('logs', CONTAINER)}`);
    await sleep(200);
  }
});

after(() => {
  docker('rm', '-f', CONTAINER);
});

/** Sends a request to track.php. The response must be JSON and nothing else, so a PHP warning fails the test. */
async function trackPhp(fields, method = 'POST') {
  const response = await fetch(TRACK_URL, method === 'POST' ? { method, body: new URLSearchParams(fields) } : { method });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    assert.fail(`track.php did not answer with JSON:\n${text.slice(0, 500)}`);
  }
  assert.match(response.headers.get('content-type'), /^application\/json/);
  return { status: response.status, json };
}

const error = (desc) => ({ data: [], status: -1, desc });
const valid = { page: '2', sn: 'SN1', token: 'eyJ0eXAi.J9-x_1' };

test('forwards the request to the Niu trip list as the mobile app', async () => {
  const { status, json } = await trackPhp(valid);
  assert.equal(status, 200);
  assert.equal(json.status, 0);
  // The stub puts the request it got into the id of the trip.
  const { body, ...request } = JSON.parse(json.data.items[0].trackId);
  assert.deepEqual(request, {
    method: 'POST',
    path: '/v5/track/list/v3',
    contentType: 'application/json',
    token: valid.token,
    userAgent: USER_AGENT,
  });
  assert.deepEqual(JSON.parse(body), { pagesize: 100, index: '2', sn: 'SN1' });
});

test('passes on only the trip fields the site uses', async () => {
  const { json } = await trackPhp(valid);
  const { trackId } = json.data.items[0];
  assert.deepEqual(json, {
    status: 0,
    data: { items: [{ trackId, date: 20240105, distance: 6461, power_consumption: 13 }] },
  });
});

test('passes on a trip without an id', async () => {
  const { json } = await trackPhp({ ...valid, sn: 'NOID' });
  assert.deepEqual(json.data.items, [{ date: 20240105, distance: 6461, power_consumption: 13 }]);
});

test('passes on an empty page as an empty list', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'EMPTY' }), { status: 200, json: { status: 0, data: { items: [] } } });
});

test('passes on only the code and message of a refusal from Niu', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'REFUSED' }), {
    status: 200,
    json: { data: [], status: 1131, desc: 'Incorrect Login Details' },
  });
});

test('reports an answer from Niu that cannot be read', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'NOTJSON' }), { status: 502, json: error('Niu sent an unreadable answer') });
});

test('reports an answer from Niu without a trip list', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'NOLIST' }), { status: 502, json: error('Niu sent an unreadable answer') });
});

test('rejects a page that is not a positive number', async () => {
  for (const page of ['0', '-1', 'x', '1","sn":"SN2', '2\n', '']) {
    assert.deepEqual(await trackPhp({ ...valid, page }), { status: 400, json: error('Invalid page') }, page);
  }
});

test('rejects a serial number with unexpected characters', async () => {
  for (const sn of ['SN1","pagesize":1', 'SN 1', 'SN1\n', '']) {
    assert.deepEqual(await trackPhp({ ...valid, sn }), { status: 400, json: error('Invalid serial number') }, sn);
  }
});

test('rejects a token with spaces or line breaks', async () => {
  for (const token of ['abc\r\nX-Injected: 1', 'abc\n', 'abc def', '']) {
    assert.deepEqual(await trackPhp({ ...valid, token }), { status: 400, json: error('Invalid token') }, token);
  }
});

test('rejects a request without fields', async () => {
  assert.deepEqual(await trackPhp({}), { status: 400, json: error('Invalid page') });
});

test('rejects a field sent as a list', async () => {
  const { page, ...rest } = valid;
  assert.deepEqual(await trackPhp({ 'page[]': page, ...rest }), { status: 400, json: error('Invalid page') });
});

test('accepts only POST', async () => {
  assert.deepEqual(await trackPhp({}, 'GET'), { status: 405, json: error('Method not allowed') });
});

test('reports an HTTP error from Niu', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'HTTP500' }), { status: 502, json: error('Niu answered with HTTP 500') });
});

test('gives up when Niu does not answer in time', async () => {
  assert.deepEqual(await trackPhp({ ...valid, sn: 'SLOW' }), { status: 504, json: error('Niu did not answer in time') });
});
