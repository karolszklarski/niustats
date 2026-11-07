# Niu Stats

Battery range statistics for Niu electric scooters: https://niustats.com

Sign in with your Niu app account. The site downloads your trips and charts, month by month, how far a charge takes you and how much battery each kilometre (or mile) uses.

## Disclaimers

- Your credentials are not stored anywhere. Your data (vehicles, trips) is stored only in your web browser.
- Google Analytics runs only if you accept it in the cookie banner. Until then, a page contacts no other server, except Niu when you sign in. The [privacy policy](https://niustats.com/privacy.html) has the details.
- A Content Security Policy tells your browser to run scripts only from this site and Google Analytics, and to connect only to this site, Niu and Google Analytics.
- The website is not affiliated with Niu in any way. It is the result of reverse engineering the Niu mobile app. It may give wrong results or stop working at any time.

## How it works

1. `pull.html` sends your login and the MD5 hash of your password to the Niu account API, directly from your browser, and gets an access token.
2. It reads the list of your scooters from the Niu API, also directly from your browser.
3. It reads the trips of each scooter, 100 per page, through `track.php` on this site. The Niu trip list expects the mobile app's `User-Agent` header, which a web page cannot set: the same request sent straight from a browser gets HTTP 500. So `track.php` forwards the request with that header. Your token and Niu's full answer, with all the details of each trip, pass through the server, which stores none of it and sends back only each trip's id, date, distance, battery use and whether it has ended.
4. The scooters and trips are saved in your browser's `localStorage`, together, once all of them have arrived. For each trip that is its date, distance and battery use. A trip that is still going on is left out, because its battery use isn't final. `index.html` charts them, and shows example data when nothing is saved. `data.html` lists the saved trips as CSV.

A request that fails on the way, through a dropped connection or a server error, is tried again after 1, 2 and 4 seconds. An answer from Niu itself, such as a wrong password, ends the download, and the data saved earlier stays as it was. The exception is a scooter whose trips Niu shares only with its owner's permission: the download goes on without them, and the home page says so.

An empty page of trips is asked for three more times before it counts as the end of the list. After a full page, when the list should go on, the same pauses come first. After a shorter page, the usual end of a list, there is no pause, so that the end of every download doesn't take seconds longer.

## Statistics

For each trip Niu reports the distance and the battery used, in percentage points. For each scooter and calendar month, the site:

1. Leaves out faulty and missing readings, by comparing each trip with what the scooter typically uses: the battery use per kilometre that half of the distance ridden stays under. A trip goes if it used more than 3 times the battery its distance should take, plus 2 points, or if its distance should take more than 3 times the battery it used, plus 1 point. That catches more than 100% used on a single trip and a long trip that shows next to nothing. Cold, hills and speed rarely take a real trip that far, and the extra points leave room for whole percents: a short ride can read 2 points however little it should take, and 0 if it should take a point. Trips with no distance, or that gained battery, go too. So the distance ridden shown can be under what the scooter's odometer says.
2. Divides the battery used by the distance ridden: battery percent per kilometre.
3. Turns that into range: 70 points (from 100% down to 30%) divided by the battery percent per kilometre, plus 10 points each for the bands from 30% to 20% and from 20% to 10%. This assumes the battery drains at the same rate over the whole charge.

The same statistics are available in miles.

The home page sums them up for each scooter:

- **Range on a charge:** from 100% down to 10%, from the battery used over the distance ridden in the latest 12 months, counted back from the last trip. If those months hold under 50 km, as after a long break, it comes from all trips.
- **Best and lowest month:** the months with the longest and the shortest range in the whole history.
- **Charts and table:** every month from the first trip to the last, so that a break in riding stays visible.

Niu reports battery use in whole percents, so a short distance says little. On the example scooter, without the months of faulty readings, the range of consecutive trips came within 20% of the range of the whole month in 80% of cases over 10 km, 95% over 20 km and 98% over 50 km. That is one scooter and one rider, so these are rough limits. With little riding the page says less, rather than show a figure it can't back up:

- Below 20 km there is no range, and from 20 to 50 km it is marked as a rough estimate.
- The best and the lowest month count only months of at least 50 km, and take at least two of them.
- A month under 20 km is a gap in the charts and a dash in the table. The charts take at least two months of 20 km.

The limits convert exactly to miles, so changing units changes the figures but not what is shown.

## Development

The site in `public/` is plain HTML, JavaScript modules and PHP, with no build step: the files are served exactly as they are in the repository. The page scripts and the modules they share are in `public/js/`, and the styles in `public/css/site.css`. The libraries and the font the pages use are served from `public/vendor/`, copied from the npm packages pinned in `package.json` with `npm run vendor`.

Requirements: Node.js 24, and Docker for the tests of `track.php` and `.htaccess`.

```sh
npm ci
npx playwright install chromium   # once, the browser for the tests
npm test                          # unit tests, PHP and Apache tests, then browser tests
npm run serve                     # local preview at http://127.0.0.1:4326/
```

`npm run serve` serves `public/` as static files. `track.php` needs PHP, so downloading data from Niu works only on a PHP host.

The tests never contact real servers. The Niu API is stubbed in each test, and any other external request is blocked. `npm run serve` sends the Content Security Policy from `public/.htaccess`, and a browser test fails on anything the policy blocks. `track.php` is tested on PHP 8.5 in Docker, the version the site runs on, against a stub of the Niu API in the same container, and `.htaccess` on Apache with the same PHP version.

## License

[MIT](LICENSE)
