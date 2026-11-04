// Client for the Niu cloud API, reverse engineered from the Niu mobile app. The browser calls the
// account and scooter endpoints directly. The trip list expects the app's User-Agent, which a web page
// cannot set, so it goes through track.php on this site.

const TOKEN_URL = 'https://account-fk.niu.com/v3/api/oauth2/token';
const SCOOTERS_URL = 'https://app-api-fk.niu.com/v5/scooter/list';
const TRIPS_URL = 'track.php';

/**
 * The download asks for an empty page of trips this many times before taking it as the end of the list,
 * in case Niu returns an empty page too early.
 */
const EMPTY_PAGE_ATTEMPTS = 4;

/** A problem to show the user: the message from Niu, or what went wrong on the way. */
export class NiuError extends Error {}

/**
 * Signs in to Niu and downloads all scooters of the account with all their trips.
 * @param {string} login phone number or email
 * @param {string} passwordHash MD5 hash of the password, as the Niu app sends it
 * @param {{ log: (message: string) => void, fetch?: typeof fetch }} options `log` gets the progress, as text
 * @returns {Promise<{ vehicles: object, trips: object }>} scooters and trips by serial number,
 *   in the format stored in localStorage
 */
export async function downloadData(login, passwordHash, { log, fetch = globalThis.fetch }) {
  log('Requesting token... ');
  const token = await signIn(fetch, login, passwordHash);
  log('ok\n');

  log('Requesting vehicles... ');
  const { items } = await request(fetch, SCOOTERS_URL, { headers: { 'content-type': 'application/json', token } });
  const vehicles = Object.fromEntries(items.map((item) => [item.sn_id, item]));
  log(`${Object.keys(vehicles).join()}\n`);

  const trips = {};
  for (const sn of Object.keys(vehicles)) trips[sn] = await downloadTrips(fetch, token, sn, log);
  return { vehicles, trips };
}

async function signIn(fetch, login, passwordHash) {
  const data = await request(fetch, TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account: login,
      app_id: 'niu_fksss2ws',
      grant_type: 'password',
      password: passwordHash,
      scope: 'base',
    }),
  });
  return data.token.access_token;
}

/** All trips of a scooter, read 100 per page, as { d: date, m: distance, b: battery used } sorted by date. */
async function downloadTrips(fetch, token, sn, log) {
  const items = [];
  let page = 1;
  let emptyAnswers = 0;
  for (;;) {
    log(`Requesting ${sn} page ${page}... `);
    const data = await request(fetch, TRIPS_URL, {
      method: 'POST',
      body: new URLSearchParams({ page: String(page), token, sn }),
    });
    if (data.items.length > 0) {
      log('ok\n');
      items.push(...data.items);
      page++;
      emptyAnswers = 0;
    } else if (++emptyAnswers < EMPTY_PAGE_ATTEMPTS) {
      log('empty, retry\n');
    } else {
      log('empty, ok\n');
      return uniqueTrips(items)
        .map((item) => ({ d: item.date, m: item.distance, b: item.power_consumption }))
        .sort((a, b) => a.d - b.d);
    }
  }
}

/**
 * Niu can list the same trip on two pages. Keeps the first copy of each trip id; trips without
 * an id cannot be compared, so all of them are kept.
 */
export function uniqueTrips(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (item.trackId == null) return true;
    if (seen.has(item.trackId)) return false;
    seen.add(item.trackId);
    return true;
  });
}

/**
 * Sends a request and returns the `data` of a successful Niu answer ({ status: 0, data }).
 * Anything else becomes a NiuError: Niu's own message (`desc`) when there is one.
 */
async function request(fetch, url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new NiuError(`could not connect (${error.message})`);
  }
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = undefined;
  }
  if (response.ok && body?.status === 0) return body.data;
  if (typeof body?.desc === 'string' && body.status !== 0) throw new NiuError(body.desc);
  throw new NiuError(`unexpected response from Niu (HTTP ${response.status})`);
}
