# Instructions for AI coding agents

Niu Stats (https://niustats.com) charts battery range statistics for Niu electric scooters, using the Niu cloud API reverse engineered from the Niu mobile app. How it works for users and how the statistics are computed: [README.md](README.md).

This repository is public and linked from the site.

## Layout

- `public/`: the site exactly as it is served. Plain HTML, JavaScript modules and PHP, with no build step, so that what runs in the browser can be read in the repository.
  - `index.html` with `js/index.js`: for each scooter of the trips stored in `localStorage`, or of the example data, a summary, two charts with optional distance bars, and a table of months.
  - `pull.html` with `js/pull.js`: signs in to Niu and stores the user's scooters and trips in `localStorage`.
  - `data.html` with `js/data.js`: the same trips as CSV.
  - `privacy.html`: the privacy policy, with the list of cookies and browser storage.
  - `js/consent.js`: the consent banner and Google Analytics, on every page.
  - `js/niu.js`: the Niu API client. `js/stats.js`: the monthly statistics. `js/summary.js`: what the home page says about a scooter, from those statistics, and how little riding is too little. `js/storage.js`: the data in `localStorage`. `js/example.js`: the example data.
  - `css/site.css`: all the styles. Colours are variables, redefined for dark mode, which follows the system. The charts read them in `js/index.js`, and the cookie banner gets them through its own variables.
  - `vendor/`: the Saira font, Chart.js, blueimp-md5 (which hashes the password the way the Niu app does) and vanilla-cookieconsent, with their licences. They are copies of the npm packages pinned in `package.json`, made by `npm run vendor`, never edited by hand. A unit test checks that they match the installed packages.
  - Text that search engines should read stays in the HTML. Scripts add only the charts, the data and the cookie banner.
  - `track.php`: forwards trip list requests to Niu with the mobile app's `User-Agent`, which a web page cannot set. It cannot be replaced by a direct request from the browser: with a valid token, the `v3` and `v2` trip lists answered such a request with HTTP 500 (checked in November 2026), although Niu allows any origin. It accepts only a page number, a serial number and a token of the expected characters, because they go into the request to Niu, and sends back only the trip fields the site uses.
  - `.htaccess`: HTTPS and `www` redirects on the host (Apache), `no-cache` for every file, because file names carry no version, 404 for `.git`, which a copy of the site made by hand from a Git checkout could bring along, and the security headers. Their Content Security Policy lets the pages run scripts only from this site and Google Analytics, and connect only to this site, the Niu API and Google Analytics, because the sign-in page takes the Niu password.
- `scripts/serve.js`: static server for local preview and for the tests. It does not run PHP. It sends the Content Security Policy from `.htaccess`, so the pages run under the same policy as on the host.
- `tests/unit/`: `node:test` tests of the modules in `public/js/`.
- `tests/php/`: `node:test` tests in Docker: `track.php` on PHP, with `niu-stub.php` standing in for the Niu API, and `.htaccess` on Apache.
- `tests/e2e/`: Playwright browser tests. `fixtures.js` holds the shared setup.

## Commands

```sh
npm ci
npx playwright install chromium   # once
npm test                          # test:unit, test:php (needs Docker), then test:e2e
npm run serve                     # http://127.0.0.1:4326/
```

## Tests

- **No test contacts a real server.** The Niu API is stubbed per test, and any other external request (Google Analytics included) is aborted. A test must never send real credentials or analytics hits.
- **`track.php` runs on the PHP version of the host** (`PHP_VERSION` in `tests/php/php-version.js`), with short tags off and every error, warning and deprecation printed, so any of them breaks the JSON answer and fails the test. Before the host moves to a new PHP version, change `PHP_VERSION` and run `npm run test:php`.
- **Every test fails on an uncaught error in the page,** and on anything the Content Security Policy blocks.
- **The banner shows only in `tests/e2e/consent.spec.js` and the banner tests of `tests/e2e/look.spec.js`.** vanilla-cookieconsent shows nothing to automated browsers, so those tests make the page take the test browser for a person. In `consent.spec.js`, Google's script is replaced by a stub that writes the same cookies.
- **`tests/e2e/__snapshots__/`** holds the monthly statistics computed from the example data. Update a snapshot (`npx playwright test --update-snapshots`) only for an intended change in the numbers, and explain the change in the commit message.

## Conventions

- **Language:** English everywhere in the repository: site, code, comments, tests, documentation, commit messages.
- **Consent:** until a visitor accepts, a page contacts no server other than this site, except Niu when the visitor signs in. Libraries, styles and fonts are served from the site. A new cookie, storage key or external service goes into `privacy.html`, with a new date. A new external service also goes into the Content Security Policy in `.htaccess`, and into its test in `tests/php/htaccess.test.js`.
- **Documentation:** describes what exists and why it is done this way. No roadmaps, plans or `TODO` comments.
- **Dependencies:** exact versions, released at least about two weeks earlier. GitHub Actions are pinned to commit SHAs, with the version in a comment.
- **Commits:**
  - imperative subject line, body explaining why;
  - every commit passes the tests;
  - a bug fix comes with its regression test in the same commit.
- **Git:** do not commit, push or create branches unless asked to.
- **Deployment:** a push to `main` runs the tests, then `.github/workflows/deploy.yml` publishes the contents of `public/`, exactly as they are, for the web host, which runs PHP 8.5. Its publish job holds a key that can write to other sites, so it must never run code from this repository. The name of the target repository stays out of this public repository and its logs, in the `DEPLOY_REPOSITORY` secret.
