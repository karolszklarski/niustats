import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { packagePath, vendorFiles, vendorPath } from '../../scripts/vendor.js';

for (const [name, source] of Object.entries(vendorFiles)) {
  test(`public/vendor/${name} is ${source} of the installed package`, () => {
    assert.ok(
      readFileSync(vendorPath(name)).equals(readFileSync(packagePath(source))),
      'The copy differs from the package. Run npm run vendor after changing a version in package.json.',
    );
  });
}

test('public/vendor/ holds only the copied files', () => {
  assert.deepEqual(readdirSync(vendorPath()).sort(), Object.keys(vendorFiles).sort());
});
