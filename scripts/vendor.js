import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const vendorFiles = {
  'chart.umd.min.js': 'chart.js/dist/chart.umd.min.js',
  'chart.js-LICENSE.md': 'chart.js/LICENSE.md',
  'md5.min.js': 'blueimp-md5/js/md5.min.js',
  'blueimp-md5-LICENSE.txt': 'blueimp-md5/LICENSE.txt',
  'saira-latin-standard-normal.woff2': '@fontsource-variable/saira/files/saira-latin-standard-normal.woff2',
  'saira-latin-ext-standard-normal.woff2': '@fontsource-variable/saira/files/saira-latin-ext-standard-normal.woff2',
  'saira-LICENSE.txt': '@fontsource-variable/saira/LICENSE',
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
