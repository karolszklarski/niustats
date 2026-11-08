import { readFileSync } from 'node:fs';
import { test, expect, monthOfTrips, readCharts, storeItems } from './fixtures.js';

const PAGES =['/', '/pull.html', '/privacy.html', '/data.html'];
const PAGES_WITH_FRAME = ['/', '/pull.html', '/privacy.html'];
const WIDTHS = [1440, 1100, 1099, 920, 768, 640, 639, 390, 320];

const LIGHT = { background: 'rgb(232, 236, 239)', text: 'rgb(16, 23, 28)', panel: 'rgb(255, 255, 255)' };
const DARK = { background: 'rgb(10, 13, 16)', text: 'rgb(238, 242, 245)', panel: 'rgb(18, 23, 28)' };

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const cssOf = (locator, property) =>
  locator.evaluate((element, property) => getComputedStyle(element)[property], property);
const showBanner = (page) => page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));

for (const path of PAGES) {
  test(`${path} fits every width from 1440 to 320 px`, async ({ page }) => {
    await page.goto(path);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 800 });
      // Polled, because Chart.js fits a canvas to its new width only on the next frame.
      await expect.poll(() => overflow(page), `at ${width} px`).toBe(0);
    }
  });

  test(`${path} follows the system's light and dark mode`, async ({ page }) => {
    for (const [colorScheme, colors] of [['light', LIGHT], ['dark', DARK]]) {
      await page.emulateMedia({ colorScheme });
      await page.goto(path);
      await expect(page.locator('body')).toHaveCSS('background-color', colors.background);
      await expect(page.locator('body')).toHaveCSS('color', colors.text);
      await expect(page.locator('html')).toHaveCSS('color-scheme', 'light dark');
    }
  });

  test(`${path} loads its styles from this site, in the right order`, async ({ page, baseURL }) => {
    const styles = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'stylesheet') styles.push(request.url());
    });
    await page.goto(path);

    // Ours come last, because they set the variables of the banner's styles.
    expect(styles).toEqual([`${baseURL}/vendor/cookieconsent.css`, `${baseURL}/css/site.css`]);
  });
}

for (const path of PAGES_WITH_FRAME) {
  test(`${path} shows its text in Saira from this site`, async ({ page, baseURL }) => {
    const fonts = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'font') fonts.push(request.url());
    });
    await page.goto(path);
    await page.evaluate(() => document.fonts.ready);

    expect(await page.evaluate(() => document.fonts.check('16px Saira'))).toBe(true);
    expect(await cssOf(page.locator('body'), 'fontFamily')).toMatch(/^Saira,/);
    expect(fonts).toContain(`${baseURL}/vendor/saira-latin-standard-normal.woff2`);
  });

  test(`${path} links back to the home page from its name`, async ({ page }) => {
    await page.goto(path);
    if (path === '/') await expect(page.locator('h1.brand')).toContainText('Niu Stats');
    else await expect(page.locator('a.brand')).toHaveAttribute('href', '.');
  });
}

test('loads the file with Polish letters only for a page that shows them', async ({ page, baseURL }) => {
  const latinExt = `${baseURL}/vendor/saira-latin-ext-standard-normal.woff2`;
  const fonts = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fonts.push(request.url());
  });

  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(fonts).not.toContain(latinExt);

  await page.goto('/privacy.html');
  await page.evaluate(() => document.fonts.ready);
  expect(fonts).toContain(latinExt);
});

test('every page has the same name and footer', async ({ page }) => {
  const frames = [];
  for (const path of PAGES_WITH_FRAME) {
    await page.goto(path);
    frames.push({
      name: await page.locator('.brand').evaluate((brand) => brand.innerHTML.replace(/\s+/g, ' ')),
      footer: await page.locator('.links').evaluate((links) => links.innerHTML.replace(/\s+/g, ' ')),
    });
  }
  expect(frames[1]).toEqual(frames[0]);
  expect(frames[2]).toEqual(frames[0]);
});

test('every page uses the same stylesheets and icon', () => {
  const head = (path) => {
    const html = readFileSync(new URL(`../../public${path === '/' ? '/index.html' : path}`, import.meta.url), 'utf8');
    return html.match(/<link href=[^>]*>/g);
  };
  for (const path of PAGES) expect(head(path)).toEqual(head('/'));
});

test('keeps the rail in place beside the content from 1100 px', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/privacy.html');
  const rail = await page.locator('.rail').boundingBox();
  const main = await page.locator('main').boundingBox();
  expect(rail.x).toBe(0);
  expect(main.x).toBe(rail.width);

  await page.evaluate(() => window.scrollTo(0, 500));
  expect((await page.locator('.rail').boundingBox()).y).toBe(0);
  const footer = await page.locator('.links').boundingBox();
  expect(footer.y + footer.height).toBe(800);
});

test('stacks the rail above the content below 1100 px', async ({ page }) => {
  await page.setViewportSize({ width: 1099, height: 800 });
  await page.goto('/privacy.html');
  const rail = await page.locator('.rail').boundingBox();
  const main = await page.locator('main').boundingBox();
  expect(main.x).toBe(0);
  expect(main.y).toBe(rail.height);
});

test.describe('the figures at the top', () => {
  for (const width of [1440, 640, 639, 390, 320]) {
    test(`set the main figure apart from the other two at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');
      await readCharts(page);

      const main = await page.locator('.stat-hero').boundingBox();
      const [best, lowest] = await Promise.all(
        [0, 1].map((tile) => page.locator('[data-extreme]').nth(tile).boundingBox()),
      );
      if (width >= 640) {
        expect(main.width / best.width).toBeCloseTo(2, 1);
        expect(best.x).toBeGreaterThan(main.x + main.width - 1);
        expect(lowest.x).toBe(best.x);
        expect(lowest.y).toBeGreaterThan(best.y);
        expect(lowest.y + lowest.height).toBeCloseTo(main.y + main.height, 0);
      } else {
        expect(best.y).toBeGreaterThan(main.y + main.height - 1);
        expect(lowest.y).toBe(best.y);
        expect(lowest.x).toBeGreaterThan(best.x);
      }
      expect(await overflow(page)).toBe(0);
    });
  }

  test('fit a long scooter name without sticking out', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await storeItems(page, {
      vehicles: { SN1: { scooter_name: 'A'.repeat(80), sku_name: 'B'.repeat(80) } },
      trips: { SN1: monthOfTrips(202401) },
    });
    await page.goto('/');
    await readCharts(page);

    await expect.poll(() => overflow(page)).toBe(0);
    const name = await page.locator('.scooter-name').boundingBox();
    expect(name.x + name.width).toBeLessThanOrEqual(320);
  });
});

test.describe('the units', () => {
  test('sit beside the name of the site, and show the chosen one', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    const units = await page.locator('.units').boundingBox();
    const name = await page.locator('.brand').boundingBox();
    expect(units.x).toBeGreaterThanOrEqual(name.x + name.width);
    expect(units.x + units.width).toBeLessThanOrEqual(320);

    const chosen = page.getByRole('button', { name: 'km', exact: true });
    const other = page.getByRole('button', { name: 'mi', exact: true });
    expect(await cssOf(chosen, 'backgroundColor')).not.toBe(await cssOf(other, 'backgroundColor'));
  });

  test('are large enough to tap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    const button = await page.getByRole('button', { name: 'km', exact: true }).boundingBox();
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(36);
  });
});

test('keeps the footer readable over the rail on a low wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto('/');
  await expect(page.locator('.links')).toHaveCSS('background-color', LIGHT.background);
});

test.describe('the charts', () => {
  test('wait for the font, because text on a canvas does not change later', async ({ page }) => {
    await page.route('**/*.woff2', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Chart.getChart(document.querySelector('.plot canvas')));

    expect(await page.evaluate(() => document.fonts.check('12px Saira'))).toBe(true);
    expect(await page.evaluate(() => Chart.defaults.font.family)).toMatch(/^'Saira'/);
  });

  test('are drawn even if the font does not load', async ({ page }) => {
    await page.route('**/*.woff2', (route) => route.abort());
    await page.goto('/');

    expect((await readCharts(page)).range).toBeTruthy();
  });

  test('change colours with the mode, without a reload', async ({ page }) => {
    const colors = () =>
      page.evaluate(() => {
        const chart = Chart.getChart(document.querySelector('[data-chart="range"] .plot canvas'));
        const line = Chart.getChart(document.querySelector('[data-chart="battery"] .plot canvas'));
        return {
          bands: chart.data.datasets.map(({ backgroundColor }) => backgroundColor),
          battery: line.data.datasets[0].borderColor,
          text: Chart.defaults.color,
          grid: chart.options.scales.y.grid.color,
          tooltip: chart.options.plugins.tooltip.backgroundColor,
        };
      });

    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await readCharts(page);
    expect(await colors()).toEqual({
      bands: ['#0e8c7d', '#c98a06', '#d4483a'],
      battery: '#2c66c9',
      text: '#58656f',
      grid: '#e3e8eb',
      tooltip: '#10171c',
    });

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(colors).toEqual({
      bands: ['#16a394', '#bd8c15', '#c8402f'],
      battery: '#5b8def',
      text: '#8d99a3',
      grid: '#222a31',
      tooltip: '#eef2f5',
    });
    await expect(page.locator('.chart')).toHaveCount(2);
    expect((await readCharts(page)).range).toBeTruthy();
  });

  test('do not animate for a visitor who asks for less motion', async ({ page }) => {
    const animation = () =>
      page.evaluate(() => Chart.getChart(document.querySelector('.plot canvas')).options.animation);

    await page.goto('/');
    await readCharts(page);
    expect(await animation()).toMatchObject({ duration: 300 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await readCharts(page);
    expect(await animation()).toBe(false);
  });

  test('describe themselves to screen readers', async ({ page }) => {
    await page.goto('/');
    await readCharts(page);

    await expect(page.locator('[data-chart="range"] .plot canvas')).toHaveAttribute(
      'aria-label',
      'Stacked bars of the range in km for each month, Jun 2019 to Dec 2023. The values are in the monthly numbers table.',
    );
    await expect(page.locator('[data-chart="battery"] .plot canvas')).toHaveAttribute(
      'aria-label',
      'Line of the battery percent used per km for each month, Jun 2019 to Dec 2023. The values are in the monthly numbers table.',
    );
    await expect(page.locator('[data-chart="range"] .plot canvas')).toHaveAttribute('role', 'img');
  });

  test('fit a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    await readCharts(page);

    expect(await overflow(page)).toBe(0);
    const panel = await page.locator('.chart').first().boundingBox();
    const canvas = await page.locator('.chart canvas').first().boundingBox();
    expect(canvas.x).toBeGreaterThanOrEqual(panel.x);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(canvas.height).toBeGreaterThanOrEqual(240);
  });
});

test.describe('the cookie banner', () => {
  test.beforeEach(({ page }) => showBanner(page));

  for (const [colorScheme, colors] of [['light', LIGHT], ['dark', DARK]]) {
    test(`takes the site's look in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      const banner = page.locator('#cc-main .cm');
      await expect(banner).toBeVisible();

      await expect(banner).toHaveCSS('background-color', colors.panel);
      await expect(banner.locator('.cm__title')).toHaveCSS('color', colors.text);
      await expect(banner).toHaveCSS('font-family', /^Saira,/);
      await expect(banner.getByRole('button', { name: 'Accept' })).toHaveCSS('font-family', /^Saira,/);
    });
  }

  test('underlines its link, like every other link on the site', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('#cc-main .cm').getByRole('link', { name: 'Privacy policy' });
    await expect(link).toHaveCSS('background-size', '100% 1px');
  });

  for (const width of [390, 320]) {
    test(`and its settings fit a width of ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 700 });
      await page.goto('/');
      const banner = page.locator('#cc-main .cm');
      await expect(banner).toBeVisible();
      const box = await banner.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await overflow(page)).toBe(0);

      await banner.getByRole('button', { name: 'Decline' }).click();
      await page.getByRole('button', { name: 'Cookie settings' }).click();
      const settings = page.locator('#cc-main .pm');
      await expect(settings).toBeVisible();
      const settingsBox = await settings.boundingBox();
      expect(settingsBox.x).toBeGreaterThanOrEqual(0);
      expect(settingsBox.x + settingsBox.width).toBeLessThanOrEqual(width);
    });
  }
});

test.describe('the sign-in page', () => {
  for (const width of [1440, 390, 320]) {
    test(`has fields and a button of equal width at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/pull.html');
      const widthOf = async (locator) => (await locator.boundingBox()).width;

      const login = await widthOf(page.getByLabel('Phone number or email'));
      expect(await widthOf(page.getByLabel('Password'))).toBe(login);
      expect(await widthOf(page.getByRole('button', { name: 'Sign in and load your data' }))).toBe(login);
    });
  }

  test('shows the progress only once it has started', async ({ page }) => {
    await page.goto('/pull.html');
    await expect(page.locator('#logs')).toBeHidden();
  });
});

test.describe('the cookies table', () => {
  const table = (page) => page.locator('.cookies table');

  test('labels each value with the name of its column', async ({ page }) => {
    await page.goto('/privacy.html');
    const columns = await table(page).locator('th').allTextContents();
    const rows = await table(page).locator('tbody tr').all();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const labels = await row.locator('td').evaluateAll((cells) => cells.map((cell) => cell.dataset.label));
      expect(labels).toEqual(columns);
    }
  });

  test('stays a table where it fits', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await page.goto('/privacy.html');

    await expect(table(page).locator('th').first()).toBeVisible();
    expect(await cssOf(table(page).locator('td').first(), 'display')).toBe('table-cell');
    expect(await table(page).evaluate((element) => element.scrollWidth - element.parentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  for (const width of [639, 390, 320]) {
    test(`turns each row into a block where it does not fit, at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/privacy.html');

      const cell = table(page).locator('td').first();
      expect(await cssOf(cell, 'display')).toBe('block');
      expect(await cell.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('"Name"');
      expect(await table(page).evaluate((element) => element.scrollWidth - element.parentElement.clientWidth)).toBeLessThanOrEqual(0);
      const code = await table(page).locator('code', { hasText: '_ga_WDN0Q9FRX8' }).boundingBox();
      const panel = await page.locator('.cookies').boundingBox();
      expect(code.x + code.width).toBeLessThanOrEqual(panel.x + panel.width);
    });
  }
});

test('leaves only the data to select on the CSV page', async ({ page }) => {
  await page.goto('/data.html');
  await expect(page.locator('#csv')).toContainText('sn,date,distance,battery');
  expect(await page.locator('body > *:not(script)').count()).toBe(1);
});

test('gives the CSV the whole width on a wide screen, where other pages have a rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/data.html');
  await expect(page.locator('#csv')).toContainText('sn,date,distance,battery');
  expect((await page.locator('#csv').boundingBox()).width).toBe(1440);
});

