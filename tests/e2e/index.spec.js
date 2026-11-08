import {
  distanceSwitch,
  expect,
  monthOfTrips,
  readCharts,
  readScooters,
  reloadedBy,
  storeItems,
  test,
  trip,
} from './fixtures.js';

const EXAMPLE_SN = 'NAYL2AX2681A4DSQ';
const KM_TO_MI = 0.621371192;

const vehicles = {
  SN1: { sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' },
  SN2: { sn_id: 'SN2', scooter_name: 'Red', sku_name: 'MQi+' },
};

const januaryTrips = (n, m, b) => monthOfTrips(202401, n, m, b);

function statsTable({ range, rangeDistance, battery }) {
  const [to30, to20, to10] = range.datasets.map(({ data }) => data);
  const distance = rangeDistance.datasets[0].data;
  const percent = battery.datasets[0].data;
  const cell = (value) => value.toFixed(6).padStart(12);
  const rows = range.labels.map(
    (month, i) => month + [distance[i], percent[i], to30[i], to20[i], to10[i]].map(cell).join(''),
  );
  const header = 'month   ' + ['distance', 'battery', '100%-30%', '30%-20%', '20%-10%'].map((h) => h.padStart(12)).join('');
  return [header, ...rows].join('\n') + '\n';
}

test('shows the example scooter when nothing is stored', async ({ page }) => {
  await page.goto('/');

  const [example, ...others] = await readScooters(page);
  expect(others).toEqual([]);
  expect(example.name).toBe('Example');
  expect(example.details).toBe(`N-series Civic White (Gloss) · ${EXAMPLE_SN}`);
  expect(example.chartTitles).toEqual(['Range in km', 'Battery used per km (%)']);
  await expect(page.locator('.intro h2')).toHaveText('See how far your Niu scooter goes on a charge');
});

test('sums up the example scooter', async ({ page }) => {
  await page.goto('/');

  const [example] = await readScooters(page);
  expect(example.level).toBe('full');
  expect(example.label).toBe('Range on a charge, latest 12 months');
  expect(example.range).toBe('42 km');
  expect(example.note).toBe('From 100% to 10% battery, Jan 2023 – Dec 2023');
  expect(example.gauge).toEqual(['30% at 33 km', '20% at 38 km', '10% at 42 km']);
  expect(example.gaugeBars).toBe(1);
  expect(example.records).toEqual(['56 km', '37 km']);
  expect(example.recordMonths).toEqual(['Jun 2019', 'Dec 2022']);
  expect(example.notes).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('shows the page title, description and links', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Niu Stats – battery range stats for Niu electric scooters');
    await expect(page.locator('h1')).toHaveText('Niu Stats – battery range stats for Niu electric scooters');
    await expect(page.getByText('Sign in with your Niu app account')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Load your data', exact: true })).toHaveAttribute('href', 'pull.html');
    await expect(page.getByRole('link', { name: 'View trips as CSV' })).toHaveAttribute('href', 'data.html');
    await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy.html');
    await expect(page.getByRole('button', { name: 'Delete your data' })).toBeHidden();
  });
});

test('charts the example data month by month', async ({ page }) => {
  await page.goto('/');
  await distanceSwitch(page, 'range').check();
  const charts = await readCharts(page);

  const labels = (chart) => chart.datasets.map(({ label }) => label);
  expect(labels(charts.range)).toEqual(['Range from 100% to 30%', 'Range from 30% to 20%', 'Range from 20% to 10%']);
  expect(labels(charts.battery)).toEqual(['Battery used per km (%)']);
  expect(labels(charts.rangeDistance)).toEqual(['Distance ridden (km)']);

  for (const chart of [charts.battery, charts.rangeDistance]) expect(chart.labels).toEqual(charts.range.labels);
  expect(charts.range.labels).toHaveLength(55);
  expect(charts.range.labels.at(0)).toBe('Jun 2019');
  expect(charts.range.labels.at(-1)).toBe('Dec 2023');

  expect(statsTable(charts)).toMatchSnapshot('example-km.txt');
});

test('lists the months in a table, the latest first', async ({ page }) => {
  await page.goto('/');
  const [example] = await readScooters(page);

  expect(example.headers).toEqual(['Month', 'Range from 100% to 10% (km)', 'Battery used per km (%)', 'Distance ridden (km)']);
  expect(example.rows).toHaveLength(55);
  expect(example.rows[0][0]).toBe('Dec 2023');
  expect(example.rows.at(-1)[0]).toBe('Jun 2019');
  await expect(page.locator('.twin tbody')).toBeHidden();

  await page.getByText('Monthly numbers').click();
  await expect(page.locator('.twin tbody')).toBeVisible();
});

test('switches between kilometres and miles without a reload, and remembers it', async ({ page }) => {
  await page.goto('/');
  const km = await readCharts(page);
  await page.evaluate(() => {
    window.notReloaded = true;
  });

  await page.getByRole('button', { name: 'mi', exact: true }).click();
  await expect(page.getByRole('button', { name: 'mi', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'km', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.chart-title').first()).toHaveText('Range in mi');
  expect(await page.evaluate(() => localStorage.getItem('units'))).toBe('mi');
  expect(await page.evaluate(() => window.notReloaded)).toBe(true);

  const mi = await readCharts(page);
  const expectScaled = (actual, expected, factor) =>
    actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i] * factor, 9));
  km.range.datasets.forEach((dataset, i) => expectScaled(mi.range.datasets[i].data, dataset.data, KM_TO_MI));
  expectScaled(mi.battery.datasets[0].data, km.battery.datasets[0].data, 1 / KM_TO_MI);

  await page.reload();
  await expect(page.getByRole('button', { name: 'mi', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.chart-title').first()).toHaveText('Range in mi');

  await page.getByRole('button', { name: 'km', exact: true }).click();
  await expect(page.locator('.chart-title').first()).toHaveText('Range in km');
  expect(await page.evaluate(() => localStorage.getItem('units'))).toBeNull();
});

test('shows the distance bars on demand, in line with the chart above them', async ({ page }) => {
  await page.goto('/');
  expect((await readCharts(page)).rangeDistance).toBeNull();
  const figure = page.locator('[data-chart="range"]');
  const strip = figure.locator('.strip');
  await expect(strip).toBeHidden();

  await distanceSwitch(page, 'range').check();
  await expect(strip).toBeVisible();
  await expect(strip.locator('.strip-title')).toHaveText('Distance ridden (km)');

  const plotArea = (selector) =>
    figure.evaluate((element, selector) => {
      const { left, right } = Chart.getChart(element.querySelector(selector)).chartArea;
      return [left, right];
    }, selector);
  expect(await plotArea('.strip canvas')).toEqual(await plotArea('.plot canvas'));
  expect(await figure.evaluate((element) => Chart.getChart(element.querySelector('.plot canvas')).options.scales.x.ticks.display)).toBe(false);

  await distanceSwitch(page, 'range').uncheck();
  await expect(strip).toBeHidden();
  expect(await figure.evaluate((element) => Chart.getChart(element.querySelector('.plot canvas')).options.scales.x.ticks.display)).toBe(true);
});

test('keeps the column names in sight while the table of months scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await readScooters(page);
  await page.getByText('Monthly numbers').click();
  const frame = page.locator('.table-wrap');
  const header = page.locator('.twin thead th').first();
  const top = (await frame.boundingBox()).y;
  expect(await frame.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  await frame.evaluate((element) => {
    element.scrollTop = 300;
  });

  await expect.poll(async () => (await header.boundingBox()).y).toBeCloseTo(top + 1, 0);
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});

test('takes a new size that arrives just as an animation ends', async ({ page }) => {
  await page.goto('/');
  await readCharts(page);
  const chartWidth = () => page.evaluate(() => Chart.getChart(document.querySelector('.plot canvas')).width);
  expect(await chartWidth()).not.toBe(500);

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const chart = Chart.getChart(document.querySelector('.plot canvas'));
        chart.update();
        const { items } = Chart.animator._charts.get(chart);
        const waitForLastFrame = () => {
          if (items.length > 0 && items.every((item) => !item.active())) {
            chart.resize(500, 300);
            resolve();
          } else {
            requestAnimationFrame(waitForLastFrame);
          }
        };
        waitForLastFrame();
      }),
  );

  await expect.poll(chartWidth).toBe(500);
});

test('leaves no old charts behind when it draws again', async ({ page }) => {
  await page.goto('/');
  await readScooters(page);
  const charts = () => page.evaluate(() => Object.keys(Chart.instances).length);
  expect(await charts()).toBe(2);

  await page.getByRole('button', { name: 'mi', exact: true }).click();
  await expect(page.locator('.chart-title').first()).toHaveText('Range in mi');
  expect(await charts()).toBe(2);
});

test.describe('when the units or the light or dark mode change', () => {
  test.beforeEach(async ({ page }) => {
    await storeItems(page, {
      vehicles,
      trips: { SN1: monthOfTrips(202401).concat(monthOfTrips(202402)), SN2: monthOfTrips(202401).concat(monthOfTrips(202402)) },
    });
    await page.goto('/');
    await readScooters(page);
  });

  for (const [change, act] of [
    ['units', (page) => page.getByRole('button', { name: 'mi', exact: true }).click()],
    ['mode', (page) => page.emulateMedia({ colorScheme: 'dark' })],
  ]) {
    test(`keeps what is turned on when the ${change} change`, async ({ page }) => {
      await distanceSwitch(page, 'range', 1).check();
      await page.locator('.scooter').nth(1).getByText('Monthly numbers').click();

      await act(page);

      await expect(distanceSwitch(page, 'range', 1)).toBeChecked();
      await expect(page.locator('.scooter').nth(1).locator('[data-chart="range"] .strip')).toBeVisible();
      await expect(page.locator('.scooter').nth(1).locator('tbody')).toBeVisible();
      await expect(distanceSwitch(page, 'range', 0)).not.toBeChecked();
      await expect(page.locator('.scooter').nth(0).locator('tbody')).toBeHidden();
    });

    test(`keeps the place on the page when the ${change} change`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 700 });
      await page.locator('.scooter').nth(1).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, 1100));
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBe(1100);
      const oldCanvas = await page.locator('.plot canvas').first().elementHandle();

      await act(page);

      await expect.poll(() => oldCanvas.evaluate((canvas) => canvas.isConnected)).toBe(false);
      expect(await page.evaluate(() => window.scrollY)).toBe(before);
    });
  }

  test('keeps a table open that was opened just before', async ({ page }) => {
    await page.evaluate(() => {
      document.querySelectorAll('.twin')[1].open = true;
      document.querySelector('[data-units="mi"]').click();
    });

    await expect(page.locator('.chart-title').first()).toHaveText('Range in mi');
    await expect(page.locator('.scooter').nth(1).locator('tbody')).toBeVisible();
    await expect(page.locator('.scooter').nth(0).locator('tbody')).toBeHidden();
  });
});

test('charts stored scooters instead of the example', async ({ page }) => {
  await storeItems(page, {
    vehicles,
    trips: {
      SN1: [
        trip(20240105, 20000, 40),
        trip(20240110, 3000, 0),
        trip(20240120, 10000, 20),
        trip(20240203, 24000, 60),
      ],
      SN2: [trip(20240301, 20000, 25)],
    },
  });
  await page.goto('/');

  const [blue, red, ...others] = await readScooters(page);
  expect(others).toEqual([]);
  expect([blue.name, blue.details]).toEqual(['Blue', 'NQi GTS · SN1']);
  expect([red.name, red.details]).toEqual(['Red', 'MQi+ · SN2']);

  await distanceSwitch(page, 'range', 0).check();
  const charts = await readCharts(page, 0);
  expect(charts.range.labels).toEqual(['Jan 2024', 'Feb 2024']);
  expect(charts.rangeDistance.datasets[0].data).toEqual([30, 24]);
  expect(charts.battery.datasets[0].data).toEqual([2, 2.5]);
  expect(charts.range.datasets.map(({ data }) => data)).toEqual([[35, 28], [5, 4], [5, 4]]);

  expect(red.range).toBe('~72 km');
  expect(red.rows).toEqual([['Mar 2024', '72.0', '1.25', '20']]);
  expect(red.chartTitles).toEqual([]);
});

test('loads Chart.js from this site, not from a CDN', async ({ page, baseURL }) => {
  const scripts = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/');

  expect(scripts.filter((url) => /chart/i.test(url))).toEqual([`${baseURL}/vendor/chart.umd.min.js`]);
  expect((await readCharts(page)).range).toBeTruthy();
});

test('shows scooter names as text, not as HTML', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: { sn_id: 'SN1', scooter_name: '<img src=x onerror="window.injected=1">', sku_name: 'R&D' } },
    trips: { SN1: monthOfTrips(202401) },
  });
  await page.goto('/');

  const [scooter] = await readScooters(page);
  expect(scooter.name).toBe('<img src=x onerror="window.injected=1">');
  expect(scooter.details).toBe('R&D · SN1');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test('mentions the example scooter only while the charts show it', async ({ page }) => {
  await page.goto('/');
  await readScooters(page);
  await expect(page.locator('#example-note')).toBeVisible();

  await storeItems(page, { vehicles: { SN1: vehicles.SN1 }, trips: { SN1: monthOfTrips(202401) } });
  await page.goto('/');
  await readScooters(page);
  await expect(page.locator('#example-note')).toBeHidden();
});

test('shows the example when only scooters are stored', async ({ page }) => {
  await storeItems(page, { vehicles });
  await page.goto('/');

  expect((await readScooters(page))[0].name).toBe('Example');
});

test('shows the example when only trips are stored', async ({ page }) => {
  await storeItems(page, { trips: { SN1: monthOfTrips(202401) } });
  await page.goto('/');

  expect((await readScooters(page))[0].name).toBe('Example');
});

test('names a scooter by what is known about it', async ({ page }) => {
  await storeItems(page, {
    vehicles: {
      SN1: vehicles.SN1,
      SN3: { sn_id: 'SN3', scooter_name: '', sku_name: 'UQi' },
      SN4: { sn_id: 'SN4', scooter_name: 'No model' },
      SN5: { sn_id: 'SN5' },
    },
    trips: { SN2: monthOfTrips(202401), SN3: monthOfTrips(202401), SN4: monthOfTrips(202401), SN5: monthOfTrips(202401) },
  });
  await page.goto('/');

  const names = (await readScooters(page)).map(({ name, details }) => [name, details]);
  expect(names).toEqual([
    ['SN2', ''],
    ['SN3', 'UQi'],
    ['No model', 'SN4'],
    ['SN5', ''],
  ]);
  expect(await page.evaluate(() => /undefined|NaN|Infinity/.test(document.body.innerText))).toBe(false);
});

test('leaves out a trip that used far more battery than its distance should take', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(49, 10000, 20), trip(20240131, 1000, 50)] },
  });
  await page.goto('/');

  expect((await readScooters(page))[0].rows).toEqual([['Jan 2024', '45.0', '2.00', '490']]);
});

test('leaves out a long trip that shows hardly any battery use', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(48, 10000, 20), trip(20240131, 80000, 17)] },
  });
  await page.goto('/');

  expect((await readScooters(page))[0].rows).toEqual([['Jan 2024', '45.0', '2.00', '480']]);
});

test('keeps a trip that used somewhat more battery than usual', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: [...januaryTrips(48, 10000, 20), trip(20240131, 1000, 5)] },
  });
  await page.goto('/');

  expect((await readScooters(page))[0].rows).toEqual([['Jan 2024', '44.9', '2.01', '481']]);
});

test('judges a scooter by its own battery use, however high', async ({ page }) => {
  await storeItems(page, {
    vehicles: { SN1: vehicles.SN1 },
    trips: { SN1: januaryTrips(30, 3000, 18) },
  });
  await page.goto('/');

  expect((await readScooters(page))[0].rows).toEqual([['Jan 2024', '15.0', '6.00', '90']]);
});

test('offers to delete the data only when there is some', async ({ page }) => {
  await page.goto('/');
  await readScooters(page);
  await expect(page.getByRole('button', { name: 'Delete your data' })).toBeHidden();

  await storeItems(page, { vehicles: {}, trips: {} });
  await page.goto('/');
  await readScooters(page);
  await expect(page.getByRole('button', { name: 'Delete your data' })).toBeVisible();
});

test('removing the data brings back the example', async ({ page }) => {
  await storeItems(page, { vehicles: { SN1: vehicles.SN1 }, trips: { SN1: monthOfTrips(202401) } });
  await page.goto('/');
  expect((await readScooters(page))[0].name).toBe('Blue');

  await reloadedBy(page, () => page.getByRole('button', { name: 'Delete your data' }).click());

  expect((await readScooters(page))[0].name).toBe('Example');
  expect(await page.evaluate(() => [localStorage.getItem('vehicles'), localStorage.getItem('trips')])).toEqual([null, null]);
});
