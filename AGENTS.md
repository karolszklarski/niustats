# Instructions for AI coding agents

Niu Stats (https://niustats.com) charts battery range statistics for Niu electric scooters, using the Niu cloud API reverse engineered from the Niu mobile app. How it works for users and how the statistics are computed: [README.md](README.md).

This repository is public and linked from the site.

## Layout

- `public/`: the site exactly as it is served. Plain HTML, JavaScript and PHP, with no build step, so that what runs in the browser can be read in the repository.
  - `index.html`: charts the trips stored in `localStorage`, or the example data from `example.js`.
  - `pull.html`: signs in to Niu and stores the user's scooters and trips in `localStorage`.
  - `data.html`: the stored trips as CSV.
  - `track.php`: forwards trip list requests to Niu with the mobile app's `User-Agent`, which a web page cannot set.
  - `.htaccess`: HTTPS and `www` redirects and cache headers on the host (Apache).
- `scripts/serve.js`: static server for local preview and for the tests. It does not run PHP.
- `tests/e2e/`: Playwright browser tests. `fixtures.js` holds the shared setup.

## Commands

```sh
npm ci
npx playwright install chromium   # once
npm test
npm run serve                     # http://127.0.0.1:4326/
```

## Tests

- **No test contacts a real server.** The Niu API is stubbed per test, CDN files come from the npm packages pinned in `package.json`, and any other external request (Google Analytics included) is aborted. A test must never send real credentials or analytics hits.
- **Every test fails on an uncaught error in the page.**
- **`tests/e2e/__snapshots__/`** holds the monthly statistics computed from the example data. Update a snapshot (`npx playwright test --update-snapshots`) only for an intended change in the numbers, and explain the change in the commit message.

## Conventions

- **Language:** English everywhere in the repository: site, code, comments, tests, documentation, commit messages.
- **Documentation:** describes what exists and why it is done this way. No roadmaps, plans or `TODO` comments.
- **Dependencies:** exact versions, released at least about two weeks earlier. GitHub Actions are pinned to commit SHAs, with the version in a comment.
- **Commits:**
  - imperative subject line, body explaining why;
  - every commit passes the tests;
  - a bug fix comes with its regression test in the same commit.
- **Git:** do not commit, push or create branches unless asked to.
- **Deployment:** the contents of `public/` are copied to the web host, which runs PHP 8.5.
