import { test, expect, readCharts, reloadedBy, storeItems } from './fixtures.js';

const EXAMPLE_SN = 'NAYL2AX2681A4DSQ';
const KM_TO_MI = 0.621371192;

const vehicles = {
  SN1: { sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' },
  SN2: { sn_id: 'SN2', scooter_name: 'Red', sku_name: 'MQi+' },
};

/** n trips of the same distance (m, in metres) and battery use (b, in percentage points) in January 2024. */
const januaryTrips = (n, m, b) => Array.from({ length: n }, (_, i) => ({ d: 20240101 + (i % 28), m, b }));

/** One row per month: distance, battery per distance unit and the three range bands. */
function statsTable(charts) {
  const [to30, to20, to10] = charts.range.datasets.map(({ data }) => data);
  const distance = charts.rangeDistance.datasets[3].data;
  const battery = charts.battery.datasets[0].data;
  const cell = (value) => value.toFixed(6).padStart(12);
  const rows = charts.range.labels.map(
    (month, i) => month + [distance[i], battery[i], to30[i], to20[i], to10[i]].map(cell).join(''),
  );
  const header = 'month   ' + ['distance', 'battery', '100%-30%', '30%-20%', '20%-10%'].map((h) => h.padStart(12)).join('');
  return [header, ...rows].join('\n') + '\n';
}

test('shows the example scooter when nothing is stored', async ({ page }) => {
  await page.goto('/');

  const headers = page.locator('.chart-scooter', { hasText: EXAMPLE_SN });
  await expect(headers).toHaveText(Array(4).fill(`Example - N-series Civic White (Gloss) - ${EXAMPLE_SN}`));
  await expect(page.locator('.intro h2')).toHaveText('See how far your Niu scooter goes on a charge');
  await expect(page.locator('.chart-title')).toHaveText([
    'Range in km',
    'Range in km and distance ridden',
    'Battery used per km (%)',
    'Battery used per km (%) and distance ridden',
  ]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the page title, description and links', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Niu Stats – battery range stats for Niu electric scooters');
    await expect(page.locator('h1')).toHaveText('Niu Stats – battery range stats for Niu electric scooters');
    await expect(page.getByText('Sign in with your Niu app account')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Load your data', exact: true })).toHaveAttribute('href', 'pull.html');
    await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy.html');
  });
});

test('charts the example data month by month', async ({ page }) => {
  await page.goto('/');
  const charts = await readCharts(page, EXAMPLE_SN);

  const labels = (chart) => chart.datasets.map(({ label }) => label);
  expect(labels(charts.range)).toEqual(['Range from 100% to 30%', 'Range from 30% to 20%', 'Range from 20% to 10%']);
  expect(labels(charts.rangeDistance)).toEqual([...labels(charts.range), 'Distance ridden (km)']);
  expect(labels(charts.battery)).toEqual(['Battery used per km (%)']);
  expect(labels(charts.batteryDistance)).toEqual(['Battery used per km (%)', 'Distance ridden (km)']);

  // The combined charts repeat the series of the simple ones.
  const data = (chart) => chart.datasets.map((dataset) => dataset.data);
  expect(data(charts.rangeDistance).slice(0, 3)).toEqual(data(charts.range));
  expect(data(charts.batteryDistance)).toEqual([data(charts.battery)[0], data(charts.rangeDistance)[3]]);

  for (const chart of Object.values(charts)) expect(chart.labels).toEqual(charts.range.labels);
  expect(charts.range.labels).toHaveLength(55);
  expect(charts.range.labels.at(0)).toBe('Jun 2019');
  expect(charts.range.labels.at(-1)).toBe('Dec 2023');

  expect(statsTable(charts)).toMatchSnapshot('example-km.txt');
});

test('switches between kilometres and miles', async ({ page }) => {
  await page.goto('/');
  const km = await readCharts(page, EXAMPLE_SN);

  await reloadedBy(page, () => page.getByRole('button', { name: 'Change units' }).click());
  await expect(page.locator('.chart-title').first()).toHaveText('Range in mi');
  expect(await page.evaluate(() => localStorage.getItem('units'))).toBe('mi');

  const mi = await readCharts(page, EXAMPLE_SN);
  const expectScaled = (actual, expected, factor) =>
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i] * factor, 9));
  km.range.datasets.forEach((dataset, i) => expectScaled(mi.range.datasets[i].data, dataset.data, KM_TO_MI));
  expectScaled(mi.rangeDistance.datasets[3].data, km.rangeDistance.datasets[3].data, KM_TO_MI);
  expectScaled(mi.battery.datasets[0].data, km.battery.datasets[0].data, 1 / KM_TO_MI);

  await reloadedBy(page, () => page.getByRole('button', { name: 'Change units' }).click());
  await expect(page.locator('.chart-title').first()).toHaveText('Range in km');
  expect(await page.evaluate(() => localStorage.getItem('units'))).toBeNull();
});

test('charts stored scooters instead of the example', async ({ page }) => {
  await storeItems(page, {
    vehicles,
    trips: {
      SN1: [
        { d: 20240105, m: 10000, b: 20 },
        { d: 20240110, m: 3000, b: 0 }, // no battery reading: left out
        { d: 20240120, m: 5000, b: 10 },
        { d: 20240203, m: 8000, b: 20 },
      ],
      SN2: [{ d: 20240301, m: 20000, b: 25 }],
    },
  });
  await page.goto('/');

  await expect(page.locator('.chart-scooter', { hasText: EXAMPLE_SN })).toHaveCount(0);
  await expect(page.locator('.chart-scooter', { hasText: 'Blue - NQi GTS - SN1' })).toHaveCount(4);
  await expect(page.locator('.chart-scooter', { hasText: 'Red - MQi+ - SN2' })).toHaveCount(4);

  // January: 30 points over 15 km is 2 points per km, so 70 points take 35 km and each next 10 points 5 km.
  const sn1 = await readCharts(page, 'SN1');
  expect(sn1.range.labels).toEqual(['Jan 2024', 'Feb 2024']);
  expect(sn1.rangeDistance.datasets[3].data).toEqual([15, 8]);
  expect(sn1.battery.datasets[0].data).toEqual([2, 2.5]);
  expect(sn1.range.datasets.map(({ data }) => data)).toEqual([[35, 28], [5, 4], [5, 4]]);

  const sn2 = await readCharts(page, 'SN2');
  expect(sn2.range.labels).toEqual(['Mar 2024']);
  expect(sn2.battery.datasets[0].data).toEqual([1.25]);
  expect(sn2.range.datasets.map(({ data }) => data)).toEqual([[56], [8], [8]]);
});

test('loads Chart.js from this site, not from a CDN', async ({ page, baseURL }) => {
  const scripts = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');

  expect(scripts.filter((url) => /chart/i.test(url))).toEqual([`${baseURL}/vendor/chart.umd.min.js`]);
  expect(await readCharts(page, EXAMPLE_SN)).toBeTruthy();
});

test('shows scooter names as text, not as HTML', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: { sn_id: 'SN1', scooter_name: '<img src=x onerror="window.injected=1">', sku_name: 'R&D' } },
    trips: { SN1: [{ d: 20240105, m: 10000, b: 20 }] },
  });
  await page.goto('/');

  await expect(page.locator('.chart-scooter', { hasText: 'SN1' })).toHaveText(
    Array(4).fill('<img src=x onerror="window.injected=1"> - R&D - SN1'),
  );
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('mentions the example scooter only while the charts show it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#example-note')).toBeVisible();

  await storeItems(page, { vehicles: { SN1: vehicles.SN1 }, trips: { SN1: [{ d: 20240105, m: 10000, b: 20 }] } });
  await page.goto('/');
  await expect(page.locator('.chart-scooter', { hasText: 'SN1' })).toHaveCount(4);
  await expect(page.locator('#example-note')).toBeHidden();
});

test('shows the example when only scooters are stored', async ({ page }) => {
  await storeItems(page, { vehicles });
  await page.goto('/');

  await expect(page.locator('.chart-scooter', { hasText: EXAMPLE_SN })).toHaveCount(4);
});

test('shows the example when only trips are stored', async ({ page }) => {
  await storeItems(page, { trips: { SN1: [{ d: 20240105, m: 10000, b: 20 }] } });
  await page.goto('/');

  await expect(page.locator('.chart-scooter', { hasText: EXAMPLE_SN })).toHaveCount(4);
});

test('names a scooter by its serial number when its details are missing', async ({ page }) => {
  await storeItems(page, { vehicles: { SN1: vehicles.SN1 }, trips: { SN2: [{ d: 20240105, m: 10000, b: 20 }] } });
  await page.goto('/');

  await expect(page.locator('.chart-scooter', { hasText: 'SN2' })).toHaveText(Array(4).fill('SN2'));
});

test('leaves out the 2% of trips with the highest battery use per km', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(49, 10000, 20), { d: 20240131, m: 1000, b: 50 }] },
  });
  await page.goto('/');

  const charts = await readCharts(page, 'SN1');
  expect(charts.rangeDistance.datasets[3].data).toEqual([490]);
  expect(charts.battery.datasets[0].data).toEqual([2]);
});

test('keeps trips of up to 5% per km when there are fewer than 50', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(48, 10000, 20), { d: 20240131, m: 1000, b: 5 }] },
  });
  await page.goto('/');

  const charts = await readCharts(page, 'SN1');
  expect(charts.rangeDistance.datasets[3].data).toEqual([481]);
  expect(charts.battery.datasets[0].data[0]).toBeCloseTo(965 / 481, 12);
});

test('leaves out trips above 5% per km when there are fewer than 50', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(48, 10000, 20), { d: 20240131, m: 1000, b: 50 }] },
  });
  await page.goto('/');

  const charts = await readCharts(page, 'SN1');
  expect(charts.rangeDistance.datasets[3].data).toEqual([480]);
  expect(charts.battery.datasets[0].data).toEqual([2]);
});

test('removing the data brings back the example', async ({ page }) => {
  await storeItems(page, { vehicles: { SN1: vehicles.SN1 }, trips: { SN1: [{ d: 20240105, m: 10000, b: 20 }] } });
  await page.goto('/');
  await expect(page.locator('.chart-scooter', { hasText: 'SN1' })).toHaveCount(4);

  await reloadedBy(page, () => page.getByRole('button', { name: 'Delete your data' }).click());

  await expect(page.locator('.chart-scooter', { hasText: EXAMPLE_SN })).toHaveCount(4);
  expect(await page.evaluate(() => [localStorage.getItem('vehicles'), localStorage.getItem('trips')])).toEqual([null, null]);
});
