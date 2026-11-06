// What the home page shows for riding histories that are not a steady year of riding: new scooters, single trips in
// a month, winter breaks, a very long history, and readings that make no sense. The rules themselves are tested in
// tests/unit/summary.test.js; these tests are about what reaches the page.
import { distanceSwitch, expect, monthOfTrips, monthsBetween, readCharts, readScooters, storeItems, test, trip } from './fixtures.js';

const riding = (months, n, m, b) => months.flatMap((month) => monthOfTrips(month, n, m, b));
const blue = { sn_id: 'SN1', scooter_name: 'Blue', sku_name: 'NQi GTS' };
const NINE_YEARS = riding(monthsBetween(201711, 202610), 4);

/** Opens the home page with the trips of one scooter, or { serial number: trips } of several. */
async function show(page, trips, { units } = {}) {
  const allTrips = Array.isArray(trips) ? { SN1: trips } : trips;
  const vehicles = Object.fromEntries(Object.keys(allTrips).map((sn) => [sn, { ...blue, sn_id: sn }]));
  await storeItems(page, { vehicles, trips: allTrips, ...(units ? { units } : {}) });
  await page.goto('/');
  return readScooters(page);
}

const emptyMonths = ({ labels, datasets }) => labels.filter((_, i) => datasets[0].data[i] === null);
const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shownText = (page) => page.evaluate(() => document.body.innerText);

/** The months named on a time axis, and the smallest distance in pixels between two names. */
const namedOnAxis = (page, index = 0) =>
  page.evaluate((index) => {
    const canvas = document.querySelectorAll('.scooter')[index].querySelector('[data-chart="range"] .plot canvas');
    const scale = Chart.getChart(canvas).scales.x;
    const named = scale.ticks.map((tick, i) => ({ label: tick.label, x: scale.getPixelForTick(i) })).filter(({ label }) => label);
    return {
      labels: named.map(({ label }) => label),
      smallestGap: Math.min(...named.slice(1).map(({ x }, i) => x - named[i].x), Infinity),
    };
  }, index);

test.describe('a new scooter', () => {
  test('shows nothing yet below 20 km', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 19900, 40)]);

    expect(scooter.level).toBe('wait');
    expect(scooter.label).toBe('Range on a charge');
    expect(scooter.wait).toBe('Not enough trips yet. The estimate appears after about 20 km of riding.');
    expect(scooter.range).toBe('');
    expect(scooter.note).toBe('');
    expect(scooter.records).toEqual([]);
    expect(scooter.chartTitles).toEqual([]);
    expect(scooter.notes).toEqual(['charts-wait']);
    expect(scooter.noteTexts).toEqual(['Monthly charts appear once two months each have at least 20 km ridden.']);
    // The month itself is listed, without figures.
    expect(scooter.rows).toEqual([['Jan 2024', '–', '–', '20']]);
    expect(scooter.tableNote).toBe('– means under 20 km ridden that month.');
  });

  test('shows a rough figure from 20 km, marked as such', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 29000, 58)]);

    expect(scooter.level).toBe('rough');
    expect(scooter.range).toBe('~45 km');
    expect(scooter.caution).toBe('Rough estimate: based on only 29 km so far.');
    expect(scooter.gaugeBars).toBe(0);
    expect(scooter.gauge).toEqual([]);
    expect(scooter.label).toBe('Range on a charge, all trips');
    expect(scooter.note).toBe('From 100% to 10% battery, Jan 2024');
    expect(scooter.notes).toEqual(['charts-wait']);
  });

  test('does not round the distance of a rough figure up to the limit', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 49900, 100)]);
    expect(scooter.caution).toBe('Rough estimate: based on only 49 km so far.');
  });

  test('shows a plain figure from 50 km, still without the best and lowest month', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 50000, 100)]);

    expect(scooter.level).toBe('full');
    expect(scooter.range).toBe('45 km');
    expect(scooter.caution).toBe('');
    expect(scooter.gauge).toEqual(['30% at 35 km', '20% at 40 km', '10% at 45 km']);
    expect(scooter.gaugeBars).toBe(1);
    expect(scooter.records).toEqual([]);
    await expect(page.locator('.stats')).toHaveClass(/stats-single/);
  });

  test('shows charts from two months of 20 km', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 20000, 40), trip(20240205, 20000, 40)]);

    expect(scooter.chartTitles).toEqual(['Range in km', 'Battery used per km (%)']);
    expect(scooter.notes).toEqual([]);
  });

  test('tells very short trips from no trips at all', async ({ page }) => {
    const [scooter] = await show(page, [trip(20240105, 3000, 0), trip(20240106, 900, 0)]);

    expect(scooter.level).toBe('wait');
    expect(scooter.empty).toBe('');
    expect(scooter.hasTable).toBe(false);
  });

  test('says so when a scooter has no trips, beside one that has', async ({ page }) => {
    const [first, second] = await show(page, { SN1: monthOfTrips(202401), SN2: [] });

    expect(first.empty).toBe('');
    expect(first.range).toBe('45 km');
    expect(second.empty).toBe('No trips recorded for this scooter yet.');
    expect(second.level).toBeUndefined();
  });

  test('says so when the account has no scooters', async ({ page }) => {
    await storeItems(page, { vehicles: {}, trips: {} });
    await page.goto('/');

    await expect(page.locator('#scooters .scooter-empty')).toHaveText('No scooters found in your Niu account.');
    await expect(page.locator('#example-note')).toBeHidden();
  });
});

test.describe('riding only from April to October', () => {
  // The earlier seasons use twice the battery, so the result shows which months went into it.
  const trips = [
    ...riding([2023, 2024, 2025].flatMap((year) => monthsBetween(year * 100 + 4, year * 100 + 10)), 8, 10000, 40),
    ...riding(monthsBetween(202604, 202610)),
  ];

  test('keeps the winters on the time axis as gaps', async ({ page }) => {
    const [scooter] = await show(page, trips);
    const { range, battery } = await readCharts(page);

    expect(range.labels).toHaveLength(43); // April 2023 to October 2026
    expect(emptyMonths(range)).toHaveLength(15); // three winters of five months
    expect(range.labels.slice(6, 8)).toEqual(['Oct 2023', 'Nov 2023']);
    expect(battery.datasets[0].data.filter((value) => value === null)).toHaveLength(15);
    // A gap in the riding is no reason for a warning, and has no row in the table.
    expect(scooter.notes).toEqual([]);
    expect(scooter.tableNote).toBe('');
    expect(scooter.rows).toHaveLength(28);
  });

  test('bases the range on the latest season and compares all of them', async ({ page }) => {
    const [scooter] = await show(page, trips);

    expect(scooter.label).toBe('Range on a charge, latest 12 months');
    expect(scooter.range).toBe('45 km');
    expect(scooter.note).toBe('From 100% to 10% battery, Apr 2026 – Oct 2026');
    expect(scooter.records).toEqual(['45 km', '23 km']);
  });
});

test.describe('a month with a single trip', () => {
  const trips = [
    ...riding(monthsBetween(202501, 202506)),
    trip(20250715, 1200, 1), // a short trip: 90 points would take 108 km
    ...riding(monthsBetween(202508, 202601)),
    trip(20260215, 25000, 25), // a long trip: 90 points take 90 km
    ...riding(monthsBetween(202603, 202610)),
  ];

  test('leaves a short trip out of the charts, and says so', async ({ page }) => {
    const [scooter] = await show(page, trips);
    const { range } = await readCharts(page);

    expect(emptyMonths(range)).toEqual(['Jul 2025']);
    const highest = Math.max(...range.labels.map((_, i) => range.datasets.reduce((sum, { data }) => sum + (data[i] ?? 0), 0)));
    expect(highest).toBeCloseTo(90, 9);
    expect(scooter.notes).toEqual(['months-left-out']);
    expect(scooter.noteTexts).toEqual([
      "Months with under 20 km ridden aren't charted, because that's too little for a reliable figure.",
    ]);
    expect(scooter.tableNote).toBe('– means under 20 km ridden that month.');
    expect(scooter.rows.find(([month]) => month === 'Jul 2025')).toEqual(['Jul 2025', '–', '–', '1']);
  });

  test('still shows that month in the distance bars', async ({ page }) => {
    await show(page, trips);
    await distanceSwitch(page, 'range').check();
    const { range, rangeDistance } = await readCharts(page);

    expect(rangeDistance.datasets[0].data[range.labels.indexOf('Jul 2025')]).toBeCloseTo(1.2, 9);
  });

  test('charts a long trip, but does not let it be the best month', async ({ page }) => {
    const [scooter] = await show(page, trips);

    expect(scooter.rows.find(([month]) => month === 'Feb 2026')).toEqual(['Feb 2026', '90.0', '1.00', '25']);
    expect(scooter.recordMonths).not.toContain('Feb 2026');
    expect(scooter.recordMonths).not.toContain('Jul 2025');
  });

  test('shows no warning for a month whose only trips are left out for other reasons', async ({ page }) => {
    const [scooter] = await show(page, [...monthOfTrips(202401), trip(20240205, 3000, 0), ...monthOfTrips(202403)]);
    const { range } = await readCharts(page);

    expect(emptyMonths(range)).toEqual(['Feb 2024']);
    expect(scooter.notes).toEqual([]);
    expect(scooter.rows.map(([month]) => month)).toEqual(['Mar 2024', 'Jan 2024']);
  });

  test('leaves out a month whose only trip is a faulty reading', async ({ page }) => {
    const [scooter] = await show(page, [...monthOfTrips(202401, 30), trip(20240205, 1000, 50), ...monthOfTrips(202403, 30)]);
    const { range } = await readCharts(page);

    expect(emptyMonths(range)).toEqual(['Feb 2024']);
    expect(scooter.range).toBe('45 km');
  });
});

test.describe('back after a long break', () => {
  const trips = [...riding(monthsBetween(202404, 202410)), ...monthOfTrips(202604, 3, 8000, 16)];

  test('goes by the whole history, with a plain figure', async ({ page }) => {
    const [scooter] = await show(page, trips);

    expect(scooter.label).toBe('Range on a charge, all trips');
    expect(scooter.level).toBe('full');
    expect(scooter.note).toBe('From 100% to 10% battery, Apr 2024 – Apr 2026');
  });

  test('shows the break on the time axis', async ({ page }) => {
    await show(page, trips);
    expect(emptyMonths((await readCharts(page)).range)).toHaveLength(17); // November 2024 to March 2026
  });
});

test.describe('the battery line', () => {
  const pointSizes = (page) =>
    page.evaluate(() => {
      const chart = Chart.getChart(document.querySelector('[data-chart="battery"] .plot canvas'));
      return Object.fromEntries(chart.data.labels.map((label, i) => [label, chart.getDatasetMeta(0).data[i].options.radius]));
    });

  test('shows a point for a month between two gaps, which a line alone could not show', async ({ page }) => {
    await show(page, [
      ...riding(monthsBetween(202301, 202306)),
      ...monthOfTrips(202309),
      ...riding(monthsBetween(202312, 202406)),
    ]);
    await readCharts(page);
    const sizes = await pointSizes(page);

    expect(sizes['Sep 2023']).toBe(4);
    expect(sizes['Mar 2023']).toBe(0);
    expect(sizes['Mar 2024']).toBe(0);
  });

  test('shows a point for every month of a short history', async ({ page }) => {
    await show(page, riding(monthsBetween(202401, 202406)));
    await readCharts(page);

    expect(new Set(Object.values(await pointSizes(page)))).toEqual(new Set([4]));
  });
});

test('charts two months far apart, on a continuous axis', async ({ page }) => {
  const [scooter] = await show(page, [...monthOfTrips(202408), ...monthOfTrips(202608)]);

  expect((await readCharts(page)).range.labels).toHaveLength(25);
  expect(scooter.chartTitles).toHaveLength(2);
  expect(scooter.records).toHaveLength(2);
});

test('counts the latest 12 months across New Year, and names every month', async ({ page }) => {
  // January 2025 uses twice the battery, and is the 13th month back from January 2026.
  const [scooter] = await show(page, [...monthOfTrips(202501, 8, 10000, 40), ...riding(monthsBetween(202502, 202601))]);

  expect(scooter.range).toBe('45 km');
  expect(scooter.note).toBe('From 100% to 10% battery, Feb 2025 – Jan 2026');
  expect(scooter.records).toEqual(['45 km', '23 km']);
  expect(scooter.recordMonths[1]).toBe('Jan 2025');
  expect([...new Set(scooter.rows.map(([month]) => month.slice(0, 3)))].sort()).toEqual(
    ['Apr', 'Aug', 'Dec', 'Feb', 'Jan', 'Jul', 'Jun', 'Mar', 'May', 'Nov', 'Oct', 'Sep'],
  );
});

test('does not depend on the order of the trips', async ({ page }) => {
  const shuffled = [...monthOfTrips(202312), ...monthOfTrips(202403), ...monthOfTrips(202401)];
  const fromShuffled = await show(page, shuffled);
  const chartsFromShuffled = await readCharts(page);
  const fromSorted = await show(page, [...shuffled].sort((a, b) => a.d - b.d));

  expect(fromShuffled).toEqual(fromSorted);
  expect(chartsFromShuffled.range.labels).toEqual(['Dec 2023', 'Jan 2024', 'Feb 2024', 'Mar 2024']);
  expect(fromSorted[0].rows.map(([month]) => month)).toEqual(['Mar 2024', 'Jan 2024', 'Dec 2023']);
});

test.describe('readings that make no sense', () => {
  test('never shows them as NaN or Infinity', async ({ page }) => {
    await show(page, [
      trip(20240105, 0, 3),
      trip(20240106, 0, 0),
      ...monthOfTrips(202402),
      trip(20240305, -500, 2),
      ...monthOfTrips(202404),
    ]);

    expect(await shownText(page)).not.toMatch(/undefined|NaN|Infinity/);
  });

  for (const width of [1440, 320]) {
    test(`fits a huge distance at ${width} px, with shortened numbers on the axis`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      // 12 080 km in February, of which the range is about 6600 km.
      await show(page, [...monthOfTrips(202401), trip(20240205, 12000000, 5), ...monthOfTrips(202402), ...monthOfTrips(202403)]);
      await distanceSwitch(page, 'range').check();
      await expect.poll(() => overflow(page)).toBe(0);

      const axes = await page.locator('[data-chart="range"]').evaluate((figure) =>
        ['.plot canvas', '.strip canvas'].map((selector) => {
          const chart = Chart.getChart(figure.querySelector(selector));
          const scale = chart.scales.y;
          chart.ctx.save();
          chart.ctx.font = `12px ${Chart.defaults.font.family}`;
          const widest = Math.max(...scale.ticks.map((tick) => chart.ctx.measureText(tick.label).width));
          chart.ctx.restore();
          return { labels: scale.ticks.map((tick) => tick.label), fits: Math.ceil(widest) + 8 <= scale.width };
        }),
      );
      expect(axes.map(({ fits }) => fits)).toEqual([true, true]);
      expect(axes[1].labels.some((label) => /K$/.test(label))).toBe(true);
    });
  }
});

test.describe('a long history', () => {
  for (const width of [1440, 768, 390, 320]) {
    test(`names years without overlaps at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await show(page, NINE_YEARS);

      expect((await readCharts(page)).range.labels).toHaveLength(108);
      const { labels, smallestGap } = await namedOnAxis(page);
      expect(labels.length).toBeGreaterThan(1);
      expect(labels.every((label) => /^\d{4}$/.test(label))).toBe(true);
      expect(smallestGap).toBeGreaterThanOrEqual(30);
      expect(await overflow(page)).toBe(0);
    });
  }

  test('names fewer years when a phone is turned upright', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await show(page, NINE_YEARS);
    const landscape = await namedOnAxis(page);

    await page.setViewportSize({ width: 320, height: 700 });
    await expect.poll(async () => (await namedOnAxis(page)).labels.length).toBeLessThan(landscape.labels.length);
    expect((await namedOnAxis(page)).smallestGap).toBeGreaterThanOrEqual(30);
    await expect.poll(() => overflow(page)).toBe(0);
  });

  test('names months when there are few', async ({ page }) => {
    await show(page, riding(monthsBetween(202401, 202406)));
    expect((await namedOnAxis(page)).labels).toContain('Jan 2024');
  });
});

test.describe('the tooltip', () => {
  const trips = [...riding(monthsBetween(202404, 202410)), ...riding(monthsBetween(202504, 202510))];

  /** Moves the mouse over a month of a chart and returns what its tooltip shows. */
  async function hover(page, canvas, month) {
    await canvas.scrollIntoViewIfNeeded();
    const place = await canvas.evaluate((element, month) => {
      const chart = Chart.getChart(element);
      const box = element.getBoundingClientRect();
      return { x: box.left + chart.scales.x.getPixelForValue(chart.data.labels.indexOf(month)), y: box.top + 60 };
    }, month);
    await page.mouse.move(place.x, place.y);
    return () =>
      canvas.evaluate((element) => {
        const { tooltip } = Chart.getChart(element);
        return { opacity: tooltip.opacity, title: tooltip.title, body: tooltip.body?.map(({ lines }) => lines[0]), footer: tooltip.footer };
      });
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('of a month gives its bands and their total, and of a gap nothing', async ({ page }) => {
    await show(page, trips);
    const canvas = page.locator('[data-chart="range"] .plot canvas');

    const summer = await hover(page, canvas, 'Jul 2024');
    await expect.poll(async () => (await summer()).opacity).toBe(1);
    expect(await summer()).toMatchObject({
      title: ['Jul 2024'],
      body: ['35.0 km  Range from 100% to 30%', '5.0 km  Range from 30% to 20%', '5.0 km  Range from 20% to 10%'],
      footer: ['45.0 km  Range from 100% to 10%'],
    });

    const winter = await hover(page, canvas, 'Jan 2025');
    await expect.poll(async () => (await winter()).opacity).toBe(0);
  });

  test('of the battery line and the distance bars gives their value, and of a gap nothing', async ({ page }) => {
    await show(page, trips);
    const line = page.locator('[data-chart="battery"] .plot canvas');
    const summer = await hover(page, line, 'Jul 2024');
    await expect.poll(async () => (await summer()).opacity).toBe(1);
    expect((await summer()).body).toEqual(['2.00%  per km']);
    const winter = await hover(page, line, 'Jan 2025');
    await expect.poll(async () => (await winter()).opacity).toBe(0);

    await distanceSwitch(page, 'battery').check();
    const bars = page.locator('[data-chart="battery"] .strip canvas');
    const ridden = await hover(page, bars, 'Jul 2024');
    await expect.poll(async () => (await ridden()).opacity).toBe(1);
    expect((await ridden()).body).toEqual(['80 km  ridden']);
  });

  test('gives miles too', async ({ page }) => {
    await show(page, trips, { units: 'mi' });
    const canvas = page.locator('[data-chart="range"] .plot canvas');

    const summer = await hover(page, canvas, 'Jul 2024');
    await expect.poll(async () => (await summer()).opacity).toBe(1);
    // 45 km is 27.96 mi.
    expect((await summer()).footer).toEqual(['28.0 mi  Range from 100% to 10%']);
  });
});

test.describe('in miles', () => {
  test('says the same with miles in every text', async ({ page }) => {
    const [waiting, rough, withShortMonth] = await show(
      page,
      {
        SN1: [trip(20261005, 8000, 16)],
        SN2: [trip(20261005, 29000, 58)],
        SN3: [...monthOfTrips(202608), trip(20260905, 1200, 1), ...monthOfTrips(202610)],
      },
      { units: 'mi' },
    );

    // 20 km is 12.4 mi, which the text rounds up.
    expect(waiting.wait).toBe('Not enough trips yet. The estimate appears after about 13 mi of riding.');
    expect(waiting.noteTexts).toEqual(['Monthly charts appear once two months each have at least 13 mi ridden.']);
    expect(waiting.tableNote).toBe('– means under 13 mi ridden that month.');
    // 29 km is 18.02 mi, and 45 km is 27.96 mi.
    expect(rough.caution).toBe('Rough estimate: based on only 18 mi so far.');
    expect(rough.range).toBe('~28 mi');
    expect(withShortMonth.noteTexts).toEqual([
      "Months with under 13 mi ridden aren't charted, because that's too little for a reliable figure.",
    ]);
    expect(withShortMonth.range).toBe('28 mi');
    expect(withShortMonth.gauge).toEqual(['30% at 22 mi', '20% at 25 mi', '10% at 28 mi']);
    expect(withShortMonth.records).toEqual(['28 mi', '28 mi']);
    expect(withShortMonth.chartTitles).toEqual(['Range in mi', 'Battery used per mi (%)']);
    expect(withShortMonth.headers).toEqual(['Month', 'Range from 100% to 10% (mi)', 'Battery used per mi (%)', 'Distance ridden (mi)']);
  });

  const shape = ({ level, notes, chartTitles, records, hasTable, tableNote }) => ({
    level,
    notes,
    charts: chartTitles.length,
    records: records.length,
    hasTable,
    dashes: tableNote !== '',
  });
  const histories = {
    'just below 20 km': [trip(20240105, 19900, 40)],
    'exactly 20 km': [trip(20240105, 20000, 40)],
    'just below 50 km': [trip(20240105, 49900, 100)],
    'exactly 50 km': [trip(20240105, 50000, 100)],
    'exactly 50 km over two months': [trip(20240105, 6800, 14), trip(20240205, 43200, 86)],
    'two months of exactly 20 km': [trip(20240105, 20000, 40), trip(20240205, 20000, 40)],
    'a winter break': [...riding(monthsBetween(202404, 202410)), ...riding(monthsBetween(202504, 202510))],
    'a single short trip in a month': [...monthOfTrips(202401), trip(20240205, 1200, 1), ...monthOfTrips(202403)],
    'a month just below 20 km': [...monthOfTrips(202401), trip(20240205, 19900, 40), ...monthOfTrips(202403)],
  };
  for (const [name, trips] of Object.entries(histories)) {
    test(`shows the same as in kilometres with ${name}`, async ({ page }) => {
      const [km] = await show(page, trips);
      const chartsInKm = await readCharts(page);
      await page.getByRole('button', { name: 'mi', exact: true }).click();
      await expect(page.getByRole('button', { name: 'mi', exact: true })).toHaveAttribute('aria-pressed', 'true');
      const [mi] = await readScooters(page);
      const chartsInMi = await readCharts(page);

      expect(shape(mi)).toEqual(shape(km));
      if (chartsInKm.range) expect(emptyMonths(chartsInMi.range)).toEqual(emptyMonths(chartsInKm.range));
    });
  }
});
