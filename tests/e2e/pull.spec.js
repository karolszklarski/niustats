import { createHash } from 'node:crypto';
import { test, expect, storeItems } from './fixtures.js';

const TOKEN = 'test-token';

const scooters = [
  { sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' },
  { sn_id: 'SN2', scooter_name: 'Red', sku_name: 'MQi+' },
];

/** A trip as the Niu trip list returns it, with only the fields the site reads. */
const track = (trackId, date, distance, battery) => ({ trackId, date, distance, power_consumption: battery });

/**
 * Stubs the Niu API. The browser calls the account and scooter endpoints directly and gets the trip list
 * through track.php. `login` is the answer to signing in, as JSON, or `loginResponse` the whole response.
 * `trips` holds the pages of each scooter; a page past the last one is empty.
 * `failures` maps "<sn> <page>" to handlers that answer the first requests for that page instead.
 * Returns the requests the page made.
 */
async function stubNiu(
  page,
  {
    login = { status: 0, data: { token: { access_token: TOKEN } } },
    loginResponse = { json: login },
    trips = {},
    failures = {},
  } = {},
) {
  const requests = { login: [], scooters: [], tracks: [] };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET, POST',
  };
  const crossOrigin = (handle) => (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ ...handle(route.request()), headers: cors });

  await page.route(
    'https://account-fk.niu.com/v3/api/oauth2/token',
    crossOrigin((request) => {
      requests.login.push(request.postDataJSON());
      return loginResponse;
    }),
  );
  await page.route(
    'https://app-api-fk.niu.com/v5/scooter/list',
    crossOrigin((request) => {
      requests.scooters.push({ token: request.headers().token });
      return { json: { status: 0, data: { items: scooters } } };
    }),
  );
  await page.route('**/track.php', (route) => {
    const form = new URLSearchParams(route.request().postData());
    const request = { sn: form.get('sn'), page: Number(form.get('page')), token: form.get('token') };
    requests.tracks.push(request);
    const failure = failures[`${request.sn} ${request.page}`]?.shift();
    if (failure) return failure(route);
    return route.fulfill({ json: { status: 0, data: { items: trips[request.sn]?.[request.page - 1] ?? [] } } });
  });
  return requests;
}

const storedTrips = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('trips')));

async function signIn(page, login, password) {
  await page.goto('/pull.html');
  await page.getByLabel('Phone or email').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Gather data from Niu server' }).click();
}

test('downloads scooters and trips into the browser', async ({ page }) => {
  const requests = await stubNiu(page, {
    trips: {
      SN1: [[track('a', 20240120, 5000, 10), track('b', 20240105, 10000, 20)], [track('c', 20240203, 8000, 20)]],
      SN2: [[track('d', 20240301, 20000, 25)]],
    },
  });

  await signIn(page, 'rider@example.com', 'secret');
  await page.waitForURL((url) => url.pathname === '/');

  expect(requests.login).toEqual([
    {
      account: 'rider@example.com',
      app_id: 'niu_fksss2ws',
      grant_type: 'password',
      password: createHash('md5').update('secret').digest('hex'),
      scope: 'base',
    },
  ]);
  expect(requests.scooters).toEqual([{ token: TOKEN }]);
  // Pages are read until one comes back empty four times in a row, then the next scooter starts.
  expect(requests.tracks.map(({ sn, page }) => `${sn} ${page}`)).toEqual([
    'SN1 1', 'SN1 2', 'SN1 3', 'SN1 3', 'SN1 3', 'SN1 3',
    'SN2 1', 'SN2 2', 'SN2 2', 'SN2 2', 'SN2 2',
  ]);
  expect(requests.tracks.every(({ token }) => token === TOKEN)).toBe(true);

  // Trips are stored sorted by date, without their ids; the password and token are not stored.
  const stored = await page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, JSON.parse(localStorage.getItem(key))])),
  );
  expect(stored).toEqual({
    trips: {
      SN1: [
        { d: 20240105, m: 10000, b: 20 },
        { d: 20240120, m: 5000, b: 10 },
        { d: 20240203, m: 8000, b: 20 },
      ],
      SN2: [{ d: 20240301, m: 20000, b: 25 }],
    },
    vehicles: { SN1: scooters[0], SN2: scooters[1] },
  });
  await expect(page.locator('.card-header', { hasText: 'Blue - NQi GTS - SN1' })).toHaveCount(4);
  await expect(page.locator('.card-header', { hasText: 'Red - MQi+ - SN2' })).toHaveCount(4);
});

test('keeps one copy of a trip that Niu lists on two pages', async ({ page }) => {
  await stubNiu(page, {
    trips: {
      SN1: [
        [track('a', 20240105, 10000, 20), track('b', 20240110, 5000, 10)],
        [track('b', 20240110, 5000, 10), track('c', 20240203, 8000, 20)],
      ],
    },
  });

  await signIn(page, 'rider@example.com', 'secret');
  await page.waitForURL((url) => url.pathname === '/');

  expect(await storedTrips(page)).toEqual({
    SN1: [
      { d: 20240105, m: 10000, b: 20 },
      { d: 20240110, m: 5000, b: 10 },
      { d: 20240203, m: 8000, b: 20 },
    ],
    SN2: [],
  });
});

test('keeps every trip that has no id', async ({ page }) => {
  const withoutId = (date, distance, battery) => ({ date, distance, power_consumption: battery });
  await stubNiu(page, { trips: { SN1: [[withoutId(20240105, 10000, 20), withoutId(20240110, 5000, 10)]] } });

  await signIn(page, 'rider@example.com', 'secret');
  await page.waitForURL((url) => url.pathname === '/');

  expect((await storedTrips(page)).SN1).toEqual([
    { d: 20240105, m: 10000, b: 20 },
    { d: 20240110, m: 5000, b: 10 },
  ]);
});

test('keeps the data stored earlier when the download fails', async ({ page }) => {
  const earlier = {
    vehicles: { OLD: { sn_id: 'OLD', scooter_name: 'Old', sku_name: 'N1S' } },
    trips: { OLD: [{ d: 20230105, m: 10000, b: 20 }] },
  };
  await storeItems(page, earlier);
  await stubNiu(page, {
    trips: { SN1: [[track('a', 20240105, 10000, 20)]] },
    failures: { 'SN2 1': [(route) => route.fulfill({ json: { status: 1, desc: 'Token expired' } })] },
  });

  await signIn(page, 'rider@example.com', 'secret');

  await expect(page.locator('#logs')).toHaveValue(/Requesting SN2 page 1\.\.\. error: Token expired\n$/);
  expect(
    await page.evaluate(() => ({
      vehicles: JSON.parse(localStorage.getItem('vehicles')),
      trips: JSON.parse(localStorage.getItem('trips')),
    })),
  ).toEqual(earlier);
});

test('sends the login as JSON, without surrounding spaces', async ({ page }) => {
  const requests = await stubNiu(page);

  await signIn(page, ' rider"x\\y@example.com ', 'secret');
  await page.waitForURL((url) => url.pathname === '/');

  expect(requests.login.map(({ account }) => account)).toEqual(['rider"x\\y@example.com']);
});

test('keeps browsers from correcting or capitalising the login', async ({ page }) => {
  await page.goto('/pull.html');

  const login = page.getByLabel('Phone or email');
  await expect(login).toHaveAttribute('autocomplete', 'username');
  await expect(login).toHaveAttribute('autocapitalize', 'none');
  await expect(login).toHaveAttribute('autocorrect', 'off');
  await expect(login).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'current-password');
});

test('shows the error from Niu when signing in fails', async ({ page }) => {
  const requests = await stubNiu(page, { login: { status: 1, desc: 'Wrong password' } });

  await signIn(page, 'rider@example.com', 'wrong');

  await expect(page.locator('#logs')).toHaveValue('Requesting token... error: Wrong password\n');
  expect(page.url()).toMatch(/\/pull\.html$/);
  expect(requests.scooters).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('shows the message from Niu as text, not as HTML', async ({ page }) => {
  await stubNiu(page, { login: { status: 1, desc: '<b>Locked</b> & try later' } });

  await signIn(page, 'rider@example.com', 'secret');

  await expect(page.locator('#logs')).toHaveValue('Requesting token... error: <b>Locked</b> & try later\n');
});

test('says when a response from Niu cannot be read', async ({ page }) => {
  await stubNiu(page, { loginResponse: { contentType: 'text/html', body: '<html>Service unavailable</html>' } });

  await signIn(page, 'rider@example.com', 'secret');

  await expect(page.locator('#logs')).toHaveValue('Requesting token... error: unexpected response from Niu (HTTP 200)\n');
});
