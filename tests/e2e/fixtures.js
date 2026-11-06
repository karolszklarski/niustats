// Shared test setup. No test talks to a real server, and an uncaught error in the page fails the test.
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Routes a test adds to the page, such as a stubbed Niu API, take precedence over this one.
    await page.context().route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(baseURL)) return route.continue();
      // Anything else, Google Analytics included, never leaves the test.
      return route.abort('blockedbyclient');
    });
    await use(page);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
});

export { expect };

/** Puts items into the site's localStorage, as an earlier visit would have. */
export async function storeItems(page, items) {
  await page.goto('/robots.txt');
  await page.evaluate((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, Object.entries(items).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

/** A trip: date (yyyymmdd), distance (metres) and battery used (percentage points). */
export const trip = (d, m, b) => ({ d, m, b });

/** n trips in a month, by default of 10 km and 20 points: 2 points per km, so a range of 45 km from 100% to 10%. */
export const monthOfTrips = (yyyymm, n = 8, m = 10000, b = 20) =>
  Array.from({ length: n }, (_, i) => trip(yyyymm * 100 + 1 + (i % 28), m, b));

/** Every month from one to another, as numbers: (202311, 202402) → [202311, 202312, 202401, 202402]. */
export function monthsBetween(from, to) {
  const months = [];
  for (let month = from; month <= to; month = month % 100 === 12 ? month + 89 : month + 1) months.push(month);
  return months;
}

const waitForScooters = (page) =>
  page.waitForFunction(() => document.getElementById('scooters').childElementCount > 0);

/** What the home page shows for each scooter, once it has drawn them. */
export async function readScooters(page) {
  await waitForScooters(page);
  return page.evaluate(() =>
    [...document.querySelectorAll('.scooter')].map((section) => {
      const visible = (selector) => [...section.querySelectorAll(selector)].filter((element) => element.offsetParent !== null);
      const texts = (selector) => visible(selector).map((element) => element.innerText.replace(/\s+/g, ' ').trim());
      return {
        name: section.querySelector('.scooter-name').textContent,
        details: section.querySelector('.scooter-details').textContent,
        empty: texts('.scooter-empty').join(''),
        level: section.querySelector('.stat-hero').dataset.level,
        label: section.querySelector('[data-stat="range-label"]').textContent, // as written, not as styled in capitals
        range: texts('.stat-hero .stat-value').join(''),
        note: texts('[data-stat="range-note"]').join(''),
        wait: texts('.stat-wait').join(''),
        caution: texts('.stat-caution').join(''),
        gauge: texts('.gauge-marks li'),
        gaugeBars: visible('.gauge-bar').length,
        records: texts('[data-extreme] .stat-value'),
        recordMonths: texts('[data-extreme] .stat-note'),
        chartTitles: texts('.chart-title'),
        notes: visible('.scooter-note').map((element) => element.dataset.note),
        noteTexts: texts('.scooter-note'),
        hasTable: visible('.twin').length > 0,
        headers: [...section.querySelectorAll('thead th')].map((cell) => cell.textContent),
        rows: [...section.querySelectorAll('tbody tr')].map((row) => [...row.cells].map((cell) => cell.textContent)),
        tableNote: [...section.querySelectorAll('.twin-note:not([hidden])')].map((note) => note.textContent).join(''),
      };
    }),
  );
}

/**
 * Labels and data of the charts of a scooter, by its place on the page, once they are drawn: range and battery, and
 * the distance bars under each while its switch is on. A chart that is not there is null.
 */
export async function readCharts(page, index = 0) {
  await waitForScooters(page);
  return page.evaluate((index) => {
    const section = document.querySelectorAll('.scooter')[index];
    const read = (selector) => {
      const chart = Chart.getChart(section.querySelector(selector));
      if (!chart) return null;
      const { labels, datasets } = chart.data;
      return { labels, datasets: datasets.map(({ label, data }) => ({ label, data })) };
    };
    return {
      range: read('[data-chart="range"] .plot canvas'),
      rangeDistance: read('[data-chart="range"] .strip canvas'),
      battery: read('[data-chart="battery"] .plot canvas'),
      batteryDistance: read('[data-chart="battery"] .strip canvas'),
    };
  }, index);
}

/** The switch that shows the distance bars under a chart: 'range' or 'battery', of a scooter by its place on the page. */
export const distanceSwitch = (page, chart, index = 0) =>
  page.locator('.scooter').nth(index).locator(`[data-chart="${chart}"]`).getByRole('checkbox', { name: 'Show distance ridden' });

/** Waits for the page to load again after an action that reloads it. */
export async function reloadedBy(page, action) {
  const loaded = page.waitForEvent('load');
  await action();
  await loaded;
}
