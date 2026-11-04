import { test, expect, storeItems } from './fixtures.js';

test('lists the stored trips as CSV', async ({ page }) => {
  await storeItems(page, {
    vehicles: {},
    trips: {
      SN1: [
        { d: 20240105, m: 10000, b: 20 },
        { d: 20240120, m: 5000, b: 10 },
      ],
      SN2: [{ d: 20240301, m: 20000, b: 25 }],
    },
  });
  await page.goto('/data.html');

  expect((await page.locator('pre').innerText()).trim()).toBe(
    ['sn,date,distance,battery', 'SN1,20240105,10000,20', 'SN1,20240120,5000,10', 'SN2,20240301,20000,25'].join('\n'),
  );
});
