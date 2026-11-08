import { test as base, expect } from '@playwright/test';

const BLOCKED = 'Blocked by the Content Security Policy: ';

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((prefix) => {
      document.addEventListener('securitypolicyviolation', (event) =>
        console.error(`${prefix}${event.effectiveDirective} ${event.blockedURI}`),
      );
    }, BLOCKED);
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().startsWith(BLOCKED)) errors.push(message.text());
    });
    await page.context().route('**/*', (route) => {
      const url = route.request().url();
      if (url.startsWith(baseURL)) return route.continue();
      // Anything else, Google Analytics included, never leaves the test.
      return route.abort('blockedbyclient');
    });
    await use(page);
    expect(errors, 'uncaught errors and blocked content in the page').toEqual([]);
  },
});

export { expect };

export async function storeItems(page, items) {
  await page.goto('/robots.txt');
  await page.evaluate((entries) => {
    for (const [key, value] of entries) localStorage.setItem(key, value);
  }, Object.entries(items).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}

export const trip = (d, m, b) => ({ d, m, b });

export const monthOfTrips = (yyyymm, n = 8, m = 10000, b = 20) =>
  Array.from({ length: n }, (_, i) => trip(yyyymm * 100 + 1 + (i % 28), m, b));

export function monthsBetween(from, to) {
  const months = [];
  for (let month = from; month <= to; month = month % 100 === 12 ? month + 89 : month + 1) months.push(month);
  return months;
}

const waitForScooters = (page) =>
  page.waitForFunction(() => document.getElementById('scooters').childElementCount > 0);

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
        label: section.querySelector('[data-stat="range-label"]').textContent,
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

export const distanceSwitch = (page, chart, index = 0) =>
  page.locator('.scooter').nth(index).locator(`[data-chart="${chart}"]`).getByRole('checkbox', { name: 'Show distance ridden' });

export async function reloadedBy(page, action) {
  const loaded = page.waitForEvent('load');
  await action();
  await loaded;
}
