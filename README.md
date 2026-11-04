# Niu Stats

Battery range statistics for Niu electric scooters: https://niustats.com

Sign in with your Niu app account. The site downloads your trips and charts, month by month, how far a charge takes you and how much battery each kilometre (or mile) uses.

## Disclaimers

- Your credentials are not stored anywhere. Your data (vehicles, trips) is stored only in your web browser.
- The website is not affiliated with Niu in any way. It is the result of reverse engineering the Niu mobile app. It may give wrong results or stop working at any time.

## How it works

1. `pull.html` sends your login and the MD5 hash of your password to the Niu account API, directly from your browser, and gets an access token.
2. It reads the list of your scooters from the Niu API, also directly from your browser.
3. It reads the trips of each scooter, 100 per page, through `track.php` on this site. The Niu trip list expects the mobile app's `User-Agent` header, which a web page cannot set, so `track.php` forwards the request with it. Your token passes through the server but is not stored.
4. The scooters and trips are saved in your browser's `localStorage`. For each trip that is its date, distance and battery use. `index.html` charts them, and shows example data when nothing is saved. `data.html` lists the saved trips as CSV.

## Statistics

For each trip Niu reports the distance and the battery used, in percentage points. For each scooter and calendar month, the site:

1. Leaves out trips with no battery use, and trips whose battery use per kilometre is above the 98th percentile of all the scooter's trips. These are mostly very short trips and faulty readings, such as more than 100% used on a single trip. With fewer than 50 trips, no trip is above the percentile.
2. Divides the battery used by the distance driven: battery percent per kilometre.
3. Turns that into range: 70 points (from 100% down to 30%) divided by the battery percent per kilometre, plus 10 points each for the bands from 30% to 20% and from 20% to 10%. This assumes the battery drains at the same rate over the whole charge.

The same statistics are available in miles.

## Development

The site in `public/` is plain HTML, JavaScript modules and PHP, with no build step: the files are served exactly as they are in the repository. The page scripts and the modules they share are in `public/js/`.

Requirements: Node.js 24.

```sh
npm ci
npx playwright install chromium   # once, the browser for the tests
npm test                          # unit tests of the modules, then browser tests
npm run serve                     # local preview at http://127.0.0.1:4326/
```

`npm run serve` serves `public/` as static files. `track.php` needs PHP, so downloading data from Niu works only on a PHP host.

The tests never contact real servers. The Niu API is stubbed in each test, and the files the pages load from CDNs come from the same versions installed from npm.

## License

[MIT](LICENSE)
