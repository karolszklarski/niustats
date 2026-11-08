import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadData, NiuError, uniqueTrips } from '../../public/js/niu.js';

const TOKEN_URL = 'https://account-fk.niu.com/v3/api/oauth2/token';
const SCOOTERS_URL = 'https://app-api-fk.niu.com/v5/scooter/list';
const scooters = [{ sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' }];
const track = (trackId, date, distance, battery) => ({ trackId, date, distance, power_consumption: battery });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

function fakeNiu({ pages = {}, answer } = {}) {
  const requests = [];
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

async function download(niu, { login = 'rider@example.com', seen = { log: '', waits: [] } } = {}) {
  const data = await downloadData(login, 'hash', {
    fetch: niu.fetch,
    log: (message) => {
      seen.log += message;
    },
    wait: async (ms) => {
      seen.waits.push(ms);
    },
  });
  return { data, ...seen };
}

const isTripPage = (request, page) => request.url === 'track.php' && request.body.get('page') === String(page);

test('signs in with the login and password hash as JSON', async () => {
  const niu = fakeNiu();
  await download(niu, { login: 'rider"x\\y@example.com' });
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
  const { data, log, waits } = await download(niu);

  const pageRequests = niu.requests.slice(2);
  assert.ok(pageRequests.every(({ url, method }) => url === 'track.php' && method === 'POST'));
  assert.deepEqual(
    pageRequests.map(({ body }) => Object.fromEntries(body)),
    [1, 2, 3, 3, 3, 3].map((page) => ({ page: String(page), token: 'test-token', sn: 'SN1' })),
  );
  assert.deepEqual(data.trips, { SN1: [{ d: 20240105, m: 10000, b: 20 }, { d: 20240120, m: 5000, b: 10 }] });
  assert.equal(
    log,
    'Signing in... ok\n' +
      'Getting your scooters... SN1\n' +
      'Getting trips for SN1, page 1... ok\n' +
      'Getting trips for SN1, page 2... ok\n' +
      'Getting trips for SN1, page 3... empty, trying again\n'.repeat(3) +
      'Getting trips for SN1, page 3... no more trips\n',
  );
  assert.deepEqual(waits, []);
});

const pageOf = (size, prefix = 'a') => Array.from({ length: size }, (_, i) => track(`${prefix}${i}`, 20240105, 1000, 2));

test('pauses before asking again for an empty page after a full one, as the list should go on', async () => {
  let empties = 2;
  const niu = fakeNiu({
    pages: { SN1: [pageOf(100), [track('last', 20240106, 5000, 10)]] },
    answer: (request) => isTripPage(request, 2) && empties-- > 0 && json({ status: 0, data: { items: [] } }),
  });
  const { data, log, waits } = await download(niu);

  assert.equal(data.trips.SN1.length, 101);
  assert.deepEqual(waits, [1000, 2000]);
  assert.match(
    log,
    /page 2\.\.\. empty, trying again in 1 s\nGetting trips for SN1, page 2\.\.\. empty, trying again in 2 s\nGetting trips for SN1, page 2\.\.\. ok\n/,
  );
});

test('takes a page that stays empty after a full one as the end of the list', async () => {
  const niu = fakeNiu({ pages: { SN1: [pageOf(100)] } });
  const { data, log, waits } = await download(niu);

  assert.equal(data.trips.SN1.length, 100);
  assert.deepEqual(waits, [1000, 2000, 4000]);
  assert.equal(niu.requests.filter((request) => isTripPage(request, 2)).length, 4);
  assert.match(log, /page 2\.\.\. no more trips\n$/);
});

test('counts a page longer than asked for as full, and one short of it as the end', async () => {
  const pausesAfter = async (size) => (await download(fakeNiu({ pages: { SN1: [pageOf(size)] } }))).waits;

  assert.deepEqual(await pausesAfter(150), [1000, 2000, 4000]);
  assert.deepEqual(await pausesAfter(99), []);
});

test('does not pause for a scooter without trips', async () => {
  const { data, waits } = await download(fakeNiu());

  assert.deepEqual(data.trips, { SN1: [] });
  assert.deepEqual(waits, []);
});

test('starts the pauses again on each page', async () => {
  const emptyOnce = new Set(['2', '3']);
  const niu = fakeNiu({
    pages: { SN1: [pageOf(100, 'a'), pageOf(100, 'b'), [track('last', 20240106, 5000, 10)]] },
    answer: ({ url, body }) => url === 'track.php' && emptyOnce.delete(body.get('page')) && json({ status: 0, data: { items: [] } }),
  });
  const { data, waits } = await download(niu);

  assert.equal(data.trips.SN1.length, 201);
  assert.deepEqual(waits, [1000, 1000]);
});

test('leaves out a trip that has not ended yet', async () => {
  const niu = fakeNiu({
    pages: {
      SN1: [[{ ...track('a', 20240120, 37808, 7), type: 'riding' }, { ...track('b', 20240105, 10000, 20), type: 'complete' }]],
    },
  });
  const { data } = await download(niu);

  assert.deepEqual(data.trips, { SN1: [{ d: 20240105, m: 10000, b: 20 }] });
});

test('keeps the ended copy of a trip listed both as riding and as ended', async () => {
  const niu = fakeNiu({
    pages: {
      SN1: [[{ ...track('a', 20240120, 37808, 7), type: 'riding' }], [{ ...track('a', 20240120, 40000, 50), type: 'complete' }]],
    },
  });
  const { data } = await download(niu);

  assert.deepEqual(data.trips, { SN1: [{ d: 20240120, m: 40000, b: 50 }] });
});

const twoScooters = json({ status: 0, data: { items: [{ sn_id: 'SN1', scooter_name: 'Blue' }, { sn_id: 'SN2', scooter_name: 'Red' }] } });
const refusal = (status, desc) => json({ data: [], status, desc });
const refusesSn1 = (answer) => (request) => {
  if (request.url === SCOOTERS_URL) return twoScooters.clone();
  if (request.url === 'track.php' && request.body.get('sn') === 'SN1') return answer.clone();
};

test('skips a scooter whose trips need its owner\'s permission, and reads the others', async () => {
  const niu = fakeNiu({
    pages: { SN2: [[track('a', 20240105, 10000, 20)]] },
    answer: refusesSn1(refusal(1549, 'Owner Permission Required')),
  });
  const { data, log, waits } = await download(niu);

  assert.deepEqual(data, {
    vehicles: {
      SN1: { sn_id: 'SN1', scooter_name: 'Blue', tripsRefused: true },
      SN2: { sn_id: 'SN2', scooter_name: 'Red' },
    },
    trips: { SN1: [], SN2: [{ d: 20240105, m: 10000, b: 20 }] },
  });
  assert.match(log, /Getting trips for SN1, page 1\.\.\. Owner Permission Required, skipping this scooter\nGetting trips for SN2, page 1\.\.\. ok\n/);
  assert.deepEqual(waits, []);
  assert.equal(niu.requests.filter(({ url, body }) => url === 'track.php' && body.get('sn') === 'SN1').length, 1);
});

test('still ends the download on any other refusal for a scooter', async () => {
  const niu = fakeNiu({ answer: refusesSn1(refusal(1131, 'Incorrect Login Details')) });

  await assert.rejects(download(niu), new NiuError('Incorrect Login Details'));
  assert.ok(niu.requests.every(({ url, body }) => url !== 'track.php' || body.get('sn') === 'SN1'));
});

test('reports the same refusal when signing in, where there is no scooter to skip', async () => {
  const niu = fakeNiu({ answer: ({ url }) => url === TOKEN_URL && refusal(1549, 'Owner Permission Required') });

  await assert.rejects(download(niu), (error) => error instanceof NiuError && error.message === 'Owner Permission Required');
});

test('keeps the first copy of each trip id, and every trip without one', () => {
  const withoutId = { date: 20240107, distance: 1, power_consumption: 1 };
  assert.deepEqual(
    uniqueTrips([track('a', 1, 1, 1), track('b', 2, 2, 2), track('a', 1, 1, 1), withoutId, withoutId]),
    [track('a', 1, 1, 1), track('b', 2, 2, 2), withoutId, withoutId],
  );
});

test('tries again after a server error, waiting 1 s and then 2 s', async () => {
  let failures = 2;
  const niu = fakeNiu({
    pages: { SN1: [[track('a', 20240105, 10000, 20)]] },
    answer: (request) =>
      isTripPage(request, 1) && failures-- > 0 && json({ data: [], status: -1, desc: 'Niu answered with HTTP 500' }, 502),
  });
  const { data, log, waits } = await download(niu);

  assert.deepEqual(data.trips, { SN1: [{ d: 20240105, m: 10000, b: 20 }] });
  assert.deepEqual(waits, [1000, 2000]);
  assert.match(
    log,
    /Getting trips for SN1, page 1\.\.\. Niu answered with HTTP 500, retrying in 1 s\.\.\. Niu answered with HTTP 500, retrying in 2 s\.\.\. ok\n/,
  );
});

test('tries again after a failed connection', async () => {
  let failures = 1;
  const niu = fakeNiu({
    answer: ({ url }) => {
      if (url === TOKEN_URL && failures-- > 0) throw new TypeError('Failed to fetch');
    },
  });
  const { log, waits } = await download(niu);

  assert.deepEqual(waits, [1000]);
  assert.match(log, /^Signing in\.\.\. could not connect \(Failed to fetch\), retrying in 1 s\.\.\. ok\n/);
});

test('gives up after three retries', async () => {
  const niu = fakeNiu({ answer: ({ url }) => url === SCOOTERS_URL && new Response('<html>Unavailable</html>', { status: 503 }) });
  const seen = { log: '', waits: [] };

  await assert.rejects(download(niu, { seen }), new NiuError('unexpected response from Niu (HTTP 503)'));
  assert.deepEqual(seen.waits, [1000, 2000, 4000]);
  assert.equal(niu.requests.filter(({ url }) => url === SCOOTERS_URL).length, 4);
});

test('reports a failed connection once the retries are used up', async () => {
  const niu = fakeNiu({
    answer: ({ url }) => {
      if (url === TOKEN_URL) throw new TypeError('Failed to fetch');
    },
  });
  await assert.rejects(download(niu), new NiuError('could not connect (Failed to fetch)'));
});

test('reports a message from Niu at once, without retrying', async () => {
  const niu = fakeNiu({ answer: ({ url }) => url === TOKEN_URL && json({ status: 1, desc: 'Wrong password' }) });
  const seen = { log: '', waits: [] };

  await assert.rejects(download(niu, { seen }), new NiuError('Wrong password'));
  assert.deepEqual(seen.waits, []);
  assert.equal(niu.requests.length, 1);
});

test('reports a response that is not a Niu answer', async () => {
  const niu = fakeNiu({ answer: ({ url }) => url === TOKEN_URL && new Response('<html>Sign in</html>') });
  await assert.rejects(download(niu), new NiuError('unexpected response from Niu (HTTP 200)'));
});
