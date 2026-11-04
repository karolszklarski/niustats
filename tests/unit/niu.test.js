import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadData, NiuError, uniqueTrips } from '../../public/js/niu.js';

const TOKEN_URL = 'https://account-fk.niu.com/v3/api/oauth2/token';
const SCOOTERS_URL = 'https://app-api-fk.niu.com/v5/scooter/list';
const scooters = [{ sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' }];
const track = (trackId, date, distance, battery) => ({ trackId, date, distance, power_consumption: battery });

/**
 * A fetch that answers like Niu: `pages` holds the trip list pages of each scooter, and `answer` can
 * replace the answer to any request. Records the requests in `requests`.
 */
function fakeNiu({ pages = {}, answer } = {}) {
  const requests = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    const request = { url, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body };
    requests.push(request);
    const replaced = await answer?.(request);
    if (replaced) return replaced;
    if (url === TOKEN_URL) return json({ status: 0, data: { token: { access_token: 'test-token' } } });
    if (url === SCOOTERS_URL) return json({ status: 0, data: { items: scooters } });
    const { sn, page } = Object.fromEntries(init.body);
    return json({ status: 0, data: { items: pages[sn]?.[page - 1] ?? [] } });
  };
  return { fetch, requests };
}

async function download(niu, login = 'rider@example.com') {
  const logs = [];
  const data = await downloadData(login, 'hash', { fetch: niu.fetch, log: (message) => logs.push(message) });
  return { data, log: logs.join('') };
}

test('signs in with the login and password hash as JSON', async () => {
  const niu = fakeNiu();
  await download(niu, 'rider"x\\y@example.com');
  const [signIn] = niu.requests;
  assert.equal(signIn.url, TOKEN_URL);
  assert.equal(signIn.method, 'POST');
  assert.equal(signIn.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(signIn.body), {
    account: 'rider"x\\y@example.com',
    app_id: 'niu_fksss2ws',
    grant_type: 'password',
    password: 'hash',
    scope: 'base',
  });
});

test('lists the scooters with the token', async () => {
  const niu = fakeNiu();
  const { data } = await download(niu);
  assert.deepEqual(niu.requests[1].headers, { 'content-type': 'application/json', token: 'test-token' });
  assert.deepEqual(data.vehicles, { SN1: scooters[0] });
});

test('reads trip pages through track.php until a page is empty four times', async () => {
  const niu = fakeNiu({ pages: { SN1: [[track('a', 20240120, 5000, 10)], [track('b', 20240105, 10000, 20)]] } });
  const { data, log } = await download(niu);

  const pageRequests = niu.requests.slice(2);
  assert.ok(pageRequests.every(({ url, method }) => url === 'track.php' && method === 'POST'));
  assert.deepEqual(
    pageRequests.map(({ body }) => Object.fromEntries(body)),
    [1, 2, 3, 3, 3, 3].map((page) => ({ page: String(page), token: 'test-token', sn: 'SN1' })),
  );
  assert.deepEqual(data.trips, { SN1: [{ d: 20240105, m: 10000, b: 20 }, { d: 20240120, m: 5000, b: 10 }] });
  assert.equal(
    log,
    'Requesting token... ok\n' +
      'Requesting vehicles... SN1\n' +
      'Requesting SN1 page 1... ok\n' +
      'Requesting SN1 page 2... ok\n' +
      'Requesting SN1 page 3... empty, retry\n'.repeat(3) +
      'Requesting SN1 page 3... empty, ok\n',
  );
});

test('keeps the first copy of each trip id, and every trip without one', () => {
  const withoutId = { date: 20240107, distance: 1, power_consumption: 1 };
  assert.deepEqual(
    uniqueTrips([track('a', 1, 1, 1), track('b', 2, 2, 2), track('a', 1, 1, 1), withoutId, withoutId]),
    [track('a', 1, 1, 1), track('b', 2, 2, 2), withoutId, withoutId],
  );
});

test('reports the message from Niu', async () => {
  const niu = fakeNiu({
    answer: ({ url }) => url === TOKEN_URL && new Response(JSON.stringify({ status: 1, desc: 'Wrong password' })),
  });
  await assert.rejects(download(niu), new NiuError('Wrong password'));
});

test('reports a response that is not a Niu answer', async () => {
  const niu = fakeNiu({ answer: ({ url }) => url === SCOOTERS_URL && new Response('<html>Bad gateway</html>', { status: 502 }) });
  await assert.rejects(download(niu), new NiuError('unexpected response from Niu (HTTP 502)'));
});

test('reports a failed connection', async () => {
  const niu = fakeNiu({
    answer: ({ url }) => {
      if (url === TOKEN_URL) throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(download(niu), new NiuError('could not connect (Failed to fetch)'));
});
