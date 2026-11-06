// Client for the Niu cloud API, reverse engineered from the Niu mobile app. The browser calls the
// account and scooter endpoints directly. The trip list expects the app's User-Agent, which a web page
// cannot set, so it goes through track.php on this site.

const TOKEN_URL = 'https://account-fk.niu.com/v3/api/oauth2/token';
const SCOOTERS_URL = 'https://app-api-fk.niu.com/v5/scooter/list';
const TRIPS_URL = 'track.php';

/** The page size track.php asks Niu for. */
const TRIPS_PER_PAGE = 100;

/**
 * Pauses before trying again a request that failed on the way, so that one dropped connection among
 * hundreds of page requests does not end the download.
 */
const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * The download asks for an empty page of trips this many times before taking it as the end of the list,
 * in case Niu returns an empty page too early.
 */
const EMPTY_PAGE_ATTEMPTS = RETRY_DELAYS.length + 1;

/** Niu's answer when an account lists a scooter, but needs its owner's permission to read its trips. */
const OWNER_PERMISSION_REQUIRED = 1549;

/** A problem to show the user: the message from Niu, or what went wrong on the way. */
export class NiuError extends Error {}

/** Niu won't share the trips of this scooter, which says nothing about the other scooters of the account. */
class TripsRefused extends NiuError {}

/**
 * Signs in to Niu and downloads all scooters of the account with all their trips.
 * @param {string} login phone number or email
 * @param {string} passwordHash MD5 hash of the password, as the Niu app sends it
 * @param {{ log: (message: string) => void, fetch?: typeof fetch, wait?: (ms: number) => Promise<void> }} options
 *   `log` gets the progress, as text
 * @returns {Promise<{ vehicles: object, trips: object }>} scooters and trips by serial number,
 *   in the format stored in localStorage. A scooter whose trips Niu won't share has no trips, and
 *   `tripsRefused` set.
 */
export async function downloadData(
  login,
  passwordHash,
  { log, fetch = globalThis.fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
) {
  const context = { log, fetch, wait };

  log('Signing in... ');
  const token = await signIn(context, login, passwordHash);
  log('ok\n');

  log('Getting your scooters... ');
  const { items } = await request(context, SCOOTERS_URL, { headers: { 'content-type': 'application/json', token } });
  const vehicles = Object.fromEntries(items.map((item) => [item.sn_id, item]));
  log(`${Object.keys(vehicles).join()}\n`);

  const trips = {};
  for (const [sn, vehicle] of Object.entries(vehicles)) {
    try {
      trips[sn] = await downloadTrips(context, token, sn);
    } catch (error) {
      if (!(error instanceof TripsRefused)) throw error;
      log(`${error.message}, skipping this scooter\n`);
      trips[sn] = [];
      vehicle.tripsRefused = true;
    }
  }
  return { vehicles, trips };
}

async function signIn(context, login, passwordHash) {
  const data = await request(context, TOKEN_URL, {
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
async function downloadTrips(context, token, sn) {
  const items = [];
  let page = 1;
  let emptyAnswers = 0;
  let listShouldGoOn = false;
  for (;;) {
    context.log(`Getting trips for ${sn}, page ${page}... `);
    const data = await request(context, TRIPS_URL, {
      method: 'POST',
      body: new URLSearchParams({ page: String(page), token, sn }),
    });
    if (data.items.length > 0) {
      context.log('ok\n');
      items.push(...data.items);
      page++;
      emptyAnswers = 0;
      listShouldGoOn = data.items.length >= TRIPS_PER_PAGE;
    } else if (++emptyAnswers < EMPTY_PAGE_ATTEMPTS) {
      // Every list ends with an empty page, usually after a shorter one: pausing there would only slow down every
      // download. After a full page the list should go on, so Niu may just need a moment.
      if (listShouldGoOn) {
        const delay = RETRY_DELAYS[emptyAnswers - 1];
        context.log(`empty, trying again in ${delay / 1000} s\n`);
        await context.wait(delay);
      } else {
        context.log('empty, trying again\n');
      }
    } else {
      context.log('no more trips\n');
      return uniqueTrips(items.filter(hasEnded))
        .map((item) => ({ d: item.date, m: item.distance, b: item.power_consumption }))
        .sort((a, b) => a.d - b.d);
    }
  }
}

/** Niu lists a trip that is still going on as 'riding'. Its battery use isn't final, which would inflate the range. */
const hasEnded = (item) => item.type !== 'riding';

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
 * Sends a request and returns the `data` of a successful Niu answer ({ status: 0, data }). A request that
 * fails on the way is tried again after each of the RETRY_DELAYS, and the log says why. Anything else,
 * or the last failure, becomes a NiuError: Niu's own message (`desc`) when there is one.
 */
async function request(context, url, init) {
  for (let attempt = 0; ; attempt++) {
    const answer = await send(context.fetch, url, init);
    if (!answer.error) return answer.data;
    const delay = RETRY_DELAYS[attempt];
    if (!answer.worthRetrying || delay === undefined) throw answer.error;
    context.log(`${answer.error.message}, retrying in ${delay / 1000} s... `);
    await context.wait(delay);
  }
}

async function send(fetch, url, init) {
  let response;
  let text;
  try {
    response = await fetch(url, init);
    text = await response.text();
  } catch (error) {
    return { error: new NiuError(`could not connect (${error.message})`), worthRetrying: true };
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (response.ok && body?.status === 0) return { data: body.data };
  // A server error or a rate limit can pass. An answer from Niu itself, such as a wrong password, will not.
  const worthRetrying = response.status >= 500 || response.status === 429;
  if (typeof body?.desc === 'string' && body.status !== 0) {
    const Problem = body.status === OWNER_PERMISSION_REQUIRED ? TripsRefused : NiuError;
    return { error: new Problem(body.desc), worthRetrying };
  }
  return { error: new NiuError(`unexpected response from Niu (HTTP ${response.status})`), worthRetrying };
}
