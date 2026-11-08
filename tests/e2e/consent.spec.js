import { test, expect, reloadedBy, storeItems } from './fixtures.js';

const PAGES = ['/', '/pull.html', '/data.html', '/privacy.html'];
const GA_SCRIPT = 'https://www.googletagmanager.com/gtag/js?id=G-WDN0Q9FRX8';
const GA_COOKIES = ['_ga', '_ga_WDN0Q9FRX8'];

const isGoogleAnalytics = (url) => url.hostname === 'www.googletagmanager.com';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
});

async function stubGoogleAnalytics(page, baseURL) {
  const external = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(baseURL)) external.push(request.url());
  });
  await page.route(isGoogleAnalytics, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        for (const name of ${JSON.stringify(GA_COOKIES)}) document.cookie = name + '=1; path=/; max-age=63072000';
        localStorage.setItem('_gcl_ls', '1');
      `,
    }),
  );
  return external;
}

const cookieNames = async (page) => (await page.context().cookies()).map(({ name }) => name).sort();
const banner = (page) => page.locator('#cc-main .cm');
const settings = (page) => page.locator('#cc-main .pm');

for (const path of PAGES) {
  test(`${path} asks first and contacts no other server before consent`, async ({ page, baseURL }) => {
    const external = await stubGoogleAnalytics(page, baseURL);
    await page.goto(path, { waitUntil: 'networkidle' });

    await expect(banner(page)).toBeVisible();
    expect(external).toEqual([]);
    expect(await cookieNames(page)).toEqual([]);
  });

  test(`${path} starts Google Analytics after Accept, and on later visits`, async ({ page, baseURL }) => {
    const external = await stubGoogleAnalytics(page, baseURL);
    await page.goto(path);

    await banner(page).getByRole('button', { name: 'Accept' }).click();
    await expect.poll(() => cookieNames(page)).toEqual(['_ga', '_ga_WDN0Q9FRX8', 'cc_cookie'].sort());
    expect(external).toEqual([GA_SCRIPT]);
    await expect(banner(page)).toBeHidden();

    await page.reload({ waitUntil: 'networkidle' });
    await expect(banner(page)).toBeHidden();
    expect(external).toEqual([GA_SCRIPT, GA_SCRIPT]);
  });

  test(`${path} contacts no other server after Decline, and on later visits`, async ({ page, baseURL }) => {
    const external = await stubGoogleAnalytics(page, baseURL);
    await page.goto(path);

    await banner(page).getByRole('button', { name: 'Decline' }).click();
    await expect(banner(page)).toBeHidden();
    expect(await cookieNames(page)).toEqual(['cc_cookie']);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(banner(page)).toBeHidden();
    expect(external).toEqual([]);
    expect(await cookieNames(page)).toEqual(['cc_cookie']);
  });
}

test('gives Accept and Decline equal weight and links the policy', async ({ page }) => {
  await page.goto('/');
  const accept = banner(page).getByRole('button', { name: 'Accept' });
  const decline = banner(page).getByRole('button', { name: 'Decline' });
  const look = (button) =>
    button.evaluate((element) => {
      const { backgroundColor, color, fontSize, fontWeight } = getComputedStyle(element);
      return { backgroundColor, color, fontSize, fontWeight };
    });

  expect(await look(accept)).toEqual(await look(decline));
  await expect(banner(page).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy.html');
});

test('tells Google not to use the data for advertising before anything else', async ({ page, baseURL }) => {
  await stubGoogleAnalytics(page, baseURL);
  await page.goto('/');
  await banner(page).getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => cookieNames(page)).toContain('_ga');

  const commands = await page.evaluate(() => window.dataLayer.map((command) => [...command]));
  expect(commands[0]).toEqual([
    'consent',
    'default',
    { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' },
  ]);
  expect(commands.slice(1).map(([name]) => name)).toEqual(['js', 'config']);
  expect(commands[2][1]).toBe('G-WDN0Q9FRX8');
});

test('withdrawing consent removes the traces of Google Analytics and keeps the visitor\'s data', async ({ page, baseURL }) => {
  const external = await stubGoogleAnalytics(page, baseURL);
  await storeItems(page, { units: 'mi', vehicles: {}, trips: {} });
  await page.goto('/');
  await banner(page).getByRole('button', { name: 'Accept' }).click();
  await expect.poll(() => cookieNames(page)).toContain('_ga');
  external.length = 0;

  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await reloadedBy(page, () => settings(page).getByRole('button', { name: 'Decline' }).click());
  await page.waitForLoadState('networkidle');

  expect(await cookieNames(page)).toEqual(['cc_cookie']);
  expect(external).toEqual([]);
  const stored = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(stored).toEqual(['trips', 'units', 'vehicles']);
  await expect(banner(page)).toBeHidden();
});

test('consent given later starts Google Analytics without a reload', async ({ page, baseURL }) => {
  const external = await stubGoogleAnalytics(page, baseURL);
  await page.goto('/');
  await banner(page).getByRole('button', { name: 'Decline' }).click();
  await expect(banner(page)).toBeHidden();

  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await settings(page).getByRole('button', { name: 'Accept' }).click();

  await expect.poll(() => cookieNames(page)).toContain('_ga');
  expect(external).toEqual([GA_SCRIPT]);
});

test('declining removes cookies left by Google Analytics before the banner existed', async ({ page, baseURL }) => {
  await stubGoogleAnalytics(page, baseURL);
  await page.context().addCookies(GA_COOKIES.map((name) => ({ name, value: '1', url: baseURL })));
  await page.goto('/');

  await banner(page).getByRole('button', { name: 'Decline' }).click();

  await expect.poll(() => cookieNames(page)).toEqual(['cc_cookie']);
});

for (const path of ['/', '/pull.html', '/privacy.html']) {
  test(`${path} links the policy and opens the cookie settings`, async ({ page }) => {
    await page.goto(path);
    await banner(page).getByRole('button', { name: 'Decline' }).click();

    const footer = page.locator('.links');
    await expect(footer.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy.html');
    await footer.getByRole('button', { name: 'Cookie settings' }).click();
    await expect(settings(page)).toBeVisible();
  });
}

test('the policy names the controller and everything the site stores', async ({ page }) => {
  await page.goto('/privacy.html');

  await expect(page.getByRole('link', { name: 'szklarskikarol@gmail.com' })).toHaveAttribute(
    'href',
    'mailto:szklarskikarol@gmail.com',
  );
  const table = page.locator('table');
  for (const name of ['cc_cookie', ...GA_COOKIES, 'vehicles', 'trips', 'units']) {
    await expect(table.locator('code', { hasText: new RegExp(`^${name}$`) })).toHaveCount(1);
  }
});
