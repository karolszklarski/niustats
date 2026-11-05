// Copies the browser libraries the site uses, with their licences, from node_modules into public/vendor/,
// so that the pages load them from this site instead of a CDN. Their versions are pinned in package.json;
// after changing one, run: npm run vendor
// tests/unit/vendor.test.js checks that the copies are the files of the installed packages.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** File name in public/vendor/ → path in node_modules. */
export const vendorFiles = {
  'chart.umd.min.js': 'chart.js/dist/chart.umd.min.js',
  'chart.js-LICENSE.md': 'chart.js/LICENSE.md',
  'md5.min.js': 'blueimp-md5/js/md5.min.js',
  'blueimp-md5-LICENSE.txt': 'blueimp-md5/LICENSE.txt',
  'bootstrap.min.css': 'bootstrap/dist/css/bootstrap.min.css',
  'bootstrap-LICENSE.txt': 'bootstrap/LICENSE',
  'cookieconsent.esm.js': 'vanilla-cookieconsent/dist/cookieconsent.esm.js',
  'cookieconsent.css': 'vanilla-cookieconsent/dist/cookieconsent.css',
  'cookieconsent-LICENSE.txt': 'vanilla-cookieconsent/LICENSE',
};

export const vendorPath = (name = '') => fileURLToPath(new URL(`../public/vendor/${name}`, import.meta.url));
export const packagePath = (path) => fileURLToPath(new URL(`../node_modules/${path}`, import.meta.url));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync(vendorPath(), { recursive: true });
  for (const [name, source] of Object.entries(vendorFiles)) {
    copyFileSync(packagePath(source), vendorPath(name));
    console.log(`public/vendor/${name} ← node_modules/${source}`);
  }
}
