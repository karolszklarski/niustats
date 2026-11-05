# Niu Stats

Battery range statistics for Niu electric scooters: https://niustats.com

Sign in with your Niu app account. The site downloads your trips and charts, month by month, how far a charge takes you and how much battery each kilometre (or mile) uses.

## Disclaimers

- Your credentials are not stored anywhere. Your data (vehicles, trips) is stored only in your web browser.
- Google Analytics runs only if you accept it in the cookie banner. Until then, a page contacts no other server, except Niu when you sign in. The [privacy policy](https://niustats.com/privacy.html) has the details.
- The website is not affiliated with Niu in any way. It is the result of reverse engineering the Niu mobile app. It may give wrong results or stop working at any time.

## How it works

1. `pull.html` sends your login and the MD5 hash of your password to the Niu account API, directly from your browser, and gets an access token.
2. It reads the list of your scooters from the Niu API, also directly from your browser.
3. It reads the trips of each scooter, 100 per page, through `track.php` on this site. The Niu trip list expects the mobile app's `User-Agent` header, which a web page cannot set: the same request sent straight from a browser gets HTTP 500. So `track.php` forwards the request with that header. Your token and Niu's full answer, with all the details of each trip, pass through the server, which stores none of it and sends back only each trip's id, date, distance and battery use.
4. The scooters and trips are saved in your browser's `localStorage`, together, once all of them have arrived. For each trip that is its date, distance and battery use. `index.html` charts them, and shows example data when nothing is saved. `data.html` lists the saved trips as CSV.

A request that fails on the way, through a dropped connection or a server error, is tried again after 1, 2 and 4 seconds. An answer from Niu itself, such as a wrong password, ends the download, and the data saved earlier stays as it was.

## Statistics

For each trip Niu reports the distance and the battery used, in percentage points. For each scooter and calendar month, the site:

1. Leaves out trips with no battery use, and trips whose battery use per kilometre is above the 98th percentile of all the scooter's trips. These are mostly very short trips and faulty readings, such as more than 100% used on a single trip. With fewer than 50 trips the percentile would leave nothing out, so the site leaves out trips above 5% per kilometre instead.
2. Divides the battery used by the distance ridden: battery percent per kilometre.
3. Turns that into range: 70 points (from 100% down to 30%) divided by the battery percent per kilometre, plus 10 points each for the bands from 30% to 20% and from 20% to 10%. This assumes the battery drains at the same rate over the whole charge.

The same statistics are available in miles.

## Development

The site in `public/` is plain HTML, JavaScript modules and PHP, with no build step: the files are served exactly as they are in the repository. The page scripts and the modules they share are in `public/js/`. The libraries the pages use are served from `public/vendor/`, copied from the npm packages pinned in `package.json` with `npm run vendor`.

Requirements: Node.js 24, and Docker for the tests of `track.php` and `.htaccess`.

```sh
npm ci
npx playwright install chromium   # once, the browser for the tests
npm test                          # unit tests, PHP and Apache tests, then browser tests
npm run serve                     # local preview at http://127.0.0.1:4326/
```

`npm run serve` serves `public/` as static files. `track.php` needs PHP, so downloading data from Niu works only on a PHP host.

The tests never contact real servers. The Niu API is stubbed in each test, and any other external request is blocked. `track.php` is tested on PHP 8.5 in Docker, the version the site runs on, against a stub of the Niu API in the same container, and `.htaccess` on Apache with the same PHP version.

## License

[MIT](LICENSE)
