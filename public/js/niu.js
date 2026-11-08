
const TOKEN_URL = 'https://account-fk.niu.com/v3/api/oauth2/token';
const SCOOTERS_URL = 'https://app-api-fk.niu.com/v5/scooter/list';
const TRIPS_URL = 'track.php';

const TRIPS_PER_PAGE = 100;

const RETRY_DELAYS = [1000, 2000, 4000];

const EMPTY_PAGE_ATTEMPTS = RETRY_DELAYS.length + 1;

const OWNER_PERMISSION_REQUIRED = 1549;

export class NiuError extends Error {}

class TripsRefused extends NiuError {}

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

const hasEnded = (item) => item.type !== 'riding';

export function uniqueTrips(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (item.trackId == null) return true;
    if (seen.has(item.trackId)) return false;
    seen.add(item.trackId);
    return true;
  });
}

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
  const worthRetrying = response.status >= 500 || response.status === 429;
  if (typeof body?.desc === 'string' && body.status !== 0) {
    const Problem = body.status === OWNER_PERMISSION_REQUIRED ? TripsRefused : NiuError;
    return { error: new Problem(body.desc), worthRetrying };
  }
  return { error: new NiuError(`unexpected response from Niu (HTTP ${response.status})`), worthRetrying };
}
