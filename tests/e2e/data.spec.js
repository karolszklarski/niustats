import { test, expect, storeItems } from './fixtures.js';

const csvLines = async (page) => (await page.locator('pre').innerText()).trim().split('\n');

test('lists the example trips when nothing is stored', async ({ page }) => {
  await page.goto('/data.html');

  const lines = await csvLines(page);
  expect(lines[0]).toBe('sn,date,distance,battery');
  expect(lines[1]).toBe('NAYL2AX2681A4DSQ,20190612,6461,13');
  expect(lines).toHaveLength(1 + 3208);
});

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

  expect(await csvLines(page)).toEqual([
    'sn,date,distance,battery',
    'SN1,20240105,10000,20',
    'SN1,20240120,5000,10',
    'SN2,20240301,20000,25',
  ]);
});
