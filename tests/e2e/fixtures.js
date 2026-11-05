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

/** Labels and data of the four charts the home page draws for one scooter. */
export function readCharts(page, sn) {
  return page.evaluate((sn) => {
    const read = (id) => {
      const { labels, datasets } = Chart.getChart(id + sn).data;
      return { labels, datasets: datasets.map(({ label, data }) => ({ label, data })) };
    };
    return {
      range: read('rangeChart'),
      rangeDistance: read('rangeDistanceChart'),
      battery: read('batteryChart'),
      batteryDistance: read('batteryDistanceChart'),
    };
  }, sn);
}

/** Waits for the page to load again after an action that reloads it. */
export async function reloadedBy(page, action) {
  const loaded = page.waitForEvent('load');
  await action();
  await loaded;
}
